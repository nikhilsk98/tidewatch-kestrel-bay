"use client";

import { useState } from "react";
import { formatDate, formatQty, unitName } from "@/lib/format";
import type { ItemDetail } from "@/lib/itemDetail";
import type { ItemPlan } from "@/lib/projection";

type Props = {
  plan: ItemPlan;
  notes: ItemDetail["handled"];
  onChanged: () => void; // reload the panel and the page after a save or undo
};

const inputClass = "mt-1 w-full rounded-xl border border-control bg-card px-3 py-2 text-sm";

/** Send a JSON request and return the API's error message, or null when it worked. */
async function send(url: string, method: string, body?: unknown): Promise<string | null> {
  try {
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const result = await response.json();
    return result.ok ? null : (result.error ?? "Couldn't save.");
  } catch {
    return "Couldn't reach the server. Check the connection and try again.";
  }
}

/**
 * "I've handled this". A note only labels the item: it never adds supply,
 * never changes a status or a date, and is never matched to a PO
 * automatically. Dana checks that herself.
 */
export function HandledSection({ plan, notes, onChanged }: Props) {
  const [qty, setQty] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<string | null>(null); // what's being saved
  const [error, setError] = useState<string | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setPending("save");
    setError(null);
    const problem = await send("/api/handled", "POST", {
      itemCode: plan.itemCode,
      qty: qty || null,
      expectedDate: expectedDate || null,
      note: note || null,
    });
    setPending(null);
    if (problem) return setError(problem);
    setQty("");
    setExpectedDate("");
    setNote("");
    onChanged();
  }

  async function undo(id: number) {
    setPending(`undo-${id}`);
    setError(null);
    const problem = await send(`/api/handled/${id}`, "PATCH");
    setPending(null);
    if (problem) return setError(problem);
    onChanged();
  }

  const unit = unitName(plan.sellUom);

  return (
    <>
      {notes.length > 0 && (
        <ul className="mb-4 space-y-2 text-sm">
          {notes.map((h) => (
            <li key={h.id} className="flex items-start justify-between gap-3 rounded-xl bg-fog p-3">
              <div>
                <p className="font-medium">Handled</p>
                {h.note && <p>{h.note}</p>}
                <p className="text-xs text-ink-muted">
                  {h.qty !== null && `${formatQty(h.qty, plan.sellUom)} · `}
                  {h.expectedDate && `expected ${formatDate(h.expectedDate)} · `}
                  noted {formatDate(h.createdAt.slice(0, 10), "medium")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => undo(h.id)}
                disabled={pending !== null}
                className="shrink-0 rounded-full border border-control px-3 py-1 text-sm hover:bg-card disabled:opacity-60"
              >
                {pending === `undo-${h.id}` ? "Undoing…" : "Undo"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {notes.length > 0 && plan.incoming.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-accent/40 bg-amber-bg p-3 text-sm text-amber-ink">
          <p className="font-medium">Check whether one of these POs is the one you handled.</p>
          <ul className="mt-1 list-disc pl-5 tabular-nums">
            {plan.incoming.map((po) => (
              <li key={`${po.poNo}-${po.lineNo}`}>
                {po.poNo} / {po.lineNo}: {formatQty(po.qty, plan.sellUom)}, vendor date{" "}
                {po.expectedDate ? formatDate(po.expectedDate, "medium") : "none"}
                {po.isOverdue && " (overdue)"}
              </li>
            ))}
          </ul>
          <p className="mt-1">Tidewatch doesn&apos;t match them for you, so nothing is counted twice.</p>
        </div>
      )}

      <form onSubmit={save} className="rounded-xl border border-line p-4">
        <p className="text-sm font-medium">I&apos;ve handled this</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            Quantity ordered, in {unit} <span className="text-ink-muted">(optional)</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block text-sm">
            Expected arrival <span className="text-ink-muted">(optional)</span>
            <input
              type="date"
              value={expectedDate}
              onChange={(e) => setExpectedDate(e.target.value)}
              className={inputClass}
            />
          </label>
        </div>
        <label className="mt-3 block text-sm">
          Note <span className="text-ink-muted">(optional)</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder="e.g. Emailed Bien Xanh for 400 cases"
            className={inputClass}
          />
        </label>
        {error && (
          <p role="alert" className="mt-3 rounded-xl bg-rust-bg p-3 text-sm text-rust">
            {error}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending !== null}
            className="rounded-full bg-seaglass px-4 py-2 text-sm font-medium text-kelp disabled:opacity-60"
          >
            {pending === "save" ? "Saving…" : "Mark as handled"}
          </button>
          <p className="text-xs text-ink-muted">
            This only labels the item. It doesn&apos;t add stock or change any date.
          </p>
        </div>
      </form>
    </>
  );
}
