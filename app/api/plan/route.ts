import { connection } from "next/server";
import { query } from "@/lib/db";
import { getItemPlans } from "@/lib/projection";
import { loadPlanningRules, SettingsError } from "@/lib/settings";

/** GET /api/plan: the Monday screen. Every item's buying plan, counts, and which data it's based on. */
export async function GET() {
  await connection(); // always read fresh from the database, never cached
  try {
    const { settings } = await loadPlanningRules();
    const [plans, info] = await Promise.all([
      getItemPlans(),
      query<{ key: string; value: string }>(
        "SELECT key, value FROM import_info",
      ),
    ]);
    const loadInfo = Object.fromEntries(
      info.map((row) => [row.key, row.value]),
    );
    const count = (status: string) =>
      plans.filter((p) => p.status === status).length;

    return Response.json({
      ok: true,
      meta: {
        planningDate: settings.today, // "today" for every calculation
        stockAsOf: loadInfo.snapshot_date ?? null, // which inventory night the numbers come from
        loadedAt: loadInfo.loaded_at ?? null, // when the CSVs were last loaded
      },
      summary: {
        orderNow: count("order now"),
        orderSoon: count("order soon"),
        ok: count("ok"),
        leadTimeNotSet: count("lead time not set"),
        notReordered: count("not reordered"),
      },
      plans,
    });
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
