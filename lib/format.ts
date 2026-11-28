// Display formatting only: no business rules live here.
// Dates arrive as "YYYY-MM-DD" text (see lib/db.ts) and are always read in
// UTC, so the viewer's time zone can never shift a calendar date.

/** The unit word for an item's sell_uom: "cases" (or "case") and "lb". */
export function unitName(uom: string, qty = 2): string {
  if (uom === "LB") return "lb";
  return Math.abs(qty) === 1 ? "case" : "cases";
}

/**
 * A quantity with its unit, always. Pounds round to one decimal,
 * cases to whole numbers: 1240.46 LB -> "1,240.5 lb", 450 CS -> "450 cases".
 */
export function formatQty(qty: number, uom: string): string {
  const digits = uom === "LB" ? 1 : 0;
  const factor = 10 ** digits;
  const rounded = Math.round(qty * factor) / factor || 0; // "|| 0" turns -0 into 0
  const number = rounded.toLocaleString("en-US", {
    maximumFractionDigits: digits,
  });
  return `${number} ${unitName(uom, rounded)}`;
}

const dateFormats = {
  long: { weekday: "short", month: "short", day: "numeric", year: "numeric" }, // Mon, Nov 16, 2026
  weekday: { weekday: "short", month: "short", day: "numeric" }, // Sun, Nov 15
  medium: { month: "short", day: "numeric", year: "numeric" }, // Nov 16, 2026
  short: { month: "short", day: "numeric" }, // Nov 16
} satisfies Record<string, Intl.DateTimeFormatOptions>;

/** A calendar date for display, read in UTC. formatDate("2026-11-16") -> "Mon, Nov 16, 2026". */
export function formatDate(
  date: string,
  style: keyof typeof dateFormats = "long",
): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    ...dateFormats[style],
    timeZone: "UTC",
  });
}

/** Money at cost, in whole dollars: 169378.13 -> "$169,378". */
export function formatMoney(amount: number): string {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

/** Days relative to the planning date: -62 -> "62 days late", 0 -> "today", 3 -> "in 3 days". */
export function formatDaysFrom(days: number): string {
  const n = Math.abs(days);
  const word = n === 1 ? "day" : "days";
  if (days < 0) return `${n} ${word} late`;
  if (days === 0) return "today";
  return `in ${n} ${word}`;
}

const locationNames: Record<string, string> = {
  NB: "New Bedford",
  PVD: "Providence",
  HCS: "Harbor Cold Storage",
  "QA-HOLD": "QA hold",
  DAMAGED: "Damaged area",
};

/** A warehouse location code in plain words: "HCS" -> "Harbor Cold Storage". */
export function locationName(code: string): string {
  return locationNames[code] ?? code;
}
