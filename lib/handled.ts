import { query } from "@/lib/db";
import { isRealDate } from "@/lib/settings";

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

// ---------------------------------------------------------------------
// Saving a note (POST /api/handled) and undoing it (PATCH /api/handled/[id]).
// ---------------------------------------------------------------------

export type HandledInput = {
  itemCode: string; // cleaned: trimmed, upper case (the table checks this too)
  qty: number | null;
  expectedDate: string | null;
  note: string | null;
};

const MAX_NOTE_LENGTH = 1000;

/** An optional field: missing, null and "" all mean "not given". */
const isBlank = (value: unknown) =>
  value === undefined || value === null || (typeof value === "string" && value.trim() === "");

/**
 * Check a POST body. Pure (no database), so it can be unit tested.
 * Returns the cleaned input, or one message saying what's wrong.
 */
export function validateHandled(
  body: unknown,
): { ok: true; value: HandledInput } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Send a JSON object." };
  }
  const { itemCode, qty, expectedDate, note } = body as Record<string, unknown>;

  if (typeof itemCode !== "string" || itemCode.trim() === "") {
    return { ok: false, error: "Item code is required." };
  }

  let cleanQty: number | null = null;
  if (!isBlank(qty)) {
    cleanQty = typeof qty === "number" ? qty : Number(qty);
    if (!Number.isFinite(cleanQty) || cleanQty <= 0) {
      return { ok: false, error: "Quantity must be a number above zero, or left empty." };
    }
  }

  let cleanDate: string | null = null;
  if (!isBlank(expectedDate)) {
    if (typeof expectedDate !== "string" || !isRealDate(expectedDate.trim())) {
      return { ok: false, error: "Expected arrival must be a real date (YYYY-MM-DD), or left empty." };
    }
    cleanDate = expectedDate.trim();
  }

  let cleanNote: string | null = null;
  if (!isBlank(note)) {
    if (typeof note !== "string") return { ok: false, error: "Note must be text." };
    cleanNote = note.trim();
    if (cleanNote.length > MAX_NOTE_LENGTH) {
      return { ok: false, error: `Note must be at most ${MAX_NOTE_LENGTH} characters.` };
    }
  }

  return {
    ok: true,
    value: {
      itemCode: itemCode.trim().toUpperCase(),
      qty: cleanQty,
      expectedDate: cleanDate,
      note: cleanNote,
    },
  };
}

/** Save a note. Returns null if the item doesn't exist (Dana's tables have no foreign keys). */
export async function createHandled(input: HandledInput): Promise<HandledNote | null> {
  const items = await query("SELECT 1 FROM items WHERE item_code = $1", [input.itemCode]);
  if (items.length === 0) return null;

  const rows = await query<HandledNote>(
    `INSERT INTO handled (item_code, qty, expected_date, note)
     VALUES ($1, $2, $3, $4)
     RETURNING id, item_code AS "itemCode", qty, expected_date AS "expectedDate",
               note, created_at::text AS "createdAt"`,
    [input.itemCode, input.qty, input.expectedDate, input.note],
  );
  return rows[0];
}

/**
 * Undo a note: mark it cleared, never delete it, so there's a record of
 * what Dana noted and when she took it back. Returns false if there's no
 * active note with that id.
 */
export async function clearHandled(id: number): Promise<boolean> {
  const rows = await query(
    "UPDATE handled SET cleared_at = now() WHERE id = $1 AND cleared_at IS NULL RETURNING id",
    [id],
  );
  return rows.length > 0;
}
