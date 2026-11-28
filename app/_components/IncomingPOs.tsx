import { formatDate, formatQty } from "@/lib/format";
import type { ItemPlan } from "@/lib/projection";
import { Pill } from "./Pill";

/** How each PO is treated. Overdue or undated POs never get an invented arrival date. */
function timing(po: ItemPlan["incoming"][number]) {
  if (po.isOverdue && po.expectedDate) {
    return { tone: "review" as const, text: `Overdue since ${formatDate(po.expectedDate, "short")}, not counted` };
  }
  if (!po.expectedDate) {
    return { tone: "review" as const, text: "Arrival date unknown, not counted" };
  }
  return {
    tone: "plain" as const,
    text: "Vendor estimate, unconfirmed: counted only “if vendor dates hold”",
  };
}

export function IncomingPOs({ incoming, uom }: { incoming: ItemPlan["incoming"]; uom: string }) {
  if (incoming.length === 0) return <p className="text-sm text-ink-muted">No open purchase orders.</p>;

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm tabular-nums">
          <thead>
            <tr className="text-left text-xs text-ink-muted">
              <th scope="col" className="py-1.5 pr-3 font-medium">PO</th>
              <th scope="col" className="py-1.5 pr-3 text-right font-medium">Still to come</th>
              <th scope="col" className="py-1.5 pr-3 font-medium">Vendor date</th>
              <th scope="col" className="py-1.5 font-medium">Timing</th>
            </tr>
          </thead>
          <tbody>
            {incoming.map((po) => {
              const t = timing(po);
              return (
                <tr key={`${po.poNo}-${po.lineNo}`} className="border-t border-line align-top">
                  <td className="py-1.5 pr-3">
                    {po.poNo} / {po.lineNo}
                  </td>
                  <td className="py-1.5 pr-3 text-right whitespace-nowrap">{formatQty(po.qty, uom)}</td>
                  <td className="py-1.5 pr-3 whitespace-nowrap">
                    {po.expectedDate ? formatDate(po.expectedDate) : "None"}
                  </td>
                  <td className="py-1.5">
                    <Pill tone={t.tone}>{t.text}</Pill>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        Every vendor date is the vendor&apos;s original estimate; none is confirmed. The main
        screen counts no PO.
      </p>
    </>
  );
}
