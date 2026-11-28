import { formatMoney } from "@/lib/format";
import { reliesOnVendorDates } from "@/lib/planLabels";
import type { ItemPlan } from "@/lib/projection";
import type { StuckSummary } from "@/lib/stuck";
import type { Risk } from "./worklistView";

type Props = {
  plans: ItemPlan[];
  stuckSummary: StuckSummary;
  risk: Risk;
  onRisk: (risk: Risk) => void;
};

const cardBase =
  "flex flex-col rounded-2xl border bg-card p-5 text-left shadow-sm transition-colors hover:border-control";

/**
 * Four counts, each filtering the worklist. The groups overlap (an item can
 * be "order now" and rely on vendor dates), so they are never added up.
 */
export function SummaryCards({ plans, stuckSummary, risk, onRisk }: Props) {
  const count = (test: (p: ItemPlan) => boolean) => plans.filter(test).length;
  const cards: { risk: Risk; title: string; value: number; definition: string; accent: string }[] = [
    {
      risk: "order now",
      title: "Order now",
      value: count((p) => p.status === "order now"),
      definition: "Order-by date is today or already past",
      accent: "text-rust",
    },
    {
      risk: "order soon",
      title: "Order soon",
      value: count((p) => p.status === "order soon"),
      definition: "Order-by date is within the next 14 days",
      accent: "text-ink",
    },
    {
      risk: "vendor dates",
      title: "Relying on vendor dates",
      value: count(reliesOnVendorDates),
      definition: "Covered only by an unconfirmed or overdue PO",
      accent: "text-amber-ink",
    },
  ];

  return (
    <section aria-label="Summary" className="mt-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const selected = risk === card.risk;
          return (
            <button
              key={card.risk}
              type="button"
              aria-pressed={selected}
              onClick={() => onRisk(selected ? "needs action" : card.risk)}
              className={`${cardBase} ${selected ? "border-kelp ring-2 ring-seaglass" : "border-line"}`}
            >
              <span className="text-sm font-medium text-ink-muted">{card.title}</span>
              <span className={`mt-1 text-3xl font-semibold tabular-nums ${card.accent}`}>
                {card.value} <span className="text-base font-normal text-ink-muted">items</span>
              </span>
              <span className="mt-1 text-sm text-ink-muted">{card.definition}</span>
              <span className="mt-3 text-xs font-medium text-kelp">
                {selected ? "Showing in worklist · click to clear" : "Show in worklist"}
              </span>
            </button>
          );
        })}

        <a href="#stock-to-clear" className={`${cardBase} border-line`}>
          <span className="text-sm font-medium text-ink-muted">Stock to clear</span>
          <span className="mt-1 text-3xl font-semibold tabular-nums">
            {stuckSummary.lots} <span className="text-base font-normal text-ink-muted">lots</span>
          </span>
          <span className="mt-1 text-sm text-ink-muted">
            {formatMoney(stuckSummary.totalValue)} at cost ·{" "}
            {formatMoney(stuckSummary.harborValue)} at Harbor
          </span>
          <span className="mt-3 text-xs font-medium text-kelp">Go to stock to clear</span>
        </a>
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        The groups overlap, so the counts aren&apos;t meant to be added together.
      </p>
    </section>
  );
}
