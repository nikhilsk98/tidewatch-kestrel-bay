import { formatQty } from "@/lib/format";
import type { ItemDetail } from "@/lib/itemDetail";
import type { ItemPlan } from "@/lib/projection";
import { reconcile } from "@/lib/reconcile";

/** On hand to available now, step by step; it must land on the plan's number. */
export function Reconciliation({ detail, plan }: { detail: ItemDetail; plan: ItemPlan }) {
  const result = reconcile(detail, plan.availableNow);
  const uom = plan.sellUom;

  return (
    <>
      <table className="w-full text-sm tabular-nums">
        <tbody>
          {result.lines.map((line) => (
            <tr
              key={line.label}
              className={line.kind === "subtotal" ? "border-t border-ink/30 font-semibold" : ""}
            >
              <th scope="row" className={`py-1 text-left font-[inherit] ${line.kind === "step" ? "pl-4" : ""}`}>
                {line.kind === "step" && (line.qty < 0 ? "− " : "+ ")}
                {line.label}
              </th>
              <td className="py-1 text-right">
                {formatQty(line.kind === "step" ? Math.abs(line.qty) : line.qty, uom)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {result.balances ? (
        <p className="mt-2 text-xs text-ink-muted">
          Matches the plan&apos;s available now ({formatQty(plan.availableNow, uom)}).
        </p>
      ) : (
        <p className="mt-2 rounded-xl bg-rust-bg p-3 text-sm text-rust" role="alert">
          This doesn&apos;t match the plan&apos;s available now ({formatQty(plan.availableNow, uom)}).
          Please report it: the numbers on this screen may be out of date.
        </p>
      )}
    </>
  );
}
