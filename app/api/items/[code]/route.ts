import { connection } from "next/server";
import { getItemDetail } from "@/lib/itemDetail";
import { SettingsError } from "@/lib/settings";

/** GET /api/items/SHR-1620: one item's plan plus the evidence behind it. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  await connection(); // always read fresh from the database, never cached
  try {
    const { code } = await params; // the part of the address after /api/items/
    const itemCode = decodeURIComponent(code).trim().toUpperCase();
    const detail = await getItemDetail(itemCode);
    if (!detail) {
      return Response.json(
        { ok: false, error: `Unknown item ${itemCode}` },
        { status: 404 },
      );
    }
    return Response.json({ ok: true, ...detail });
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
