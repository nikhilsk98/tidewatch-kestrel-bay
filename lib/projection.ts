import { query } from "@/lib/db";
import { addDays, daysBetween } from "@/lib/dates";
import { getDemandForecasts, type EstimatedWeek } from "@/lib/demand";
import {
  countsInScenario,
  getIncomingPOs,
  type IncomingPO,
} from "@/lib/incoming";
import { loadPlanningRules } from "@/lib/settings";
import { getStockPositions, type StockPosition } from "@/lib/stock";

const ORDER_SOON_DAYS = 14; // "order soon" = the order-by date is within two weeks
const NEVER = "9999-12-31"; // sellable-until for stock that won't expire within the projection
const EPS = 1e-9; // ignore floating-point crumbs when checking "anything left?"

// ---------------------------------------------------------------------
// The projection itself: a pure function, no database. Walks forward one
// day at a time from the planning date, selling the oldest stock first.
// ---------------------------------------------------------------------

/** A sellable lot: how much, the last day it counts for sales, and its lot number (none for PO arrivals). */
type PoolLot = { qty: number; sellableUntil: string; lotNo?: string };

/** Part of a lot that reaches its last sellable day without being sold: future stuck stock. */
export type ExpiresUnsold = {
  lotNo: string;
  qty: number;
  lastSellableDay: string;
};

type ProjectionInput = {
  today: string;
  days: number; // how far ahead to walk
  lots: PoolLot[]; // lots sellable on the planning date
  corrections: number; // count corrections, applied on day 0 (usually negative)
  booked: Map<number, number>; // day offset -> open-order quantity shipping that day
  weeklyForecast: number[]; // normal demand per week ahead
  arrivals: Map<number, number>; // day offset -> PO quantity arriving (scenario only)
};

export type Projection = {
  runOutDate: string | null; // first day demand can't be met; null = lasts the whole projection
  weeklyEndStock: number[]; // sellable stock left at the end of each week (for the chart)
  expiresUnsold: ExpiresUnsold[]; // lots that cross their last sellable day with stock left
};

export function project(input: ProjectionInput): Projection {
  const pool = input.lots.map((lot) => ({ ...lot })); // copy, so the caller's data isn't changed

  // Take `amount` from the pool, oldest sellable-until first. Returns what couldn't be met.
  const take = (amount: number): number => {
    pool.sort((a, b) =>
      a.sellableUntil < b.sellableUntil
        ? -1
        : a.sellableUntil > b.sellableUntil
          ? 1
          : 0,
    );
    let left = amount;
    for (const lot of pool) {
      const used = Math.min(lot.qty, left);
      lot.qty -= used;
      left -= used;
      if (left <= EPS) break;
    }
    for (let i = pool.length - 1; i >= 0; i--)
      if (pool[i].qty <= EPS) pool.splice(i, 1);
    return left;
  };

  // Booked orders and the forecast overlap: per week, only forecast demand
  // ABOVE what's already booked is added, spread evenly over the 7 days.
  // Booked orders themselves leave on their own ship dates.
  const weeks = input.weeklyForecast.length;
  const bookedPerWeek = new Array(weeks).fill(0);
  for (const [day, qty] of input.booked) {
    const week = Math.floor(day / 7);
    if (week < weeks) bookedPerWeek[week] += qty;
  }
  const extraPerDay = input.weeklyForecast.map(
    (f, w) => Math.max(f - bookedPerWeek[w], 0) / 7,
  );

  let runOutDay: number | null = null;
  if (input.corrections < 0 && take(-input.corrections) > EPS) runOutDay = 0;
  if (input.corrections > 0)
    pool.push({ qty: input.corrections, sellableUntil: NEVER });

  const weeklyEndStock: number[] = [];
  const expiresUnsold: ExpiresUnsold[] = [];
  for (let day = 0; day < input.days; day++) {
    const date = addDays(input.today, day);

    const arriving = input.arrivals.get(day);
    if (arriving) pool.push({ qty: arriving, sellableUntil: NEVER });

    // Lots past their last sellable day stop counting (Dana's 6-month rule over time).
    // Whatever is left of them becomes future stuck stock.
    for (let i = pool.length - 1; i >= 0; i--) {
      const lot = pool[i];
      if (lot.sellableUntil < date) {
        if (lot.lotNo) {
          expiresUnsold.push({
            lotNo: lot.lotNo,
            qty: Math.round(lot.qty * 10) / 10,
            lastSellableDay: lot.sellableUntil,
          });
        }
        pool.splice(i, 1);
      }
    }

    const demand =
      (input.booked.get(day) ?? 0) + (extraPerDay[Math.floor(day / 7)] ?? 0);
    if (take(demand) > EPS && runOutDay === null) runOutDay = day;

    if (day % 7 === 6) {
      weeklyEndStock.push(
        Math.round(pool.reduce((sum, lot) => sum + lot.qty, 0) * 10) / 10,
      );
    }
  }

  return {
    runOutDate: runOutDay === null ? null : addDays(input.today, runOutDay),
    weeklyEndStock,
    expiresUnsold,
  };
}

