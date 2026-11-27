import { connection } from "next/server";
import { getStockPositions } from "@/lib/stock";
import { SettingsError } from "@/lib/settings";

/** GET /api/items: every item's stock position on the planning date. */
export async function GET() {
  await connection(); // always read fresh from the database, never cached
  try {
    const items = await getStockPositions();
    return Response.json({ ok: true, items });
  } catch (error) {
    if (error instanceof SettingsError) {
      // A bad business rule: say which one, so it can be fixed.
      return Response.json(
        { ok: false, error: error.message },
        { status: 422 },
      );
    }
    console.error(error);
    return Response.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
