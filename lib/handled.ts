import { query } from "@/lib/db";

/** One active "I've handled this" note. Quantity in the item's sell_uom. */
export type HandledNote = {
  id: number;
  itemCode: string;
  qty: number | null;
  expectedDate: string | null;
  note: string | null;
  createdAt: string;
};

/**
 * Every handled note that hasn't been undone, newest first.
 * A note never adds supply or changes a calculation: the screens only use
 * it to label the item and to hide it from the default worklist.
 */
export async function getActiveHandled(): Promise<HandledNote[]> {
  return query<HandledNote>(
    `SELECT id, item_code AS "itemCode", qty, expected_date AS "expectedDate",
            note, created_at::text AS "createdAt"
     FROM handled WHERE cleared_at IS NULL
     ORDER BY created_at DESC`,
  );
}
