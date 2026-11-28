"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDate } from "@/lib/format";
import type { SettingsPageData } from "@/lib/settingsUpdate";
import { Icon } from "./Icon";
import { Pill } from "./Pill";

// What each editable setting means, in Dana's words where we have them.
const SETTING_LABELS: Record<string, { label: string; help: string }> = {
  expiry_cutoff_months: {
    label: "Expiry line, in months",
    help: "Frozen lots with less than this left before expiry don't count for future sales (Dana's 6-month rule).",
  },
  aging_received_days: {
    label: "“Received long ago” hint, in days",
    help: "Only adds a hint in stock to clear. Our assumption, not Dana's rule.",
  },
  projection_weeks: {
    label: "Weeks to project ahead",
    help: "Must cover the longest lead time plus cushion.",
  },
};

type Choice = "follow" | "yes" | "no";
const toChoice = (value: boolean | null): Choice => (value === null ? "follow" : value ? "yes" : "no");
const fromChoice = (choice: Choice) => (choice === "follow" ? null : choice === "yes");

type Values = {
  settings: Record<string, string>;
  vendors: Record<string, { lead: string; buffer: string }>;
  items: Record<string, Choice>;
};

function initialValues(data: SettingsPageData): Values {
  return {
    settings: Object.fromEntries(
      data.settings.filter((s) => s.key in SETTING_LABELS).map((s) => [s.key, s.value]),
    ),
    vendors: Object.fromEntries(
      data.vendors.map((v) => [
        v.vendorCode,
        { lead: v.leadTimeDays?.toString() ?? "", buffer: v.bufferDays?.toString() ?? "" },
      ]),
    ),
    items: Object.fromEntries(data.items.map((i) => [i.itemCode, toChoice(i.override)])),
  };
}

/** Only what changed is sent, so a save never rewrites values Dana didn't touch. */
function changedBody(values: Values, saved: Values) {
  const settings = Object.fromEntries(
    Object.entries(values.settings).filter(([key, value]) => value !== saved.settings[key]),
  );
  const vendors = Object.entries(values.vendors)
    .filter(([code, v]) => v.lead !== saved.vendors[code].lead || v.buffer !== saved.vendors[code].buffer)
    .map(([vendorCode, v]) => ({
      vendorCode,
      leadTimeDays: v.lead === "" ? null : v.lead,
      bufferDays: v.buffer === "" ? null : v.buffer,
    }));
  const items = Object.entries(values.items)
    .filter(([code, choice]) => choice !== saved.items[code])
    .map(([itemCode, choice]) => ({ itemCode, reorderEnabled: fromChoice(choice) }));
  return { settings, vendors, items };
}

const numberInput = "w-24 rounded-xl border border-control bg-card px-3 py-1.5 text-sm tabular-nums";

