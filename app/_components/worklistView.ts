// Filtering, sorting and grouping the plans the server already returned.
// No business result is calculated here: statuses, dates and quantities
// come straight from lib/projection.ts.

import { needsAction, reliesOnVendorDates } from "@/lib/planLabels";
import type { ItemPlan } from "@/lib/projection";

export type Risk = "needs action" | "order now" | "order soon" | "vendor dates" | "everything";
export type GroupBy = "vendor" | "urgency";
export type SortBy = "order by" | "run out" | "available" | "name";

export type Filters = {
  search: string;
  vendor: string; // vendor code, "" = all vendors
  risk: Risk;
  groupBy: GroupBy;
  sortBy: SortBy;
  includeHandled: boolean;
};

// Dana buys by vendor, so the default groups by vendor, most urgent first.
export const DEFAULT_FILTERS: Filters = {
  search: "",
  vendor: "",
  risk: "needs action",
  groupBy: "vendor",
  sortBy: "order by",
  includeHandled: false,
};

export const RISK_OPTIONS: { value: Risk; label: string }[] = [
  { value: "needs action", label: "Needs action" },
  { value: "order now", label: "Order now" },
  { value: "order soon", label: "Order soon" },
  { value: "vendor dates", label: "Relying on vendor dates" },
  { value: "everything", label: "Everything" },
];

export const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: "order by", label: "Order-by date" },
  { value: "run out", label: "Projected stockout" },
  { value: "available", label: "Available now" },
  { value: "name", label: "Product name" },
];

function matchesRisk(plan: ItemPlan, risk: Risk): boolean {
  switch (risk) {
    case "needs action":
      return needsAction(plan);
    case "order now":
      return plan.status === "order now";
    case "order soon":
      return plan.status === "order soon";
    case "vendor dates":
      return reliesOnVendorDates(plan);
    case "everything":
      return true;
  }
}

function matchesSearch(plan: ItemPlan, search: string): boolean {
  const text = search.trim().toLowerCase();
  if (!text) return true;
  return (
    plan.description.toLowerCase().includes(text) ||
    plan.itemCode.toLowerCase().includes(text)
  );
}

/** The rows to show, plus how many matched but are hidden because they're handled. */
export function filterPlans(
  plans: ItemPlan[],
  filters: Filters,
  handledCodes: Set<string>,
): { rows: ItemPlan[]; hiddenHandled: number } {
  const matching = plans.filter(
    (plan) =>
      matchesRisk(plan, filters.risk) &&
      matchesSearch(plan, filters.search) &&
      (!filters.vendor || plan.vendorCode === filters.vendor),
  );
  if (filters.includeHandled) return { rows: matching, hiddenHandled: 0 };
  const rows = matching.filter((plan) => !handledCodes.has(plan.itemCode));
  return { rows, hiddenHandled: matching.length - rows.length };
}

// Dates are "YYYY-MM-DD" text, so comparing the text compares the dates.
// Missing dates sort last.
function compareDates(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

export function sortPlans(plans: ItemPlan[], sortBy: SortBy): ItemPlan[] {
  const byName = (a: ItemPlan, b: ItemPlan) => a.description.localeCompare(b.description);
  return [...plans].sort((a, b) => {
    switch (sortBy) {
      case "order by":
        return (
          compareDates(a.orderByDate, b.orderByDate) ||
          compareDates(a.runOutDate, b.runOutDate) ||
          byName(a, b)
        );
      case "run out":
        return compareDates(a.runOutDate, b.runOutDate) || byName(a, b);
      case "available":
        // Available now is in each item's own unit; sorting only orders rows, it never adds them up.
        return a.availableNow - b.availableNow || byName(a, b);
      case "name":
        return byName(a, b);
    }
  });
}

export type Group = { key: string; title: string; plans: ItemPlan[] };

const URGENCY_GROUPS: { status: ItemPlan["status"]; title: string }[] = [
  { status: "order now", title: "Order now" },
  { status: "order soon", title: "Order soon" },
  { status: "lead time not set", title: "Lead time not set" },
  { status: "ok", title: "Not urgent" },
  { status: "not reordered", title: "Not reordered" },
];

/** Groups keep the sort order inside them. Vendor groups appear in order of their most urgent row. */
export function groupPlans(plans: ItemPlan[], groupBy: GroupBy): Group[] {
  if (groupBy === "urgency") {
    return URGENCY_GROUPS.map((g) => ({
      key: g.status,
      title: g.title,
      plans: plans.filter((p) => p.status === g.status),
    })).filter((g) => g.plans.length > 0);
  }
  const groups = new Map<string, Group>();
  for (const plan of plans) {
    const group = groups.get(plan.vendorCode) ?? {
      key: plan.vendorCode,
      title: plan.vendorName,
      plans: [],
    };
    group.plans.push(plan);
    groups.set(plan.vendorCode, group);
  }
  return [...groups.values()];
}
