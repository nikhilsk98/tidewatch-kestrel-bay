import type { ItemPlan } from "@/lib/projection";

/**
 * A made-up item plan for label tests. Defaults describe an item with no
 * shortage in sight; each test overrides only the fields it is about.
 */
export function makePlan(overrides: Partial<ItemPlan> = {}): ItemPlan {
  return {
    itemCode: "TST-1",
    description: "TEST SHRIMP",
    category: "Shrimp",
    sellUom: "CS",
    vendorCode: "VND",
    vendorName: "Test Vendor",
    reorderEnabled: true,
    reorderReason: "BlueTide: active",
    onHand: 100,
    sellable: 100,
    corrections: 0,
    promised: 0,
    availableNow: 100,
    leadTimeDays: 28,
    bufferDays: 7,
    status: "ok",
    runOutDate: null,
    orderByDate: null,
    daysUntilOrderBy: null,
    arrivesIfOrderedToday: "2026-12-14",
    scenarioStatus: "ok",
    scenarioRunOutDate: null,
    flags: { onlyOverdueCover: false, dependsOnUnconfirmedDelivery: false, estimatedDemand: false },
    weeklyForecast: [],
    estimatedWeeks: [],
    incoming: [],
    safeWeeklyEndStock: [],
    scenarioWeeklyEndStock: [],
    willExpireUnsold: [],
    ...overrides,
  };
}
