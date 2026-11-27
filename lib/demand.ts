import { query } from "@/lib/db";
import type { Settings } from "@/lib/settings";

const WEEKS_PER_YEAR = 52; // 364 days back lands on the same weekday last year
const MAX_GAP_WEEKS = 6; // a longer run of zero weeks looks like a stopped item, not a stockout
const RECENT_WEEKS = 8; // fallback when last year has no matching week

/** A forecast week whose last-year value was estimated because sales stopped (likely a stockout). */
export type EstimatedWeek = {
  weekAhead: number; // 0 = the week starting on the planning date
  lastYearRecorded: number; // what was actually shipped that week last year (0)
  estimate: number; // what Tidewatch uses instead
};

/** Expected normal demand per week ahead, for one item, in its sell_uom. */
export type DemandForecast = {
  itemCode: string;
  weekly: number[]; // index 0 = week starting on the planning date
  estimated: EstimatedWeek[];
};

/**
 * Fill runs of zero weeks that sit between normal selling weeks, which is
 * what a stockout looks like in sales history: demand didn't stop, stock did.
 * Each gap is filled with the average of the last two selling weeks before it.
 */
function fillStockoutGaps(history: number[]): {
  corrected: number[];
  filled: Set<number>;
} {
  const corrected = [...history];
  const filled = new Set<number>();
  let i = 0;
  while (i < history.length) {
    if (history[i] !== 0) {
      i++;
      continue;
    }
    let j = i;
    while (j < history.length && history[j] === 0) j++; // zero run is weeks i..j-1
    const before = history
      .slice(0, i)
      .filter((v) => v > 0)
      .slice(-2);
    const salesResume = j < history.length;
    if (before.length === 2 && salesResume && j - i <= MAX_GAP_WEEKS) {
      const estimate = (before[0] + before[1]) / 2;
      for (let k = i; k < j; k++) {
        corrected[k] = estimate;
        filled.add(k);
      }
    }
    i = j;
  }
  return { corrected, filled };
}

/**
 * Weekly demand forecast for every item with sales history.
 * Dana: "last year's same-season sales are fine", so each week ahead uses
 * the same week last year (364 days back, same weekday), with stockout weeks
 * estimated instead of copied as zero.
 */
export async function getDemandForecasts(
  settings: Settings,
): Promise<Map<string, DemandForecast>> {
  // Normal demand per item per week, counted back from the planning date:
  // week -1 = the 7 days before it, week -52 = the same week last year.
  const rows = await query<{ item_code: string; week: number; qty: number }>(
    `SELECT item_code,
            floor((ship_date - $1::date) / 7.0)::int AS week,
            sum(qty) AS qty
     FROM sales
     WHERE is_demand AND ship_date < $1::date
     GROUP BY item_code, week`,
    [settings.today],
  );
  if (rows.length === 0) return new Map();

  const firstWeek = Math.min(...rows.map((r) => r.week)); // oldest week in the data (negative)
  const length = -firstWeek; // weeks firstWeek .. -1
  const byItem = new Map<string, number[]>();
  for (const row of rows) {
    const history = byItem.get(row.item_code) ?? new Array(length).fill(0);
    history[row.week - firstWeek] = row.qty;
    byItem.set(row.item_code, history);
  }

  const forecasts = new Map<string, DemandForecast>();
  for (const [itemCode, history] of byItem) {
    const { corrected, filled } = fillStockoutGaps(history);
    const recent = corrected.slice(-RECENT_WEEKS);
    const recentAverage = recent.reduce((a, b) => a + b, 0) / recent.length;

    const weekly: number[] = [];
    const estimated: EstimatedWeek[] = [];
    for (let weekAhead = 0; weekAhead < settings.projectionWeeks; weekAhead++) {
      const index = weekAhead - WEEKS_PER_YEAR - firstWeek; // same week last year
      if (index < 0 || index >= corrected.length) {
        weekly.push(recentAverage); // no matching week: use recent pace
        continue;
      }
      weekly.push(corrected[index]);
      if (filled.has(index)) {
        estimated.push({
          weekAhead,
          lastYearRecorded: history[index],
          estimate: corrected[index],
        });
      }
    }
    forecasts.set(itemCode, { itemCode, weekly, estimated });
  }
  return forecasts;
}
