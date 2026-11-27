import { connection } from "next/server";
import { countsInScenario, getIncomingPOs } from "@/lib/incoming";
import { loadPlanningRules, SettingsError } from "@/lib/settings";

/** GET /api/incoming: every open PO line, its timing label, and whether it counts in the scenario. */
export async function GET() {
  await connection(); // always read fresh from the database, never cached
  try {
    await loadPlanningRules(); // PO timing depends on the planning date
    const byItem = await getIncomingPOs();
    const lines = [...byItem.values()].flat().map((po) => ({
      ...po,
      countsInScenario: countsInScenario(po),
    }));
    return Response.json({
      ok: true,
      summary: {
        openLines: lines.length,
        overdue: lines.filter((po) => po.isOverdue).length,
        countsInScenario: lines.filter((po) => po.countsInScenario).length,
      },
      lines,
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
