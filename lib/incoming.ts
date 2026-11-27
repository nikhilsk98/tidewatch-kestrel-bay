import { query } from "@/lib/db";

/** One open PO line, with its timing label from the po_status view. Quantity in the item's sell_uom. */
export type IncomingPO = {
  poNo: string;
  lineNo: number;
  itemCode: string;
  vendorCode: string;
  orderDate: string | null;
  expectedDate: string | null; // the vendor's original estimate, never confirmed
  qty: number; // still to come (ordered minus received)
  timingStatus: string; // "Overdue: arrival unconfirmed", "Vendor estimate: unconfirmed", ...
  isOverdue: boolean;
  daysOverdue: number | null;
};

/**
 * May this PO count as stock arriving on its expected date in the
 * "if vendor dates hold" scenario? Only future vendor estimates may.
 * Overdue POs and POs without a date never get an invented arrival date (Dana).
 * The main screen's safe view counts no PO at all.
 */
export function countsInScenario(po: IncomingPO): boolean {
  return (
    po.timingStatus === "Vendor estimate: unconfirmed" &&
    po.expectedDate !== null
  );
}

/** Every open PO line, grouped by item, earliest expected date first. */
export async function getIncomingPOs(): Promise<Map<string, IncomingPO[]>> {
  const rows = await query<{
    po_no: string;
    line_no: number;
    item_code: string;
    vendor_code: string;
    order_date: string | null;
    expected_date: string | null;
    qty_remaining: number;
    timing_status: string;
    is_overdue: boolean;
    days_overdue: number | null;
  }>(`
    SELECT po_no, line_no, item_code, vendor_code, order_date, expected_date,
           qty_remaining, timing_status, is_overdue, days_overdue
    FROM po_status
    ORDER BY item_code, expected_date NULLS LAST, po_no, line_no
  `);

  const byItem = new Map<string, IncomingPO[]>();
  for (const row of rows) {
    const list = byItem.get(row.item_code) ?? [];
    list.push({
      poNo: row.po_no,
      lineNo: row.line_no,
      itemCode: row.item_code,
      vendorCode: row.vendor_code,
      orderDate: row.order_date,
      expectedDate: row.expected_date,
      qty: row.qty_remaining,
      timingStatus: row.timing_status,
      isOverdue: row.is_overdue,
      daysOverdue: row.days_overdue,
    });
    byItem.set(row.item_code, list);
  }
  return byItem;
}
