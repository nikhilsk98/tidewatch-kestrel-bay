import { connection } from "next/server";
import { getCleaningReport } from "@/lib/cleaned";
import { loadPlanningRules, SettingsError } from "@/lib/settings";

/** GET /api/cleaned: what the loader changed, merged or left out, and why. */
export async function GET() {
  await connection(); // always read fresh from the database, never cached
  try {
    await loadPlanningRules(); // "unavailable lots" depends on the planning date
    return Response.json({ ok: true, ...(await getCleaningReport()) });
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
