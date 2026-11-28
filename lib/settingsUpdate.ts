import type { PoolClient } from "pg";
import { pool, query } from "@/lib/db";
import { loadPlanningRules, SettingsError, wholeNumber } from "@/lib/settings";

// Saving Dana's rules from the settings page (PATCH /api/settings).
// The checks reuse wholeNumber() from lib/settings.ts and the same
// horizon rule as loadPlanningRules(), so a value the page accepts is
// always one the calculations accept. Only values change, never key columns.

/** Settings Dana may edit here, with their minimum. `today` is deliberately not editable. */
export const EDITABLE_SETTINGS: Record<string, number> = {
  expiry_cutoff_months: 0,
  aging_received_days: 0,
  projection_weeks: 1,
};

export type SettingsChange = {
  settings: Record<string, string>; // key -> new value, stored as text like the loader does
  vendors: { vendorCode: string; leadTimeDays: number; bufferDays: number }[];
  items: { itemCode: string; reorderEnabled: boolean | null }[]; // null = follow BlueTide status
};

/** What's in the database now, which a change is checked against. */
export type CurrentSettings = {
  settings: Map<string, string>;
  vendorSettings: Map<string, { leadTimeDays: number; bufferDays: number }>; // complete rows only
  vendorCodes: Set<string>;
  items: Map<string, boolean>; // item code -> can Dana's choice take effect? (not fresh, not ZZ)
};

type Result = { ok: true; change: SettingsChange } | { ok: false; error: string };

const clean = (code: unknown) => (typeof code === "string" ? code.trim().toUpperCase() : "");

/** Check a PATCH body against the current values. Pure (no database), so it can be unit tested. */
export function validateSettingsChange(body: unknown, current: CurrentSettings): Result {
  if (typeof body !== "object" || body === null) return { ok: false, error: "Send a JSON object." };
  const input = body as { settings?: unknown; vendors?: unknown; items?: unknown };
  const change: SettingsChange = { settings: {}, vendors: [], items: [] };

  try {
    // 1. Planning rules. Checked on the merged result: current values with the changes applied.
    const merged = new Map(current.settings);
    if (input.settings !== undefined) {
      if (typeof input.settings !== "object" || input.settings === null) {
        return { ok: false, error: "'settings' must be an object of key: value." };
      }
      for (const [key, value] of Object.entries(input.settings)) {
        if (key === "today") {
          return { ok: false, error: "Setting 'today' is the planning date and can't be changed here." };
        }
        if (!(key in EDITABLE_SETTINGS)) {
          return { ok: false, error: `Setting '${key}' can't be changed here.` };
        }
        merged.set(key, value === null || value === undefined ? "" : String(value).trim());
        const number = wholeNumber(merged, key, EDITABLE_SETTINGS[key]); // throws, naming the setting
        change.settings[key] = String(number); // "04" is stored as "4"
      }
    }

    // 2. Vendor lead times. A vendor without a row gets one (how "Lead time not set" is fixed).
    const vendors = new Map(current.vendorSettings);
    if (input.vendors !== undefined) {
      if (!Array.isArray(input.vendors)) return { ok: false, error: "'vendors' must be a list." };
      for (const row of input.vendors as Record<string, unknown>[]) {
        const code = clean(row?.vendorCode);
        if (!current.vendorCodes.has(code)) return { ok: false, error: `Unknown vendor '${code}'.` };
        if (change.vendors.some((v) => v.vendorCode === code)) {
          return { ok: false, error: `Vendor ${code} is listed twice.` };
        }
        // Same rule as the settings: whole numbers of 0 or more, with the setting named in the error.
        const values = new Map<string, string>();
        if (row.leadTimeDays != null) values.set(`lead time for ${code}`, String(row.leadTimeDays));
        if (row.bufferDays != null) values.set(`cushion for ${code}`, String(row.bufferDays));
        const leadTimeDays = wholeNumber(values, `lead time for ${code}`, 0);
        const bufferDays = wholeNumber(values, `cushion for ${code}`, 0);
        change.vendors.push({ vendorCode: code, leadTimeDays, bufferDays });
        vendors.set(code, { leadTimeDays, bufferDays });
      }
    }

    // 3. Reorder choices: true, false, or null (no override: follow BlueTide status).
    if (input.items !== undefined) {
      if (!Array.isArray(input.items)) return { ok: false, error: "'items' must be a list." };
      for (const row of input.items as Record<string, unknown>[]) {
        const code = clean(row?.itemCode);
        if (!current.items.has(code)) return { ok: false, error: `Unknown item '${code}'.` };
        if (!current.items.get(code)) {
          return {
            ok: false,
            error: `Reordering for ${code} can't be changed: fresh and old-system (ZZ) items are never reordered.`,
          };
        }
        const choice = row.reorderEnabled;
        if (choice !== true && choice !== false && choice !== null) {
          return { ok: false, error: `Reorder choice for ${code} must be yes, no, or follow BlueTide status.` };
        }
        change.items.push({ itemCode: code, reorderEnabled: choice });
      }
    }

    if (
      Object.keys(change.settings).length === 0 &&
      change.vendors.length === 0 &&
      change.items.length === 0
    ) {
      return { ok: false, error: "Nothing to save." };
    }

    // 4. The horizon must still cover the longest lead time plus cushion (the loadPlanningRules rule),
    //    checked whenever the horizon or a lead time changes.
    if ("projection_weeks" in change.settings || change.vendors.length > 0) {
      const weeks = wholeNumber(merged, "projection_weeks", EDITABLE_SETTINGS.projection_weeks);
      const longest = Math.max(0, ...[...vendors.values()].map((v) => v.leadTimeDays + v.bufferDays));
      if (weeks * 7 < longest) {
        return {
          ok: false,
          error:
            `Setting 'projection_weeks' (${weeks}) is shorter than the longest lead time plus cushion ` +
            `(${longest} days). Increase it to at least ${Math.ceil(longest / 7)}.`,
        };
      }
    }
  } catch (error) {
    if (error instanceof SettingsError) return { ok: false, error: error.message };
    throw error;
  }
  return { ok: true, change };
}

