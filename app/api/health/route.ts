import { connection } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  await connection();
  try {
    const rows = await query<{ now: string }>("SELECT NOW() AS now");
    return Response.json({ ok: true, dbTime: rows[0].now });
  } catch (error) {
    console.error(error);
    return Response.json({ ok: false }, { status: 500 });
  }
}
