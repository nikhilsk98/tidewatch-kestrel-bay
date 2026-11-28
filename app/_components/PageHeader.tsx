import Link from "next/link";
import { formatDate } from "@/lib/format";
import { Icon } from "./Icon";

type Props = {
  planningDate: string;
  stockAsOf: string | null;
  search: string;
  onSearch: (value: string) => void;
};

export function PageHeader({ planningDate, stockAsOf, search, onSearch }: Props) {
  return (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Monday purchasing</h1>
        <p className="mt-0.5 text-ink-muted">What to buy. What to clear. Why.</p>
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <span>
            Planning for <strong className="font-medium">{formatDate(planningDate)}</strong>
          </span>
          <span className="text-ink-muted">
            Stock as of{" "}
            {stockAsOf ? formatDate(stockAsOf, "weekday") : "unknown (no import date recorded)"}
          </span>
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="relative block">
          <span className="sr-only">Search by product name or code</span>
          <Icon
            name="search"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search product or code"
            className="w-full rounded-full border border-control bg-card py-2 pr-4 pl-9 text-sm placeholder:text-ink-muted sm:w-72"
          />
        </label>
        <Link
          href="/settings"
          className="inline-flex items-center justify-center gap-2 rounded-full border border-control bg-card px-4 py-2 text-sm hover:bg-fog"
        >
          <Icon name="sliders" />
          Purchasing settings
        </Link>
      </div>
    </header>
  );
}