// ---------------------------------------------------------------------
// Turning a run-out date into a buying decision.
// ---------------------------------------------------------------------

export type PlanStatus =
  | "order now"
  | "order soon"
  | "ok"
  | "lead time not set"
  | "not reordered";

function decide(
  runOutDate: string | null,
  leadPlusBuffer: number | null,
  today: string,
) {
  if (leadPlusBuffer === null)
    return { status: "lead time not set" as PlanStatus, orderByDate: null };
  if (runOutDate === null)
    return { status: "ok" as PlanStatus, orderByDate: null };
  // An order must arrive, plus cushion, before the run-out date.
  const orderByDate = addDays(runOutDate, -leadPlusBuffer);
  const daysLeft = daysBetween(today, orderByDate);
  const status: PlanStatus =
    daysLeft <= 0
      ? "order now"
      : daysLeft <= ORDER_SOON_DAYS
        ? "order soon"
        : "ok";
  return { status, orderByDate };
}

/** Everything Tidewatch knows about one item's buying position. */
export type ItemPlan = StockPosition & {
  leadTimeDays: number | null;
  bufferDays: number | null;
  status: PlanStatus; // from the safe view: no PO counted
  runOutDate: string | null; // safe view
  orderByDate: string | null; // safe view: run-out minus lead time and cushion
  daysUntilOrderBy: number | null; // negative = already late by that many days
  arrivesIfOrderedToday: string | null; // planning date + lead time: the earliest a new order could land
  scenarioStatus: PlanStatus; // "if vendor dates hold"
  scenarioRunOutDate: string | null;
  flags: {
    onlyOverdueCover: boolean; // needs ordering and its only incoming cover is overdue (Dana asked)
    dependsOnUnconfirmedDelivery: boolean; // safe view says order; scenario says fine only if POs arrive on time
    estimatedDemand: boolean; // part of the forecast estimated over a past stockout
  };
  weeklyForecast: number[];
  estimatedWeeks: EstimatedWeek[];
  incoming: (IncomingPO & { countsInScenario: boolean })[];
  safeWeeklyEndStock: number[];
  scenarioWeeklyEndStock: number[];
  willExpireUnsold: ExpiresUnsold[]; // lots expected to pass their last sellable day unsold
};

