import { connection } from "next/server";
import { createHandled, validateHandled } from "@/lib/handled";

/**
 * POST /api/handled: Dana notes she has handled an item.
 * Body: { itemCode, qty?, expectedDate?, note? }. The note never adds
 * supply or changes any calculation; it only labels the item.
 */
export async function POST(request: Request) {
  await connection(); // always run fresh, never cached
  try {
    const body = await request.json().catch(() => null);
    const checked = validateHandled(body);
    if (!checked.ok) {
      return Response.json({ ok: false, error: checked.error }, { status: 400 });
    }
    const note = await createHandled(checked.value);
    if (!note) {
      return Response.json(
        { ok: false, error: `Unknown item ${checked.value.itemCode}` },
        { status: 404 },
      );
    }
    return Response.json({ ok: true, handled: note }, { status: 201 });
  } catch (error) {
    console.error(error);
    return Response.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
