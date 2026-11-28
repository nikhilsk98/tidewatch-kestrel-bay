import { formatDate, formatDaysFrom, formatQty } from "@/lib/format";
import type { HandledNote } from "@/lib/handled";
import { actionFor, flagsFor } from "@/lib/planLabels";
import type { ItemPlan } from "@/lib/projection";
import { Pill } from "./Pill";

type Props = {
  plan: ItemPlan;
  handledNote: HandledNote | undefined;
  projectionWeeks: number;
  onReview: (code: string) => void;
};

/**
 * One worklist item on a phone. Product, status, order-by date and Review
 * come first; the reason, stockout and available stock follow.
 */
export function WorklistCard({ plan, handledNote, projectionWeeks, onReview }: Props) {
  const action = actionFor(plan, projectionWeeks);
  const late = plan.daysUntilOrderBy !== null && plan.daysUntilOrderBy <= 0;

  return (
    <li className="border-t border-line px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium leading-snug">{plan.description}</p>
          <p className="text-xs text-ink-muted">{plan.itemCode}</p>
        </div>
        <button
          type="button"
          onClick={() => onReview(plan.itemCode)}
          aria-label={`Review ${plan.description} (${plan.itemCode})`}
          className="shrink-0 rounded-full border border-control px-3 py-1.5 text-sm font-medium"
        >
          Review
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm tabular-nums">
        <Pill tone={action.tone}>{action.label}</Pill>
        {plan.orderByDate && (
          <span>
            Order by {formatDate(plan.orderByDate, "short")}{" "}
            <span className={late ? "font-medium text-rust" : "text-ink-muted"}>
              ({formatDaysFrom(plan.daysUntilOrderBy!)})
            </span>
          </span>
        )}
      </div>

      <p className="mt-1 text-xs text-ink-muted">{action.reason}</p>
      {flagsFor(plan).length > 0 && (
        <ul className="mt-1.5 flex flex-wrap gap-1">
          {flagsFor(plan).map((flag) => (
            <li key={flag.label}>
              <Pill tone={flag.tone}>{flag.label}</Pill>
            </li>
          ))}
        </ul>
      )}

      <dl className="mt-2 grid grid-cols-2 gap-2 text-sm tabular-nums">
        <div>
          <dt className="text-xs text-ink-muted">Projected stockout</dt>
          <dd>{plan.runOutDate ? formatDate(plan.runOutDate, "short") : `None within ${projectionWeeks} weeks`}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-muted">Available now</dt>
          <dd className={plan.availableNow < 0 ? "font-medium text-rust" : ""}>
            {formatQty(plan.availableNow, plan.sellUom)}
            {plan.availableNow < 0 && " (already short)"}
          </dd>
        </div>
      </dl>

      {handledNote && (
        <p className="mt-2 text-xs text-ink-muted">
          <Pill tone="plain">Handled</Pill> {handledNote.note}
        </p>
      )}
    </li>
  );
}
