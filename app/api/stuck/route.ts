import { connection } from "next/server";
import { getStuckStock } from "@/lib/stuck";
import { SettingsError } from "@/lib/settings";

/** GET /api/stuck: stock Dana is stuck with now or soon, biggest value first. */
export async function GET() {
  await connection(); // always read fresh from the database, never cached
  try {
    const { summary, lots } = await getStuckStock();
    return Response.json({ ok: true, summary, lots });
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
