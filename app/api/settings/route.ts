import { connection } from "next/server";
import { query } from "@/lib/db";
import { loadPlanningRules, SettingsError } from "@/lib/settings";
import { applySettingsChange } from "@/lib/settingsUpdate";

/**
 * PATCH /api/settings: save Dana's changes in one transaction.
 * Body: { settings?: { key: value }, vendors?: [{ vendorCode, leadTimeDays, bufferDays }],
 *         items?: [{ itemCode, reorderEnabled: true | false | null }] }.
 * An invalid change is rejected whole, with a message naming the setting.
 */
export async function PATCH(request: Request) {
  await connection(); // always run fresh, never cached
  try {
    const body = await request.json().catch(() => null);
    const result = await applySettingsChange(body);
    if (!result.ok) {
      return Response.json({ ok: false, error: result.error }, { status: 400 });
    }
    return Response.json({ ok: true, saved: result.change });
  } catch (error) {
    console.error(error);
    return Response.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}

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
