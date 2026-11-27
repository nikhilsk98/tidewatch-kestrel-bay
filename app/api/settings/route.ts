import { connection } from "next/server";
import { query } from "@/lib/db";
import { loadPlanningRules, SettingsError } from "@/lib/settings";

/** GET /api/settings: Dana's rules, lead times and reorder choices, checked. */
export async function GET() {
  await connection(); // always read fresh from the database, never cached
  try {
    const { settings, vendors } = await loadPlanningRules();
    const items = await query<{
      item_code: string;
      reorder_enabled: boolean | null;
      note: string | null;
    }>(
      "SELECT item_code, reorder_enabled, note FROM item_settings ORDER BY item_code",
    );
    return Response.json({
      ok: true,
      settings,
      vendors: Object.fromEntries(vendors), // Map -> plain object for JSON
      items,
    });
  } catch (error) {
    if (error instanceof SettingsError) {
      // A bad business rule: say exactly which one, so it can be fixed.
      return Response.json(
        { ok: false, error: error.message },
        { status: 422 },
      );
    }
    console.error(error);
    return Response.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
