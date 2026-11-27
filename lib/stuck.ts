import { query } from "@/lib/db";
import { daysBetween } from "@/lib/dates";
import { getItemPlans } from "@/lib/projection";
import { loadPlanningRules } from "@/lib/settings";

/** Why a lot is in "Stuck with". */
export type StuckGroup = "aging" | "unavailable";
// aging      = too old to sell at full value: inside the 6-month line, expired,
//              or expected to pass the line before it sells (Dana's second question)
// unavailable = can't be sold for another reason: damaged, on QA hold, expiry unknown

/** One lot Dana is stuck with, or will be. Quantity in the item's sell_uom. */
export type StuckLot = {
  itemCode: string;
  description: string;
  sellUom: string;
  lotNo: string;
  location: string;
  atHarbor: boolean; // Harbor Cold Storage charges by the pallet each month (Walt)
  qty: number; // the stuck part of the lot
  unitCost: number | null;
  value: number | null; // qty x unit cost, in the books' currency (documented assumption)
  expiryDate: string | null;
  sellableUntil: string | null; // last day it counted for sales
  receivedDate: string | null;
  receivedDaysAgo: number | null;
  receivedLongAgo: boolean; // received at least aging_received_days ago (our assumption, not Dana's)
  group: StuckGroup;
  reason: string; // plain English, shown to Dana
};

export type StuckSummary = {
  lots: number;
  totalValue: number;
  agingValue: number;
  unavailableValue: number;
  harborValue: number;
};

const AGING_REASONS = ["Inside", "Expired"]; // reasons from lot_status that mean "too old"
const cents = (n: number) => Math.round(n * 100) / 100;

/**
 * Everything Dana is stuck with now, plus stock expected to pass the
 * 6-month line before it sells (from the projection). Biggest value first.
 */
export async function getStuckStock(): Promise<{
  summary: StuckSummary;
  lots: StuckLot[];
}> {
  const { settings } = await loadPlanningRules();

  const [rows, plans] = await Promise.all([
    query<{
      lot_no: string;
      item_code: string;
      description: string;
      sell_uom: string;
      location: string;
      qty: number;
      unit_cost: number | null;
      expiry_date: string | null;
      sellable_until: string | null;
      received_date: string | null;
      unavailable_reason: string | null;
    }>(`
      SELECT ls.lot_no, ls.item_code, i.description, i.sell_uom, ls.location, ls.qty,
             ls.unit_cost, ls.expiry_date, ls.sellable_until, ls.received_date,
             ls.unavailable_reason
      FROM lot_status ls
      JOIN items i ON i.item_code = ls.item_code
    `),
    getItemPlans(),
  ]);

  // lot number -> part expected to pass its last sellable day unsold
  const willExpire = new Map<
    string,
    { qty: number; lastSellableDay: string }
  >();
  for (const plan of plans) {
    for (const e of plan.willExpireUnsold) willExpire.set(e.lotNo, e);
  }

  const lots: StuckLot[] = [];
  for (const row of rows) {
    let qty: number;
    let reason: string;
    let group: StuckGroup;

    if (row.unavailable_reason) {
      // Stuck today.
      qty = row.qty;
      reason = row.unavailable_reason;
      group = AGING_REASONS.some((r) => reason.startsWith(r))
        ? "aging"
        : "unavailable";
    } else if (willExpire.has(row.lot_no)) {
      // Sellable today, but expected to pass the line before it sells.
      const e = willExpire.get(row.lot_no)!;
      qty = e.qty;
      reason = `Expected to pass the ${settings.expiryCutoffMonths}-month line unsold after ${e.lastSellableDay}`;
      group = "aging";
    } else {
      continue; // not stuck
    }

    const receivedDaysAgo = row.received_date
      ? daysBetween(row.received_date, settings.today)
      : null;
    lots.push({
      itemCode: row.item_code,
      description: row.description,
      sellUom: row.sell_uom,
      lotNo: row.lot_no,
      location: row.location,
      atHarbor: row.location === "HCS",
      qty,
      unitCost: row.unit_cost,
      value: row.unit_cost === null ? null : cents(qty * row.unit_cost),
      expiryDate: row.expiry_date,
      sellableUntil: row.sellable_until,
      receivedDate: row.received_date,
      receivedDaysAgo,
      receivedLongAgo:
        receivedDaysAgo !== null &&
        receivedDaysAgo >= settings.agingReceivedDays,
      group,
      reason,
    });
  }

  lots.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const sum = (list: StuckLot[]) =>
    cents(list.reduce((t, lot) => t + (lot.value ?? 0), 0));
  return {
    summary: {
      lots: lots.length,
      totalValue: sum(lots),
      agingValue: sum(lots.filter((l) => l.group === "aging")),
      unavailableValue: sum(lots.filter((l) => l.group === "unavailable")),
      harborValue: sum(lots.filter((l) => l.atHarbor)),
    },
    lots,
  };
}