/** The buying plan for every item. Checks Dana's settings first. */
export async function getItemPlans(): Promise<ItemPlan[]> {
  const { settings, vendors } = await loadPlanningRules();
  const days = settings.projectionWeeks * 7;

  const [positions, forecasts, incomingByItem, lotRows, bookedRows] =
    await Promise.all([
      getStockPositions(),
      getDemandForecasts(settings),
      getIncomingPOs(),
      query<{
        item_code: string;
        lot_no: string;
        qty: number;
        sellable_until: string;
      }>(
        "SELECT item_code, lot_no, qty, sellable_until FROM lot_status WHERE is_sellable",
      ),
      query<{ item_code: string; day: number; qty: number }>(
        `SELECT item_code, greatest(ship_date - $1::date, 0) AS day, sum(qty) AS qty
       FROM sales WHERE status = 'OPEN'
       GROUP BY item_code, day`,
        [settings.today],
      ),
    ]);

  const lotsByItem = new Map<string, PoolLot[]>();
  for (const row of lotRows) {
    const list = lotsByItem.get(row.item_code) ?? [];
    list.push({
      qty: row.qty,
      sellableUntil: row.sellable_until,
      lotNo: row.lot_no,
    });
    lotsByItem.set(row.item_code, list);
  }
  const bookedByItem = new Map<string, Map<number, number>>();
  for (const row of bookedRows) {
    const byDay = bookedByItem.get(row.item_code) ?? new Map<number, number>();
    byDay.set(row.day, (byDay.get(row.day) ?? 0) + row.qty);
    bookedByItem.set(row.item_code, byDay);
  }

  return positions.map((position) => {
    const code = position.itemCode;
    const vendor = vendors.get(position.vendorCode);
    const leadPlusBuffer = vendor
      ? vendor.leadTimeDays + vendor.bufferDays
      : null;
    const forecast = forecasts.get(code);
    const weeklyForecast =
      forecast?.weekly ?? new Array(settings.projectionWeeks).fill(0);
    const incoming = (incomingByItem.get(code) ?? []).map((po) => ({
      ...po,
      countsInScenario: countsInScenario(po),
    }));

    const base = {
      today: settings.today,
      days,
      lots: lotsByItem.get(code) ?? [],
      corrections: position.corrections,
      booked: bookedByItem.get(code) ?? new Map<number, number>(),
      weeklyForecast,
    };
    const scenarioArrivals = new Map<number, number>();
    for (const po of incoming) {
      if (!po.countsInScenario || !po.expectedDate) continue;
      const day = daysBetween(settings.today, po.expectedDate);
      if (day >= 0 && day < days)
        scenarioArrivals.set(day, (scenarioArrivals.get(day) ?? 0) + po.qty);
    }

    const safe = project({ ...base, arrivals: new Map() }); // main screen: no PO counted
    const scenario = project({ ...base, arrivals: scenarioArrivals }); // if vendor dates hold

    let safeDecision = decide(safe.runOutDate, leadPlusBuffer, settings.today);
    let scenarioDecision = decide(
      scenario.runOutDate,
      leadPlusBuffer,
      settings.today,
    );
    if (!position.reorderEnabled) {
      // Stock stays visible; Tidewatch just doesn't suggest buying it.
      safeDecision = { status: "not reordered", orderByDate: null };
      scenarioDecision = { status: "not reordered", orderByDate: null };
    }
    const needsOrder =
      safeDecision.status === "order now" ||
      safeDecision.status === "order soon";

    return {
      ...position,
      leadTimeDays: vendor?.leadTimeDays ?? null,
      bufferDays: vendor?.bufferDays ?? null,
      status: safeDecision.status,
      runOutDate: safe.runOutDate,
      orderByDate: safeDecision.orderByDate,
      daysUntilOrderBy: safeDecision.orderByDate
        ? daysBetween(settings.today, safeDecision.orderByDate)
        : null,
      arrivesIfOrderedToday: vendor
        ? addDays(settings.today, vendor.leadTimeDays)
        : null,
      scenarioStatus: scenarioDecision.status,
      scenarioRunOutDate: scenario.runOutDate,
      flags: {
        onlyOverdueCover:
          needsOrder &&
          incoming.some((po) => po.isOverdue) &&
          !incoming.some((po) => po.countsInScenario),
        dependsOnUnconfirmedDelivery:
          needsOrder && scenarioDecision.status === "ok",
        estimatedDemand: (forecast?.estimated.length ?? 0) > 0,
      },
      weeklyForecast,
      estimatedWeeks: forecast?.estimated ?? [],
      incoming,
      safeWeeklyEndStock: safe.weeklyEndStock,
      scenarioWeeklyEndStock: scenario.weeklyEndStock,
      // From the safe view. New stock arrives with no expiry and is sold after
      // older lots, so POs don't change which old lots expire unsold.
      willExpireUnsold: safe.expiresUnsold,
    };
  });
}