export function SettingsForm({ data }: { data: SettingsPageData }) {
  const router = useRouter();
  const [saved, setSaved] = useState(() => initialValues(data));
  const [values, setValues] = useState(saved);
  const [status, setStatus] = useState<
    { state: "idle" } | { state: "saving" } | { state: "saved" } | { state: "error"; message: string }
  >({ state: "idle" });

  const body = changedBody(values, saved);
  const changes =
    Object.keys(body.settings).length + body.vendors.length + body.items.length;
  const today = data.settings.find((s) => s.key === "today")?.value ?? "";

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setStatus({ state: "saving" });
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!result.ok) {
        setStatus({ state: "error", message: result.error ?? "Couldn't save." });
        return;
      }
      setSaved(values);
      setStatus({ state: "saved" });
      router.refresh(); // recalculate everything shown from these rules
    } catch {
      setStatus({ state: "error", message: "Couldn't reach the server. Nothing was saved." });
    }
  }

  return (
    <form onSubmit={save} className="mt-6 flex flex-col gap-6">
      {data.problem && (
        <div role="alert" className="rounded-2xl border border-amber-accent/40 bg-amber-bg p-4 text-sm text-amber-ink">
          <p className="flex items-center gap-2 font-semibold">
            <Icon name="alert" className="size-4 text-amber-accent" />
            A setting needs fixing before order dates can be calculated
          </p>
          <p className="mt-1">{data.problem}</p>
        </div>
      )}

      <section className="rounded-2xl border border-line bg-card p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Planning rules</h2>
        <dl className="mt-3 text-sm">
          <dt className="font-medium">Planning date</dt>
          <dd className="text-ink-muted">
            {/^\d{4}-\d{2}-\d{2}$/.test(today) ? formatDate(today) : today || "Not set"} · read-only:
            every calculation counts from this date, so it isn&apos;t changed here.
          </dd>
        </dl>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {Object.entries(SETTING_LABELS).map(([key, meta]) => (
            <label key={key} className="block text-sm">
              <span className="font-medium">{meta.label}</span>
              <input
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={values.settings[key] ?? ""}
                onChange={(e) =>
                  setValues({ ...values, settings: { ...values.settings, [key]: e.target.value } })
                }
                className={`${numberInput} mt-1 block`}
              />
              <span className="mt-1 block text-xs text-ink-muted">{meta.help}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-card p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Vendor lead times</h2>
        <p className="text-sm text-ink-muted">
          Days from ordering to arrival, plus a cushion. Order-by date = stockout − lead time − cushion.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-muted">
                <th scope="col" className="py-2 pr-3 font-medium">Vendor</th>
                <th scope="col" className="py-2 pr-3 font-medium">BlueTide says</th>
                <th scope="col" className="py-2 pr-3 font-medium">Lead time (days)</th>
                <th scope="col" className="py-2 font-medium">Cushion (days)</th>
              </tr>
            </thead>
            <tbody>
              {data.vendors.map((v) => {
                const row = values.vendors[v.vendorCode];
                const setRow = (change: Partial<typeof row>) =>
                  setValues({ ...values, vendors: { ...values.vendors, [v.vendorCode]: { ...row, ...change } } });
                return (
                  <tr key={v.vendorCode} className="border-t border-line align-top">
                    <th scope="row" className="py-2 pr-3 text-left font-normal">
                      <span className="font-medium">{v.vendorName}</span>
                      <span className="block text-xs text-ink-muted">{v.vendorCode}</span>
                      {(v.leadTimeDays === null || v.bufferDays === null) && (
                        <span className="mt-1 block">
                          <Pill tone="review">Lead time not set</Pill>
                        </span>
                      )}
                    </th>
                    <td className="py-2 pr-3 text-ink-muted">{v.leadTimeRaw ?? "Nothing"} (evidence only)</td>
                    <td className="py-2 pr-3">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        inputMode="numeric"
                        aria-label={`Lead time in days for ${v.vendorName}`}
                        value={row.lead}
                        onChange={(e) => setRow({ lead: e.target.value })}
                        className={numberInput}
                      />
                    </td>
                    <td className="py-2">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        inputMode="numeric"
                        aria-label={`Cushion in days for ${v.vendorName}`}
                        value={row.buffer}
                        onChange={(e) => setRow({ buffer: e.target.value })}
                        className={numberInput}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-card p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Reorder choices</h2>
        <p className="text-sm text-ink-muted">
          Whether Tidewatch suggests buying an item. Stock and open orders stay visible either way.
          Fresh and old-system (ZZ) items are never reordered, so they aren&apos;t listed.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-muted">
                <th scope="col" className="py-2 pr-3 font-medium">Item</th>
                <th scope="col" className="py-2 pr-3 font-medium">BlueTide status</th>
                <th scope="col" className="py-2 pr-3 font-medium">Dana&apos;s choice</th>
                <th scope="col" className="py-2 font-medium">Result now</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.itemCode} className="border-t border-line align-top">
                  <th scope="row" className="py-2 pr-3 text-left font-normal">
                    <span className="font-medium">{item.description}</span>
                    <span className="block text-xs text-ink-muted">{item.itemCode}</span>
                  </th>
                  <td className="py-2 pr-3 text-ink-muted">{item.sourceStatus || "Blank"}</td>
                  <td className="py-2 pr-3">
                    <select
                      aria-label={`Reorder choice for ${item.description}`}
                      value={values.items[item.itemCode]}
                      onChange={(e) =>
                        setValues({
                          ...values,
                          items: { ...values.items, [item.itemCode]: e.target.value as Choice },
                        })
                      }
                      className="rounded-full border border-control bg-card px-3 py-1.5 text-sm"
                    >
                      <option value="follow">Follow BlueTide status</option>
                      <option value="yes">Reorder</option>
                      <option value="no">Don&apos;t reorder</option>
                    </select>
                  </td>
                  <td className="py-2">
                    {item.reorderEnabled ? "Reordered" : "Not reordered"}
                    <span className="block text-xs text-ink-muted">{item.reason}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Save bar stays in view while Dana edits a long form. */}
      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t border-line bg-fog/95 px-4 py-3 sm:mx-0 sm:rounded-2xl sm:border">
        <button
          type="submit"
          disabled={changes === 0 || status.state === "saving"}
          className="rounded-full bg-seaglass px-5 py-2 text-sm font-medium text-kelp disabled:opacity-60"
        >
          {status.state === "saving" ? "Saving…" : `Save ${changes || ""} ${changes === 1 ? "change" : "changes"}`}
        </button>
        <button
          type="button"
          disabled={changes === 0 || status.state === "saving"}
          onClick={() => {
            setValues(saved);
            setStatus({ state: "idle" });
          }}
          className="rounded-full px-4 py-2 text-sm font-medium text-kelp hover:underline disabled:text-ink-muted disabled:no-underline"
        >
          Discard changes
        </button>
        <p aria-live="polite" className="text-sm">
          {status.state === "saved" && changes === 0 && "Saved. Order dates and stock to clear now use these values."}
          {status.state === "error" && (
            <span role="alert" className="text-rust">
              Not saved: {status.message}
            </span>
          )}
        </p>
      </div>
    </form>
  );
}
