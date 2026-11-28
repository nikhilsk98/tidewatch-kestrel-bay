import { addDays } from "@/lib/dates";
import { formatDate, formatQty } from "@/lib/format";
import type { ItemDetail } from "@/lib/itemDetail";
import type { ItemPlan } from "@/lib/projection";
import { Pill } from "./Pill";

const WEEKS_SHOWN = 12;

type Props = { detail: ItemDetail; plan: ItemPlan; planningDate: string };

/**
 * Last 12 weeks of actual sales beside the next 12 weeks of forecast.
 * Weeks are counted from the planning date: "1 week ago" is the 7 days before it.
 */
export function DemandWeeks({ detail, plan, planningDate }: Props) {
  const uom = plan.sellUom;
  // The API lists only weeks with sales; a week with none sold shows as zero.
  const actualByWeek = new Map(detail.recentWeeks.map((w) => [w.weeksAgo, w.qty]));
  const pastWeeks = Array.from({ length: WEEKS_SHOWN }, (_, i) => WEEKS_SHOWN - i); // 12 .. 1
  const estimated = new Map(plan.estimatedWeeks.map((e) => [e.weekAhead, e]));
  const nextWeeks = plan.weeklyForecast.slice(0, WEEKS_SHOWN);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <table className="w-full text-sm tabular-nums">
          <caption className="pb-1 text-left text-xs font-medium text-ink-muted">
            Last {WEEKS_SHOWN} weeks: actual sales
          </caption>
          <thead className="sr-only">
            <tr>
              <th scope="col">Week ending</th>
              <th scope="col">Sold</th>
            </tr>
          </thead>
          <tbody>
            {pastWeeks.map((weeksAgo) => (
              <tr key={weeksAgo} className="border-t border-line">
                <td className="py-1">w/e {formatDate(addDays(planningDate, -7 * weeksAgo + 6), "short")}</td>
                <td className="py-1 text-right">{formatQty(actualByWeek.get(weeksAgo) ?? 0, uom)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <table className="w-full text-sm tabular-nums">
          <caption className="pb-1 text-left text-xs font-medium text-ink-muted">
            Next {WEEKS_SHOWN} weeks: forecast (same weeks last year)
          </caption>
          <thead className="sr-only">
            <tr>
              <th scope="col">Week ending</th>
              <th scope="col">Forecast</th>
            </tr>
          </thead>
          <tbody>
            {nextWeeks.map((qty, weekAhead) => (
              <tr key={weekAhead} className="border-t border-line">
                <td className="py-1">w/e {formatDate(addDays(planningDate, 7 * weekAhead + 6), "short")}</td>
                <td className="py-1 text-right">
                  {estimated.has(weekAhead) && (
                    <span className="mr-2">
                      <Pill tone="review">estimated</Pill>
                    </span>
                  )}
                  {formatQty(qty, uom)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {plan.estimatedWeeks.length > 0 && (
        <div className="mt-3 rounded-xl bg-amber-bg p-3 text-sm text-amber-ink">
          <p className="font-medium">Why some weeks are estimated</p>
          <p className="mt-1">
            Last year this item shipped nothing in these weeks while it was out of stock, so
            copying last year would forecast no demand. Tidewatch uses an estimate instead:
          </p>
          <ul className="mt-1 list-disc pl-5 tabular-nums">
            {plan.estimatedWeeks.map((e) => (
              <li key={e.weekAhead}>
                w/e {formatDate(addDays(planningDate, 7 * e.weekAhead + 6), "short")}: last year
                shipped {formatQty(e.lastYearRecorded, uom)}; using {formatQty(e.estimate, uom)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {detail.excludedSales.length > 0 && (
        <p className="mt-3 text-xs text-ink-muted">
          Not counted as demand:{" "}
          {detail.excludedSales
            .map((s) => `${s.reason ?? "other"} (${s.lines} ${s.lines === 1 ? "line" : "lines"})`)
            .join(", ")}
          .
        </p>
      )}
    </>
  );
}
