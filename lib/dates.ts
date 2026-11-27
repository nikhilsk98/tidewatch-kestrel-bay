// Calendar dates are handled as "YYYY-MM-DD" text everywhere (see lib/db.ts).
// These helpers do day arithmetic in UTC, so the time zone of the computer
// running the code can never shift a date.

/** The date `days` after `date` (negative goes back). addDays("2026-11-16", 10) -> "2026-11-26". */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`. daysBetween("2026-11-16", "2026-11-26") -> 10. */
export function daysBetween(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}
