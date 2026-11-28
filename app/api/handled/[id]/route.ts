import { connection } from "next/server";
import { clearHandled } from "@/lib/handled";

/** PATCH /api/handled/12: undo a handled note (sets cleared_at; the row is kept). */
export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await connection(); // always run fresh, never cached
  try {
    const { id } = await params;
    if (!/^\d+$/.test(id)) {
      return Response.json({ ok: false, error: "Note id must be a whole number." }, { status: 400 });
    }
    const cleared = await clearHandled(Number(id));
    if (!cleared) {
      return Response.json(
        { ok: false, error: `No active handled note with id ${id}` },
        { status: 404 },
      );
    }
    return Response.json({ ok: true, id: Number(id) });
  } catch (error) {
    console.error(error);
    return Response.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
