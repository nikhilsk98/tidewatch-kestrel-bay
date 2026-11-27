import { query } from "@/lib/db";

/** Everything the loader changed, merged or left out, and why: the "What we cleaned" panel. */
export type CleaningReport = {
  stockAsOf: string | null;
  loadedAt: string | null;
  notes: {
    sourceFile: string;
    itemCode: string | null;
    detail: string | null;
    action: string;
    reason: string;
  }[];
  excludedSales: { reason: string; lines: number }[];
  unavailableLots: { reason: string; lots: number }[];
  totals: {
    salesLines: number;
    demandLines: number;
    lots: number;
    sellableLots: number;
  };
};

export async function getCleaningReport(): Promise<CleaningReport> {
  const [info, notes, excludedSales, unavailableLots, totals] =
    await Promise.all([
      query<{ key: string; value: string }>(
        "SELECT key, value FROM import_info",
      ),
      query<CleaningReport["notes"][number]>(
        `SELECT source_file AS "sourceFile", item_code AS "itemCode", detail, action, reason
       FROM cleaning_log ORDER BY source_file, id`,
      ),
      query<CleaningReport["excludedSales"][number]>(
        `SELECT exclude_reason AS reason, count(*) AS lines
       FROM sales WHERE NOT is_demand
       GROUP BY exclude_reason ORDER BY count(*) DESC`,
      ),
      query<CleaningReport["unavailableLots"][number]>(
        `SELECT unavailable_reason AS reason, count(*) AS lots
       FROM lot_status WHERE NOT is_sellable
       GROUP BY unavailable_reason ORDER BY count(*) DESC`,
      ),
      query<CleaningReport["totals"]>(
        `SELECT (SELECT count(*) FROM sales)                              AS "salesLines",
              (SELECT count(*) FROM sales WHERE is_demand)              AS "demandLines",
              (SELECT count(*) FROM lots)                               AS lots,
              (SELECT count(*) FROM lot_status WHERE is_sellable)       AS "sellableLots"`,
      ),
    ]);
  const load = Object.fromEntries(info.map((row) => [row.key, row.value]));
  return {
    stockAsOf: load.snapshot_date ?? null,
    loadedAt: load.loaded_at ?? null,
    notes,
    excludedSales,
    unavailableLots,
    totals: totals[0],
  };
}
