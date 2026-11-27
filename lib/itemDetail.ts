import { query } from "@/lib/db";
import { getItemPlans, type ItemPlan } from "@/lib/projection";
import { loadPlanningRules } from "@/lib/settings";

/** Everything the item detail page shows: the plan, plus the evidence behind it. */
export type ItemDetail = {
  plan: ItemPlan;
  lots: {
    lotNo: string;
    location: string;
    qty: number;
    expiryDate: string | null;
    sellableUntil: string | null;
    receivedDate: string | null;
    unitCost: number | null;
    isSellable: boolean;
    unavailableReason: string | null; // why it doesn't count, in plain English
  }[];
  openOrders: {
    orderNo: string;
    lineNo: number;
    shipDate: string;
    customerCode: string | null;
    qty: number;
  }[];
  corrections: { ref: string; qty: number }[];
  recentWeeks: { weeksAgo: number; qty: number }[]; // normal demand, last 12 weeks
  excludedSales: { reason: string; lines: number; qty: number }[]; // sales that didn't count, and why
  handled: {
    id: number;
    qty: number | null;
    expectedDate: string | null;
    note: string | null;
    createdAt: string;
  }[];
  cleaningNotes: {
    sourceFile: string;
    detail: string | null;
    action: string;
    reason: string;
  }[];
};

/** The item detail for one item code, or null if there's no such item. */
export async function getItemDetail(
  itemCode: string,
): Promise<ItemDetail | null> {
  const { settings } = await loadPlanningRules();
  const plan = (await getItemPlans()).find((p) => p.itemCode === itemCode);
  if (!plan) return null;

  const [
    lots,
    openOrders,
    corrections,
    recentWeeks,
    excludedSales,
    handled,
    cleaningNotes,
  ] = await Promise.all([
    query<ItemDetail["lots"][number]>(
      `SELECT lot_no AS "lotNo", location, qty, expiry_date AS "expiryDate",
              sellable_until AS "sellableUntil", received_date AS "receivedDate",
              unit_cost AS "unitCost", is_sellable AS "isSellable",
              unavailable_reason AS "unavailableReason"
       FROM lot_status WHERE item_code = $1
       ORDER BY is_sellable DESC, sellable_until NULLS LAST`,
      [itemCode],
    ),
    query<ItemDetail["openOrders"][number]>(
      `SELECT order_no AS "orderNo", line_no AS "lineNo", ship_date AS "shipDate",
              customer_code AS "customerCode", qty
       FROM sales WHERE item_code = $1 AND status = 'OPEN'
       ORDER BY ship_date, order_no`,
      [itemCode],
    ),
    query<ItemDetail["corrections"][number]>(
      "SELECT ref, qty FROM adjustments WHERE item_code = $1 ORDER BY ref",
      [itemCode],
    ),
    query<ItemDetail["recentWeeks"][number]>(
      `SELECT -floor((ship_date - $2::date) / 7.0)::int AS "weeksAgo", sum(qty) AS qty
       FROM sales
       WHERE item_code = $1 AND is_demand
         AND ship_date >= $2::date - 84 AND ship_date < $2::date
       GROUP BY 1 ORDER BY 1 DESC`,
      [itemCode, settings.today],
    ),
    query<ItemDetail["excludedSales"][number]>(
      `SELECT exclude_reason AS reason, count(*) AS lines, sum(qty) AS qty
       FROM sales WHERE item_code = $1 AND NOT is_demand
       GROUP BY exclude_reason ORDER BY count(*) DESC`,
      [itemCode],
    ),
    query<ItemDetail["handled"][number]>(
      `SELECT id, qty, expected_date AS "expectedDate", note, created_at::text AS "createdAt"
       FROM handled WHERE item_code = $1 AND cleared_at IS NULL
       ORDER BY created_at DESC`,
      [itemCode],
    ),
    query<ItemDetail["cleaningNotes"][number]>(
      `SELECT source_file AS "sourceFile", detail, action, reason
       FROM cleaning_log WHERE upper(btrim(item_code)) = $1
       ORDER BY id`,
      [itemCode],
    ),
  ]);

  return {
    plan,
    lots,
    openOrders,
    corrections,
    recentWeeks,
    excludedSales,
    handled,
    cleaningNotes,
  };
}
