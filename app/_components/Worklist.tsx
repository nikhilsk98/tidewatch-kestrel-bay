import { formatDate } from "@/lib/format";
import type { HandledNote } from "@/lib/handled";
import type { ItemPlan } from "@/lib/projection";
import { WorklistCard } from "./WorklistCard";
import { WorklistFilters } from "./WorklistFilters";
import { WorklistRow } from "./WorklistRow";
import {
  DEFAULT_FILTERS,
  filterPlans,
  groupPlans,
  sortPlans,
  type Filters,
  type Group,
} from "./worklistView";

type Props = {
  plans: ItemPlan[];
  filters: Filters;
  onFilters: (filters: Filters) => void;
  handledByItem: Map<string, HandledNote[]>;
  projectionWeeks: number;
  planningDate: string;
  onReview: (code: string) => void;
};

const COLUMNS = 6;

/** The line under a group's name. A vendor group shows lead time, cushion and earliest arrival (the same for every item of that vendor). */
function groupDetail(group: Group, groupBy: Filters["groupBy"]): string {
  const count = `${group.plans.length} ${group.plans.length === 1 ? "item" : "items"}`;
  if (groupBy !== "vendor") return count;
  const first = group.plans[0];
  const lead =
    first.leadTimeDays === null
      ? "Lead time not set"
      : `${first.leadTimeDays} days lead time + ${first.bufferDays} days cushion`;
  const arrives = first.arrivesIfOrderedToday
    ? ` · Ordered today, arrives about ${formatDate(first.arrivesIfOrderedToday)}`
    : "";
  return `${count} · ${lead}${arrives}`;
}

/** Shown when the default view is empty: nothing needs ordering, so say when something next will. */
function NothingToOrder({ plans, hiddenHandled }: { plans: ItemPlan[]; hiddenHandled: number }) {
  const next = plans
    .filter((p) => p.status === "ok" && p.orderByDate)
    .sort((a, b) => (a.orderByDate! < b.orderByDate! ? -1 : 1))[0];
  return (
    <div className="border-t border-line p-8 text-center text-sm">
      <p className="font-medium">Nothing to order this week.</p>
      <p className="mt-1 text-ink-muted">
        {next
          ? `The next order-by date is ${formatDate(next.orderByDate!)}, for ${next.description} (${next.itemCode}).`
          : "No order-by date falls within the projection."}
        {hiddenHandled > 0 && ` ${hiddenHandled} handled ${hiddenHandled === 1 ? "item is" : "items are"} hidden.`}
      </p>
    </div>
  );
}

function NoMatches({ onReset }: { onReset: () => void }) {
  return (
    <div className="border-t border-line p-8 text-center text-sm text-ink-muted">
      <p>No items match these filters.</p>
      <button type="button" onClick={onReset} className="mt-2 font-medium text-kelp hover:underline">
        Reset filters
      </button>
    </div>
  );
}

export function Worklist(props: Props) {
  const { filters, handledByItem } = props;
  const handledCodes = new Set(handledByItem.keys());
  const { rows, hiddenHandled } = filterPlans(props.plans, filters, handledCodes);
  const groups = groupPlans(sortPlans(rows, filters.sortBy), filters.groupBy);
  // "Nothing to order" only makes sense when the view isn't narrowed by search or vendor.
  const isDefaultView = filters.risk === "needs action" && !filters.search.trim() && !filters.vendor;

  const vendors = [...new Map(props.plans.map((p) => [p.vendorCode, p.vendorName]))]
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <section
      aria-labelledby="worklist-title"
      className="rounded-2xl border border-line bg-card shadow-sm"
    >
      <div className="flex flex-col gap-3 p-4 pb-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="worklist-title" className="text-lg font-semibold">
            Purchasing worklist
          </h2>
          <p className="text-sm text-ink-muted" aria-live="polite">
            {rows.length} {rows.length === 1 ? "item" : "items"} shown
            {hiddenHandled > 0 && ` · ${hiddenHandled} handled hidden`}
          </p>
        </div>
        <WorklistFilters
          filters={filters}
          onFilters={props.onFilters}
          vendors={vendors}
          handledCount={handledByItem.size}
        />
      </div>

      {rows.length === 0 ? (
        isDefaultView ? (
          <NothingToOrder plans={props.plans} hiddenHandled={hiddenHandled} />
        ) : (
          <NoMatches onReset={() => props.onFilters(DEFAULT_FILTERS)} />
        )
      ) : (
        <>
          {/* Phones: one card per item. */}
          <div className="md:hidden">
            {groups.map((group) => (
              <section key={group.key} aria-label={group.title}>
                <h3 className="border-t border-line bg-fog/70 px-4 py-2.5">
                  <span className="block font-semibold">{group.title}</span>
                  <span className="block text-xs font-normal text-ink-muted">
                    {groupDetail(group, filters.groupBy)}
                  </span>
                </h3>
                <ul>
                  {group.plans.map((plan) => (
                    <WorklistCard
                      key={plan.itemCode}
                      plan={plan}
                      handledNote={handledByItem.get(plan.itemCode)?.[0]}
                      projectionWeeks={props.projectionWeeks}
                      onReview={props.onReview}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>

          {/* Tablets and up: a table, which scrolls inside its own box if it's ever too wide. */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[680px] text-sm">
              <caption className="sr-only">
                Items to review, planning for {formatDate(props.planningDate)}
              </caption>
              <thead>
                <tr className="text-left text-xs text-ink-muted">
                  <th scope="col" className="pb-2 pl-5 font-medium">Product</th>
                  <th scope="col" className="pb-2 font-medium">Recommended action</th>
                  <th scope="col" className="pb-2 font-medium">Order by</th>
                  <th scope="col" className="pb-2 font-medium">Projected stockout</th>
                  <th scope="col" className="pb-2 pr-4 text-right font-medium">Available now</th>
                  <th scope="col" className="pb-2 pr-5 text-right font-medium">
                    <span className="sr-only">Review</span>
                  </th>
                </tr>
              </thead>
              {groups.map((group) => (
                <tbody key={group.key}>
                  <tr className="border-t border-line bg-fog/70">
                    <th scope="colgroup" colSpan={COLUMNS} className="px-5 py-2.5 text-left font-normal">
                      <span className="font-semibold">{group.title}</span>
                      <span className="ml-3 text-xs text-ink-muted">{groupDetail(group, filters.groupBy)}</span>
                    </th>
                  </tr>
                  {group.plans.map((plan) => (
                    <WorklistRow
                      key={plan.itemCode}
                      plan={plan}
                      handledNote={handledByItem.get(plan.itemCode)?.[0]}
                      projectionWeeks={props.projectionWeeks}
                      onReview={props.onReview}
                    />
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        </>
      )}
      <p className="border-t border-line px-4 py-3 text-xs text-ink-muted sm:px-5">
        Projected stockout is the safe view: no PO is counted, because no vendor date is
        confirmed. Open an item to see the “if vendor dates hold” view.
      </p>
    </section>
  );
}