/** Read the current values inside the transaction, so the check and the write see the same data. */
async function readCurrent(client: PoolClient): Promise<CurrentSettings> {
  const [settings, vendorSettings, vendors, items] = await Promise.all([
    client.query<{ key: string; value: string }>("SELECT key, value FROM settings"),
    client.query<{ vendor_code: string; lead_time_days: number | null; buffer_days: number | null }>(
      "SELECT vendor_code, lead_time_days, buffer_days FROM vendor_settings",
    ),
    client.query<{ vendor_code: string }>("SELECT vendor_code FROM vendors"),
    client.query<{ item_code: string; overridable: boolean }>(
      `SELECT item_code, (storage IS DISTINCT FROM 'FRESH' AND item_code NOT LIKE 'ZZ-%') AS overridable
       FROM items`,
    ),
  ]);
  const complete = new Map<string, { leadTimeDays: number; bufferDays: number }>();
  for (const row of vendorSettings.rows) {
    if (row.lead_time_days !== null && row.buffer_days !== null) {
      complete.set(row.vendor_code, { leadTimeDays: row.lead_time_days, bufferDays: row.buffer_days });
    }
  }
  return {
    settings: new Map(settings.rows.map((r) => [r.key, r.value])),
    vendorSettings: complete,
    vendorCodes: new Set(vendors.rows.map((r) => r.vendor_code)),
    items: new Map(items.rows.map((r) => [r.item_code, r.overridable])),
  };
}

/** Check and save a change in one transaction: all of it is saved, or none of it. */
export async function applySettingsChange(body: unknown): Promise<Result> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const checked = validateSettingsChange(body, await readCurrent(client));
    if (!checked.ok) {
      await client.query("ROLLBACK");
      return checked;
    }
    const { change } = checked;
    for (const [key, value] of Object.entries(change.settings)) {
      await client.query("UPDATE settings SET value = $2 WHERE key = $1", [key, value]);
    }
    for (const v of change.vendors) {
      await client.query(
        `INSERT INTO vendor_settings (vendor_code, lead_time_days, buffer_days)
         VALUES ($1, $2, $3)
         ON CONFLICT (vendor_code) DO UPDATE
           SET lead_time_days = EXCLUDED.lead_time_days,
               buffer_days = EXCLUDED.buffer_days,
               updated_at = now()`,
        [v.vendorCode, v.leadTimeDays, v.bufferDays],
      );
    }
    for (const item of change.items) {
      await client.query(
        `INSERT INTO item_settings (item_code, reorder_enabled)
         VALUES ($1, $2)
         ON CONFLICT (item_code) DO UPDATE
           SET reorder_enabled = EXCLUDED.reorder_enabled, updated_at = now()`,
        [item.itemCode, item.reorderEnabled],
      );
    }
    await client.query("COMMIT");
    return checked;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------
// What the settings page shows. Works even when a setting is invalid,
// because the settings page is where Dana fixes it.
// ---------------------------------------------------------------------

export type SettingsPageData = {
  problem: string | null; // the SettingsError message, if the current rules are unusable
  settings: { key: string; value: string; note: string | null }[];
  vendors: {
    vendorCode: string;
    vendorName: string;
    leadTimeRaw: string | null; // BlueTide's value, evidence only
    leadTimeDays: number | null;
    bufferDays: number | null;
  }[];
  items: {
    itemCode: string;
    description: string;
    sourceStatus: string | null;
    override: boolean | null; // Dana's choice; null = follow BlueTide status
    reorderEnabled: boolean; // the result, from the item_reorder view
    reason: string;
  }[];
};

export async function getSettingsPageData(): Promise<SettingsPageData> {
  let problem: string | null = null;
  try {
    await loadPlanningRules();
  } catch (error) {
    if (!(error instanceof SettingsError)) throw error;
    problem = error.message;
  }
  const [settings, vendors, items] = await Promise.all([
    query<SettingsPageData["settings"][number]>("SELECT key, value, note FROM settings ORDER BY key"),
    query<SettingsPageData["vendors"][number]>(
      `SELECT v.vendor_code AS "vendorCode", v.vendor_name AS "vendorName",
              v.lead_time_raw AS "leadTimeRaw",
              vs.lead_time_days AS "leadTimeDays", vs.buffer_days AS "bufferDays"
       FROM vendors v LEFT JOIN vendor_settings vs ON vs.vendor_code = v.vendor_code
       ORDER BY v.vendor_name`,
    ),
    query<SettingsPageData["items"][number]>(
      `SELECT i.item_code AS "itemCode", i.description, i.source_status AS "sourceStatus",
              r.dana_override AS override, r.reorder_enabled AS "reorderEnabled", r.reason
       FROM items i JOIN item_reorder r ON r.item_code = i.item_code
       WHERE i.storage IS DISTINCT FROM 'FRESH' AND i.item_code NOT LIKE 'ZZ-%'
       ORDER BY i.item_code`,
    ),
  ]);
  return { problem, settings, vendors, items };
}
