import { formatDate, formatDaysFrom, formatQty } from "@/lib/format";
import type { HandledNote } from "@/lib/handled";
import { flagsFor } from "@/lib/planLabels";
import type { ItemPlan } from "@/lib/projection";
import { Icon } from "./Icon";
import { Pill } from "./Pill";

type Props = {
  plans: ItemPlan[];
  handledByItem: Map<string, HandledNote[]>;
  onReview: (code: string) => void;
  onShowAll: () => void;
};

/** One short reason: the most important warning flag (amber), otherwise how late the order is (rust). */
function shortReason(plan: ItemPlan): { text: string; tone: "review" | "urgent" } {
  const flag = flagsFor(plan).find((f) => f.tone === "review");
  if (flag) return { text: flag.label, tone: "review" };
  return { text: `Ordering ${formatDaysFrom(plan.daysUntilOrderBy!)}`, tone: "urgent" };
}

/** One date or quantity: a shortage now if there is one, otherwise the run-out date. */
function keyFact(plan: ItemPlan): string {
  if (plan.availableNow < 0) return `Short ${formatQty(-plan.availableNow, plan.sellUom)} now`;
  return plan.runOutDate ? `Runs out ${formatDate(plan.runOutDate, "short")}` : "";
}

/**
 * Every "order now" item, most days late first. All of them are listed (not
 * a top few), so nothing urgent is cut off. Handled items stay visible,
 * tagged, at the end: an urgent shortage is never hidden.
 */
export function AttentionPanel({ plans, handledByItem, onReview, onShowAll }: Props) {
  const urgent = plans
    .filter((p) => p.status === "order now")
    .sort((a, b) => {
      const handledA = handledByItem.has(a.itemCode) ? 1 : 0;
      const handledB = handledByItem.has(b.itemCode) ? 1 : 0;
      return handledA - handledB || a.daysUntilOrderBy! - b.daysUntilOrderBy!;
    });

  return (
    <section
      aria-labelledby="attention-title"
      className="rounded-2xl bg-kelp p-5 text-white shadow-sm"
    >
      <h2 id="attention-title" className="flex items-center gap-2 text-lg font-semibold">
        <Icon name="alert" className="size-5 text-rust-bg" />
        Needs ordering now
      </h2>
      <p className="mt-1 text-sm text-kelp-muted">
        Order-by date is today or past. Most days late first.
      </p>

      {urgent.length === 0 ? (
        <p className="mt-4 text-sm text-kelp-muted">Nothing has passed its order-by date.</p>
      ) : (
        <ol className="mt-4 flex flex-col divide-y divide-white/10">
          {urgent.map((plan) => (
            <li key={plan.itemCode} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="font-medium leading-snug">{plan.description}</p>
                <p className="text-xs text-kelp-muted">
                  {plan.itemCode}
                  {handledByItem.has(plan.itemCode) && " · Handled"}
                </p>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <Pill tone={shortReason(plan).tone}>{shortReason(plan).text}</Pill>
                  <span className="text-kelp-muted tabular-nums">{keyFact(plan)}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => onReview(plan.itemCode)}
                aria-label={`Review ${plan.description} (${plan.itemCode})`}
                className="shrink-0 rounded-full bg-seaglass px-3 py-1 text-sm font-medium text-kelp hover:bg-white focus-visible:outline-seaglass"
              >
                Review
              </button>
            </li>
          ))}
        </ol>
      )}

      <button
        type="button"
        onClick={onShowAll}
        className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-seaglass hover:underline focus-visible:outline-seaglass"
      >
        Show these in the worklist
        <Icon name="arrow" />
      </button>
    </section>
  );
}
