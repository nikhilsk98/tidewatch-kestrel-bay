import {
  DEFAULT_FILTERS,
  RISK_OPTIONS,
  SORT_OPTIONS,
  type Filters,
  type GroupBy,
  type SortBy,
} from "./worklistView";

type Props = {
  filters: Filters;
  onFilters: (filters: Filters) => void;
  vendors: { code: string; name: string }[];
  handledCount: number; // items with an active handled note
};

const selectClass =
  "rounded-full border border-control bg-card px-3 py-1.5 text-sm";

function Segment({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm ${
        selected ? "bg-seaglass font-medium text-kelp" : "text-ink-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

export function WorklistFilters({ filters, onFilters, vendors, handledCount }: Props) {
  const set = (change: Partial<Filters>) => onFilters({ ...filters, ...change });
  const isDefault = JSON.stringify(filters) === JSON.stringify(DEFAULT_FILTERS);

  return (
    <div className="flex flex-col gap-3">
      <div
        role="group"
        aria-label="Risk"
        className="flex gap-1 overflow-x-auto rounded-full border border-line bg-fog p-1"
      >
        {RISK_OPTIONS.map((option) => (
          <Segment
            key={option.value}
            selected={filters.risk === option.value}
            onClick={() => set({ risk: option.value })}
          >
            {option.label}
          </Segment>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <label className="flex items-center gap-2">
          <span className="text-ink-muted">Vendor</span>
          <select
            value={filters.vendor}
            onChange={(e) => set({ vendor: e.target.value })}
            className={selectClass}
          >
            <option value="">All vendors</option>
            {vendors.map((v) => (
              <option key={v.code} value={v.code}>
                {v.name}
              </option>
            ))}
          </select>
        </label>

        <div role="group" aria-label="Group by" className="flex items-center gap-1">
          <span className="mr-1 text-ink-muted">Group by</span>
          {(["vendor", "urgency"] as GroupBy[]).map((g) => (
            <Segment key={g} selected={filters.groupBy === g} onClick={() => set({ groupBy: g })}>
              {g === "vendor" ? "Vendor" : "Urgency"}
            </Segment>
          ))}
        </div>

        <label className="flex items-center gap-2">
          <span className="text-ink-muted">Sort by</span>
          <select
            value={filters.sortBy}
            onChange={(e) => set({ sortBy: e.target.value as SortBy })}
            className={selectClass}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={filters.includeHandled}
            onChange={(e) => set({ includeHandled: e.target.checked })}
            className="size-4 accent-kelp"
          />
          Include handled ({handledCount})
        </label>

        <button
          type="button"
          onClick={() => onFilters(DEFAULT_FILTERS)}
          disabled={isDefault}
          className="rounded-full px-3 py-1.5 text-sm font-medium text-kelp underline-offset-2 hover:underline disabled:text-ink-muted disabled:no-underline"
        >
          Reset
        </button>
      </div>

      {filters.search.trim() && (
        <p className="text-sm text-ink-muted">
          Matching “{filters.search.trim()}”{" "}
          <button
            type="button"
            onClick={() => set({ search: "" })}
            className="font-medium text-kelp hover:underline"
          >
            Clear search
          </button>
        </p>
      )}
    </div>
  );
}
