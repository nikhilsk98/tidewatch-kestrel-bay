import { query } from "@/lib/db";

/** A business rule is missing or invalid. No calculation may run until it's fixed. */
export class SettingsError extends Error {}

/** Dana's business rules, read from the settings table and checked. */
export type Settings = {
  today: string; // planning date, "YYYY-MM-DD"; never the computer clock
  expiryCutoffMonths: number; // lots inside this many months don't count for future sales
  agingReceivedDays: number; // flag stock received this many days ago (our assumption)
  projectionWeeks: number; // how far ahead stock is projected
};

/** Dana's lead time and cushion for one vendor. */
export type VendorSetting = {
  leadTimeDays: number;
  bufferDays: number;
  note: string | null;
};

/** True only for a real calendar date written YYYY-MM-DD (rejects 2026-02-30). */
export function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

/** A setting that must be a whole number of at least `minimum`, or a clear error. */
export function wholeNumber(
  values: Map<string, string>,
  key: string,
  minimum: number,
): number {
  const raw = values.get(key)?.trim();
  if (raw === undefined || !/^\d+$/.test(raw) || Number(raw) < minimum) {
    throw new SettingsError(
      `Setting '${key}' is missing or not a whole number of at least ${minimum}.`,
    );
  }
  return Number(raw);
}

/** Read and check the business rules. Throws SettingsError if any is unusable. */
export async function getSettings(): Promise<Settings> {
  const rows = await query<{ key: string; value: string }>(
    "SELECT key, value FROM settings",
  );
  const values = new Map(rows.map((row) => [row.key, row.value]));

  const today = values.get("today")?.trim() ?? "";
  if (!isRealDate(today)) {
    throw new SettingsError(
      "Setting 'today' is missing or not a real date (YYYY-MM-DD).",
    );
  }

  return {
    today,
    expiryCutoffMonths: wholeNumber(values, "expiry_cutoff_months", 0),
    agingReceivedDays: wholeNumber(values, "aging_received_days", 0),
    projectionWeeks: wholeNumber(values, "projection_weeks", 1),
  };
}

/**
 * Dana's lead times, by vendor code. Only complete rows are returned:
 * items from a vendor missing here still appear, marked "Lead time not set".
 */
export async function getVendorSettings(): Promise<Map<string, VendorSetting>> {
  const rows = await query<{
    vendor_code: string;
    lead_time_days: number | null;
    buffer_days: number | null;
    note: string | null;
  }>(
    "SELECT vendor_code, lead_time_days, buffer_days, note FROM vendor_settings",
  );

  const vendors = new Map<string, VendorSetting>();
  for (const row of rows) {
    if (row.lead_time_days !== null && row.buffer_days !== null) {
      vendors.set(row.vendor_code, {
        leadTimeDays: row.lead_time_days,
        bufferDays: row.buffer_days,
        note: row.note,
      });
    }
  }
  return vendors;
}

/**
 * Everything a calculation needs, checked together. Call this first in
 * every calculation: if it throws, no projection runs.
 */
export async function loadPlanningRules(): Promise<{
  settings: Settings;
  vendors: Map<string, VendorSetting>;
}> {
  const [settings, vendors] = await Promise.all([
    getSettings(),
    getVendorSettings(),
  ]);

  // The projection must reach past the longest lead time plus cushion,
  // or order-by dates for that vendor would fall outside it.
  const longest = Math.max(
    0,
    ...[...vendors.values()].map((v) => v.leadTimeDays + v.bufferDays),
  );
  if (settings.projectionWeeks * 7 < longest) {
    throw new SettingsError(
      `Setting 'projection_weeks' (${settings.projectionWeeks}) is shorter than the longest ` +
        `lead time plus cushion (${longest} days). Increase it to at least ${Math.ceil(longest / 7)}.`,
    );
  }
  return { settings, vendors };
}
