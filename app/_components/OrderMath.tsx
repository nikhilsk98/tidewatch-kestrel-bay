import { formatDate, formatDaysFrom } from "@/lib/format";
import type { ItemPlan } from "@/lib/projection";

/** The order-by arithmetic, written out so Dana can check it. */
export function OrderMath({ plan }: { plan: ItemPlan }) {
  if (plan.leadTimeDays === null || plan.bufferDays === null) {
    return (
      <p className="text-sm">
        No lead time is set for {plan.vendorName}, so Tidewatch won&apos;t guess an order-by date.
        Add it in Purchasing settings.
      </p>
    );
  }
  const total = plan.leadTimeDays + plan.bufferDays;

  return (
    <>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm tabular-nums">
        <dt>Lead time ({plan.vendorName})</dt>
        <dd className="text-right">{plan.leadTimeDays} days</dd>
        <dt>Cushion</dt>
        <dd className="text-right">{plan.bufferDays} days</dd>
        {plan.runOutDate && plan.orderByDate ? (
          <>
            <dt>Projected stockout (no PO counted)</dt>
            <dd className="text-right">{formatDate(plan.runOutDate)}</dd>
            <dt className="font-semibold">Order by = stockout − {total} days</dt>
            <dd className="text-right font-semibold">
              {formatDate(plan.orderByDate)}
              <span className="block text-xs font-normal text-ink-muted">
                {formatDaysFrom(plan.daysUntilOrderBy!)}
              </span>
            </dd>
          </>
        ) : (
          <>
            <dt>Order-by date</dt>
            <dd className="text-right text-ink-muted">
              {plan.status === "not reordered" ? "Not reordered" : "No stockout projected"}
            </dd>
          </>
        )}
        {plan.arrivesIfOrderedToday && (
          <>
            <dt>Ordered today, arrives about</dt>
            <dd className="text-right">{formatDate(plan.arrivesIfOrderedToday)}</dd>
          </>
        )}
      </dl>
      <p className="mt-3 rounded-xl border border-dashed border-control p-3 text-sm text-ink-muted">
        Suggested order quantity: not yet available. It needs new purchasing logic and is being
        planned separately.
      </p>
    </>
  );
}
