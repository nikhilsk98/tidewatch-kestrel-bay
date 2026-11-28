import { formatDate, formatDaysFrom, formatQty } from "@/lib/format";
import { actionFor, flagsFor } from "@/lib/planLabels";
import type { HandledNote } from "@/lib/handled";
import type { ItemPlan } from "@/lib/projection";
import { Pill } from "./Pill";

type Props = {
  plan: ItemPlan;
  handledNote: HandledNote | undefined; // the newest active note, if any
  projectionWeeks: number;
  onReview: (code: string) => void;
};

export function WorklistRow({ plan, handledNote, projectionWeeks, onReview }: Props) {
  const action = actionFor(plan, projectionWeeks);
  const flags = flagsFor(plan);
  const late = plan.daysUntilOrderBy !== null && plan.daysUntilOrderBy <= 0;

  return (
    // The Review button is the keyboard target; clicking anywhere on the row is a mouse shortcut.
    <tr
      onClick={() => onReview(plan.itemCode)}
      className="cursor-pointer border-t border-line align-top hover:bg-fog/60"
    >
      <td className="py-3 pr-3 pl-5">
        <p className="font-medium">{plan.description}</p>
        <p className="text-xs text-ink-muted">
          {plan.itemCode} · {plan.vendorName}
        </p>
        {handledNote && (
          <p className="mt-1 text-xs text-ink-muted">
            <Pill tone="plain">Handled</Pill> {handledNote.note}
          </p>
        )}
      </td>
      <td className="py-3 pr-3">
        <Pill tone={action.tone}>{action.label}</Pill>
        <p className="mt-1 text-xs text-ink-muted">{action.reason}</p>
        {flags.length > 0 && (
          <ul className="mt-1.5 flex flex-wrap gap-1">
            {flags.map((flag) => (
              <li key={flag.label} title={flag.reason}>
                <Pill tone={flag.tone}>{flag.label}</Pill>
              </li>
            ))}
          </ul>
        )}
      </td>
      <td className="py-3 pr-3 whitespace-nowrap tabular-nums">
        {plan.orderByDate ? (
          <>
            <p>{formatDate(plan.orderByDate, "short")}</p>
            <p className={`text-xs ${late ? "font-medium text-rust" : "text-ink-muted"}`}>
              {formatDaysFrom(plan.daysUntilOrderBy!)}
            </p>
          </>
        ) : (
          <p className="text-xs text-ink-muted">No order-by date</p>
        )}
      </td>
      <td className="py-3 pr-3 whitespace-nowrap tabular-nums">
        {plan.runOutDate ? (
          formatDate(plan.runOutDate, "short")
        ) : (
          <span className="text-xs text-ink-muted">None within {projectionWeeks} weeks</span>
        )}
      </td>
      <td className="py-3 pr-3 text-right whitespace-nowrap tabular-nums">
        <p className={plan.availableNow < 0 ? "font-medium text-rust" : ""}>
          {formatQty(plan.availableNow, plan.sellUom)}
        </p>
        {plan.availableNow < 0 && <p className="text-xs text-rust">already short</p>}
      </td>
      <td className="py-3 pr-5 text-right">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation(); // the row's own click would open it a second time
            onReview(plan.itemCode);
          }}
          className="rounded-full border border-control px-3 py-1 text-sm font-medium hover:bg-seaglass hover:text-kelp"
          aria-label={`Review ${plan.description} (${plan.itemCode})`}
        >
          Review
        </button>
      </td>
    </tr>
  );
}
