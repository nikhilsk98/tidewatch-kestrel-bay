import { query } from "@/lib/db";
import { loadPlanningRules } from "@/lib/settings";

/** One item's stock position on the planning date. All quantities in the item's sell_uom. */
export type StockPosition = {
  itemCode: string;
  description: string;
  category: string | null;
  sellUom: string; // CS or LB: the unit for every quantity below
  vendorCode: string;
  vendorName: string;
  reorderEnabled: boolean; // may Tidewatch suggest buying it? (item_reorder view)
  reorderReason: string; // why, e.g. "Set by Dana"
  onHand: number; // every lot, sellable or not
  sellable: number; // lots that count for future sales (lot_status)
  corrections: number; // count corrections from adjustments (usually negative)
  promised: number; // open customer orders not yet shipped
  availableNow: number; // sellable + corrections - promised (can be negative = short)
};

/**
 * Stock position for every item. Checks Dana's settings first, because
 * "sellable" depends on the planning date and the 6-month cutoff.
 */
export async function getStockPositions(): Promise<StockPosition[]> {
  await loadPlanningRules(); // stops here with a clear error if a setting is bad

  const rows = await query<{
    item_code: string;
    description: string;
    category: string | null;
    sell_uom: string;
    vendor_code: string;
    vendor_name: string;
    reorder_enabled: boolean;
    reorder_reason: string;
    on_hand: number;
    sellable: number;
    corrections: number;
    promised: number;
  }>(`
    SELECT
      i.item_code, i.description, i.category, i.sell_uom,
      i.vendor_code, v.vendor_name,
      r.reorder_enabled, r.reason            AS reorder_reason,
      COALESCE(l.on_hand, 0)                 AS on_hand,
      COALESCE(l.sellable, 0)                AS sellable,
      COALESCE(a.corrections, 0)             AS corrections,
      COALESCE(s.promised, 0)                AS promised
    FROM items i
    JOIN vendors v      ON v.vendor_code = i.vendor_code
    JOIN item_reorder r ON r.item_code = i.item_code
    LEFT JOIN (
      SELECT item_code,
             sum(qty)                           AS on_hand,
             sum(qty) FILTER (WHERE is_sellable) AS sellable
      FROM lot_status
      GROUP BY item_code
    ) l ON l.item_code = i.item_code
    LEFT JOIN (
      SELECT item_code, sum(qty) AS corrections
      FROM adjustments
      GROUP BY item_code
    ) a ON a.item_code = i.item_code
    LEFT JOIN (
      SELECT item_code, sum(qty) AS promised
      FROM sales
      WHERE status = 'OPEN'
      GROUP BY item_code
    ) s ON s.item_code = i.item_code
    ORDER BY v.vendor_name, i.item_code
  `);

  return rows.map((row) => ({
    itemCode: row.item_code,
    description: row.description,
    category: row.category,
    sellUom: row.sell_uom,
    vendorCode: row.vendor_code,
    vendorName: row.vendor_name,
    reorderEnabled: row.reorder_enabled,
    reorderReason: row.reorder_reason,
    onHand: row.on_hand,
    sellable: row.sellable,
    corrections: row.corrections,
    promised: row.promised,
    availableNow: row.sellable + row.corrections - row.promised,
  }));
}
