import { formatDate } from "@/lib/format";
import type { HandledNote } from "@/lib/handled";
import type { ItemPlan } from "@/lib/projection";
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

/** Lead time, cushion and earliest arrival for a vendor group (same for every item of that vendor). */
function VendorGroupHeader({ group }: { group: Group }) {
  const first = group.plans[0];
  return (
    <tr className="border-t border-line bg-fog/70">
      <th scope="colgroup" colSpan={COLUMNS} className="px-5 py-2.5 text-left font-normal">
        <span className="font-semibold">{group.title}</span>
        <span className="ml-2 text-xs text-ink-muted">
          {group.plans.length} {group.plans.length === 1 ? "item" : "items"}
        </span>
        <span className="mt-0.5 block text-xs text-ink-muted sm:mt-0 sm:ml-3 sm:inline">
          {first.leadTimeDays === null
            ? "Lead time not set"
            : `${first.leadTimeDays} days lead time + ${first.bufferDays} days cushion`}
          {first.arrivesIfOrderedToday &&
            ` · Ordered today, arrives about ${formatDate(first.arrivesIfOrderedToday)}`}
        </span>
      </th>
    </tr>
  );
}

function PlainGroupHeader({ group }: { group: Group }) {
  return (
    <tr className="border-t border-line bg-fog/70">
      <th scope="colgroup" colSpan={COLUMNS} className="px-5 py-2.5 text-left font-semibold">
        {group.title}
        <span className="ml-2 text-xs font-normal text-ink-muted">
          {group.plans.length} {group.plans.length === 1 ? "item" : "items"}
        </span>
      </th>
    </tr>
  );
}

export function Worklist(props: Props) {
  const { filters, handledByItem } = props;
  const handledCodes = new Set(handledByItem.keys());
  const { rows, hiddenHandled } = filterPlans(props.plans, filters, handledCodes);
  const groups = groupPlans(sortPlans(rows, filters.sortBy), filters.groupBy);

  const vendors = [...new Map(props.plans.map((p) => [p.vendorCode, p.vendorName]))]
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <section
      aria-labelledby="worklist-title"
      className="rounded-2xl border border-line bg-card shadow-sm"
    >
      <div className="flex flex-col gap-3 p-5 pb-4">
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
        <div className="border-t border-line p-8 text-center text-sm text-ink-muted">
          <p>No items match these filters.</p>
          <button
            type="button"
            onClick={() => props.onFilters(DEFAULT_FILTERS)}
            className="mt-2 font-medium text-kelp hover:underline"
          >
            Reset filters
          </button>
        </div>
      ) : (
        // Wide table scrolls inside its own box, never the whole page.
        <div className="overflow-x-auto">
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
                {filters.groupBy === "vendor" ? (
                  <VendorGroupHeader group={group} />
                ) : (
                  <PlainGroupHeader group={group} />
                )}
                {group.plans.map((plan) => (
                  <WorklistRow
                    key={plan.itemCode}
                    plan={plan}
                    handled={handledCodes.has(plan.itemCode)}
                    projectionWeeks={props.projectionWeeks}
                    onReview={props.onReview}
                  />
                ))}
              </tbody>
            ))}
          </table>
        </div>
      )}
      <p className="border-t border-line px-5 py-3 text-xs text-ink-muted">
        Projected stockout is the safe view: no PO is counted, because no vendor date is
        confirmed. Open an item to see the “if vendor dates hold” view.
      </p>
    </section>
  );
}
