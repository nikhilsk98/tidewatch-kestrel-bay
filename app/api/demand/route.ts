import { connection } from "next/server";
import { getDemandForecasts } from "@/lib/demand";
import { loadPlanningRules, SettingsError } from "@/lib/settings";

/** GET /api/demand?item=SHR-1620: the weekly demand forecast for one item. */
export async function GET(request: Request) {
  await connection(); // always read fresh from the database, never cached
  try {
    const item = new URL(request.url).searchParams
      .get("item")
      ?.trim()
      .toUpperCase();
    if (!item) {
      return Response.json(
        { ok: false, error: "Add ?item=CODE, e.g. ?item=SHR-1620" },
        { status: 400 },
      );
    }
    const { settings } = await loadPlanningRules();
    const forecast = (await getDemandForecasts(settings)).get(item);
    if (!forecast) {
      return Response.json(
        { ok: false, error: `No sales history for ${item}` },
        { status: 404 },
      );
    }
    return Response.json({ ok: true, today: settings.today, forecast });
  } catch (error) {
    if (error instanceof SettingsError) {
      return Response.json(
        { ok: false, error: error.message },
        { status: 422 },
      );
    }
    console.error(error);
    return Response.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
