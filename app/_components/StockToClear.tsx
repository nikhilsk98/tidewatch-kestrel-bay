import { formatDate, formatMoney, formatQty, locationName } from "@/lib/format";
import type { ItemPlan } from "@/lib/projection";
import type { StuckGroup, StuckLot, StuckSummary } from "@/lib/stuck";


type Props = {
  lots: StuckLot[];
  summary: StuckSummary;
  plans: ItemPlan[];
  agingReceivedDays: number;
  onReview: (code: string) => void;
};

const GROUPS: { group: StuckGroup; title: string; explain: string; valueKey: keyof StuckSummary }[] = [
  {
    group: "aging",
    title: "Too old to sell at full value",
    explain:
      "Inside the expiry line, expired, or expected to pass the line before it sells: stock that won't sell in time.",
    valueKey: "agingValue",
  },
  {
    group: "unavailable",
    title: "Can't be sold for another reason",
    explain: "Damaged, on QA hold, or expiry unknown.",
    valueKey: "unavailableValue",
  },
];

/** Items in both lists: something to clear, and still needs ordering. */
function BothListsNote({ lots, plans }: { lots: StuckLot[]; plans: ItemPlan[] }) {
  const stuckCodes = new Set(lots.map((l) => l.itemCode));
  const both = plans.filter(
    (p) => stuckCodes.has(p.itemCode) && (p.status === "order now" || p.status === "order soon"),
  );
  if (both.length === 0) return null;
  // Lead with the clearest example: the item with the most stock that can't cover future sales.
  const example = [...both].sort((a, b) => b.onHand - b.sellable - (a.onHand - a.sellable))[0];

  return (
    <p className="mt-3 rounded-xl bg-fog p-3 text-sm">
      <strong className="font-medium">
        {both.length} {both.length === 1 ? "product is" : "products are"} in both lists.
      </strong>{" "}
      Older lots can&apos;t cover future sales, so newer stock may still be needed. For example,{" "}
      {example.description} ({example.itemCode}) has {formatQty(example.onHand, example.sellUom)} on
      hand, of which {formatQty(example.sellable, example.sellUom)} can be sold for future sales.
    </p>
  );
}

export function StockToClear({ lots, summary, plans, agingReceivedDays, onReview }: Props) {
  return (
    <section
      id="stock-to-clear"
      aria-labelledby="stock-to-clear-title"
      className="mt-8 scroll-mt-6 rounded-2xl border border-line bg-card p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="stock-to-clear-title" className="text-lg font-semibold">
          What needs clearing?
        </h2>
        <p className="text-sm text-ink-muted tabular-nums">
          {summary.lots} lots · {formatMoney(summary.totalValue)} at cost ·{" "}
          {formatMoney(summary.harborValue)} at Harbor Cold Storage
        </p>
      </div>
      <BothListsNote lots={lots} plans={plans} />

      {GROUPS.map((g) => {
        const groupLots = lots.filter((l) => l.group === g.group);
        if (groupLots.length === 0) return null;
        return (
          <div key={g.group} className="mt-6">
            <h3 className="font-semibold">
              {g.title}{" "}
              <span className="text-sm font-normal text-ink-muted tabular-nums">
                · {groupLots.length} lots · {formatMoney(summary[g.valueKey])}
              </span>
            </h3>
            <p className="text-sm text-ink-muted">{g.explain}</p>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-ink-muted">
                    <th scope="col" className="py-2 pr-4 font-medium">Product and lot</th>
                    <th scope="col" className="py-2 pr-4 text-right font-medium">Quantity</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Sell by</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Location</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Reason</th>
                    <th scope="col" className="py-2 text-right font-medium">Value at cost</th>
                  </tr>
                </thead>
                <tbody>
                  {groupLots.map((lot) => (
                    <tr key={lot.lotNo} className="border-t border-line align-top">
                      <td className="py-2.5 pr-4">
                        <button
                          type="button"
                          onClick={() => onReview(lot.itemCode)}
                          className="text-left font-medium hover:underline"
                        >
                          {lot.description}
                        </button>
                        <p className="text-xs text-ink-muted">
                          {lot.itemCode} · lot {lot.lotNo}
                        </p>
                      </td>
                      <td className="py-2.5 pr-4 text-right whitespace-nowrap tabular-nums">
                        {formatQty(lot.qty, lot.sellUom)}
                      </td>
                      <td className="py-2.5 pr-4 whitespace-nowrap tabular-nums">
                        {lot.sellableUntil ? (
                          <>
                            {formatDate(lot.sellableUntil, "short")}
                            <span className="block text-xs text-ink-muted">last sellable day</span>
                          </>
                        ) : lot.expiryDate ? (
                          <>
                            {formatDate(lot.expiryDate, "short")}
                            <span className="block text-xs text-ink-muted">expiry</span>
                          </>
                        ) : (
                          <span className="text-xs text-ink-muted">Expiry unknown</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4">
                        {lot.atHarbor ? (
                          // Highlighted for cost (monthly pallet fees), not uncertainty, so kelp, not amber.
                          <span className="inline-flex whitespace-nowrap rounded-full border border-kelp px-2.5 py-0.5 text-xs font-semibold text-kelp">
                            Harbor Cold Storage
                          </span>
                        ) : (
                          locationName(lot.location)
                        )}
                      </td>
                      <td className="py-2.5 pr-4">
                        {lot.reason}
                        {lot.receivedLongAgo && (
                          <span className="block text-xs text-ink-muted">
                            Hint: received {lot.receivedDaysAgo} days ago (our {agingReceivedDays}
                            -day check, not Dana&apos;s rule)
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 text-right whitespace-nowrap tabular-nums">
                        {lot.value === null ? (
                          <span className="text-xs text-ink-muted">No cost recorded</span>
                        ) : (
                          formatMoney(lot.value)
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
      <p className="mt-4 text-xs text-ink-muted">
        Values use each lot&apos;s unit cost as reported; its currency isn&apos;t confirmed.
        Harbor Cold Storage charges by the pallet each month.
      </p>
    </section>
  );
}
