"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDate, formatQty } from "@/lib/format";
import type { ItemDetail } from "@/lib/itemDetail";
import { actionFor, explainPlan, flagsFor } from "@/lib/planLabels";
import type { ItemPlan } from "@/lib/projection";
import { DemandWeeks } from "./DemandWeeks";
import { HandledSection } from "./HandledSection";
import { Icon } from "./Icon";
import { IncomingPOs } from "./IncomingPOs";
import { LotsTable } from "./LotsTable";
import { OpenOrders } from "./OpenOrders";
import { OrderMath } from "./OrderMath";
import { PanelSection } from "./PanelSection";
import { Pill } from "./Pill";
import { Reconciliation } from "./Reconciliation";
import { StockChart } from "./StockChart";

type Props = {
  plan: ItemPlan; // already on the page, so the header shows at once
  planningDate: string;
  projectionWeeks: number;
  onClose: () => void;
};

type Load =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; detail: ItemDetail };

/**
 * One item's evidence, from GET /api/items/[code]. A native modal <dialog>
 * keeps keyboard focus inside the panel and closes on Esc; focus goes back
 * to whatever opened it.
 */
export function ItemPanel({ plan, planningDate, projectionWeeks, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [version, setVersion] = useState(0); // bumped after a save, to fetch fresh evidence
  const router = useRouter();

  useEffect(() => {
    const dialog = dialogRef.current!;
    const opener = document.activeElement as HTMLElement | null;
    if (!dialog.open) dialog.showModal();
    return () => opener?.focus();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/items/${encodeURIComponent(plan.itemCode)}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!body.ok) throw new Error(body.error ?? "Couldn't load this item.");
        setLoad({ state: "ready", detail: body as ItemDetail });
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") setLoad({ state: "error", message: error.message });
      });
    return () => controller.abort();
  }, [plan.itemCode, version]);

  const action = actionFor(plan, projectionWeeks);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      // A click on the dimmed backdrop lands on the dialog itself, never on its content.
      onClick={(e) => e.target === dialogRef.current && dialogRef.current?.close()}
      aria-labelledby="item-panel-title"
      className="item-panel fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-full max-w-none bg-card p-0 text-ink shadow-xl sm:max-w-[720px]"
    >
      <div className="flex h-full flex-col">
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id="item-panel-title" className="text-lg font-semibold leading-snug">
              {plan.description}
            </h2>
            <p className="text-sm text-ink-muted">
              {plan.itemCode} · {plan.vendorName} · sold in {plan.sellUom === "LB" ? "pounds" : "cases"}
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              <Pill tone={action.tone}>{action.label}</Pill>
              {flagsFor(plan).map((f) => (
                <Pill key={f.label} tone={f.tone}>
                  {f.label}
                </Pill>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="rounded-full p-2 text-ink-muted hover:bg-fog hover:text-ink"
          >
            <Icon name="close" className="size-5" />
            <span className="sr-only">Close</span>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 pb-8 sm:px-6">
          <PanelSection title="Why">
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {explainPlan(plan, projectionWeeks).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="mt-2 text-sm text-ink-muted">
              Available now: <strong className="font-medium text-ink">{formatQty(plan.availableNow, plan.sellUom)}</strong>
              {" · "}Planning for {formatDate(planningDate)}
            </p>
          </PanelSection>

          <PanelSection title="Projected stock">
            <StockChart plan={plan} planningDate={planningDate} />
          </PanelSection>

          {load.state === "loading" && (
            <p className="mt-6 text-sm text-ink-muted" role="status">
              Loading lots, orders and sales…
            </p>
          )}
          {load.state === "error" && (
            <p className="mt-6 rounded-xl bg-rust-bg p-3 text-sm text-rust" role="alert">
              Couldn&apos;t load the evidence for this item: {load.message}
            </p>
          )}
          {load.state === "ready" && (
            <Evidence
              detail={load.detail}
              plan={plan}
              planningDate={planningDate}
              onChanged={() => {
                setVersion((v) => v + 1); // reload this panel's evidence
                router.refresh(); // and the page behind it (Handled tags, counts)
              }}
            />
          )}
        </div>
      </div>
    </dialog>
  );
}

function Evidence({
  detail,
  plan,
  planningDate,
  onChanged,
}: {
  detail: ItemDetail;
  plan: ItemPlan;
  planningDate: string;
  onChanged: () => void;
}) {
  const uom = plan.sellUom;
  return (
    <>
      <PanelSection title="From on hand to available now">
        <Reconciliation detail={detail} plan={plan} />
      </PanelSection>
      <PanelSection title="Lots">
        <LotsTable lots={detail.lots} uom={uom} />
      </PanelSection>
      <PanelSection title="Open customer orders">
        <OpenOrders orders={detail.openOrders} uom={uom} />
      </PanelSection>
      <PanelSection title="Incoming purchase orders">
        <IncomingPOs incoming={plan.incoming} uom={uom} />
      </PanelSection>
      <PanelSection title="Demand">
        <DemandWeeks detail={detail} plan={plan} planningDate={planningDate} />
      </PanelSection>
      <PanelSection title="Lead time and order-by date">
        <OrderMath plan={plan} />
      </PanelSection>
      <PanelSection title="Handled">
        <HandledSection plan={plan} notes={detail.handled} onChanged={onChanged} />
      </PanelSection>
      {detail.cleaningNotes.length > 0 && (
        <PanelSection title="Data notes for this item">
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {detail.cleaningNotes.map((n, i) => (
              <li key={i}>
                {n.action}: {n.reason}
                {n.detail && <span className="text-ink-muted"> ({n.detail})</span>}
                <span className="text-xs text-ink-muted"> · {n.sourceFile}</span>
              </li>
            ))}
          </ul>
        </PanelSection>
      )}
    </>
  );
}
