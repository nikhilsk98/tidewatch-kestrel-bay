import { query } from "@/lib/db";

/** Which inventory night the numbers come from, and when the CSVs were loaded. */
export type LoadInfo = {
  snapshotDate: string | null; // "YYYY-MM-DD", the inventory night used
  loadedAt: string | null;
};

/** Read the loader's import_info rows (the same rows /api/plan reports). */
export async function getLoadInfo(): Promise<LoadInfo> {
  const rows = await query<{ key: string; value: string }>(
    "SELECT key, value FROM import_info",
  );
  const info = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return {
    snapshotDate: info.snapshot_date ?? null,
    loadedAt: info.loaded_at ?? null,
  };
}
