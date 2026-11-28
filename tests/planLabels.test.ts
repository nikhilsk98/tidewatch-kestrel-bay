import { describe, expect, it } from "vitest";
import { actionFor, explainPlan, flagsFor, needsAction, reliesOnVendorDates } from "@/lib/planLabels";
import { makePlan } from "./makePlan";

const WEEKS = 26;

describe("actionFor", () => {
  it("order now", () => {
    const plan = makePlan({ status: "order now", orderByDate: "2026-09-15", daysUntilOrderBy: -62 });
    expect(actionFor(plan, WEEKS)).toEqual({
      label: "Order now",
      reason: "Normal delivery would arrive too late",
      tone: "urgent",
    });
  });

  it("order soon shows the order-by date", () => {
    const plan = makePlan({ status: "order soon", orderByDate: "2026-11-17", daysUntilOrderBy: 1 });
    expect(actionFor(plan, WEEKS)).toMatchObject({ label: "Order by Nov 17", reason: "Order-by date is in 1 day" });
  });

  it("lead time not set", () => {
    const plan = makePlan({ status: "lead time not set", leadTimeDays: null, bufferDays: null });
    expect(actionFor(plan, WEEKS)).toMatchObject({ label: "Lead time not set", tone: "review" });
  });

  it("not reordered gives the reorder reason", () => {
    const plan = makePlan({ status: "not reordered", reorderEnabled: false, reorderReason: "Set by Dana" });
    expect(actionFor(plan, WEEKS)).toEqual({ label: "Not reordered", reason: "Set by Dana", tone: "muted" });
  });

  it("never says plain OK: a later order-by date, or the horizon", () => {
    const later = makePlan({ status: "ok", runOutDate: "2027-03-01", orderByDate: "2027-01-25", daysUntilOrderBy: 70 });
    expect(actionFor(later, WEEKS)).toMatchObject({ label: "Order by Jan 25", reason: "Not urgent: order-by date is in 70 days" });

    const noShortage = makePlan({ status: "ok", runOutDate: null });
    expect(actionFor(noShortage, WEEKS).label).toBe("No shortage projected within 26 weeks");
  });
});

describe("flagsFor", () => {
  it("returns no flags for a plain item", () => {
    expect(flagsFor(makePlan())).toEqual([]);
  });

  it("lists warnings most important first", () => {
    const plan = makePlan({
      reorderReason: "BlueTide status unclear: please review",
      flags: { onlyOverdueCover: true, dependsOnUnconfirmedDelivery: false, estimatedDemand: true },
    });
    expect(flagsFor(plan).map((f) => f.label)).toEqual([
      "Only covered by an overdue PO",
      "BlueTide status unclear",
      "Forecast partly estimated",
    ]);
  });

  it("names unconfirmed delivery as 'Review delivery timing'", () => {
    const plan = makePlan({ flags: { onlyOverdueCover: false, dependsOnUnconfirmedDelivery: true, estimatedDemand: false } });
    expect(flagsFor(plan)).toEqual([
      expect.objectContaining({ label: "Review delivery timing", tone: "review" }),
    ]);
  });
});

describe("reliesOnVendorDates and needsAction", () => {
  it("relies on vendor dates when either flag is set", () => {
    expect(reliesOnVendorDates(makePlan())).toBe(false);
    expect(reliesOnVendorDates(makePlan({ flags: { onlyOverdueCover: true, dependsOnUnconfirmedDelivery: false, estimatedDemand: false } }))).toBe(true);
    expect(reliesOnVendorDates(makePlan({ flags: { onlyOverdueCover: false, dependsOnUnconfirmedDelivery: true, estimatedDemand: false } }))).toBe(true);
  });

  it("needs action for order now, order soon and lead time not set only", () => {
    expect(needsAction(makePlan({ status: "order now" }))).toBe(true);
    expect(needsAction(makePlan({ status: "order soon" }))).toBe(true);
    expect(needsAction(makePlan({ status: "lead time not set" }))).toBe(true);
    expect(needsAction(makePlan({ status: "ok" }))).toBe(false);
    expect(needsAction(makePlan({ status: "not reordered" }))).toBe(false);
  });
});

describe("explainPlan", () => {
  it("explains SHR-1620's story from its plan fields", () => {
    const plan = makePlan({
      status: "order now",
      runOutDate: "2026-12-22",
      orderByDate: "2026-09-15",
      daysUntilOrderBy: -62,
      leadTimeDays: 84,
      bufferDays: 14,
      arrivesIfOrderedToday: "2027-02-08",
      scenarioRunOutDate: "2026-12-22",
      incoming: [
        {
          poNo: "PO-1", lineNo: 1, itemCode: "TST-1", vendorCode: "VND", orderDate: null,
          expectedDate: "2026-12-28", qty: 600, timingStatus: "Vendor estimate: unconfirmed",
          isOverdue: false, daysOverdue: null, countsInScenario: true,
        },
      ],
      flags: { onlyOverdueCover: false, dependsOnUnconfirmedDelivery: false, estimatedDemand: true },
    });
    expect(explainPlan(plan, WEEKS)).toEqual([
      "Without counting any PO, stock runs out on Tue, Dec 22, 2026.",
      "With 84 days delivery and 14 days cushion, the order had to be placed by Tue, Sep 15, 2026 (62 days late).",
      "Ordered today, it would arrive about Mon, Feb 8, 2027, after stock runs out.",
      "Even if vendor dates hold, it still runs out on Tue, Dec 22, 2026.",
      "Part of the forecast is estimated: last year shipped nothing in some weeks while out of stock.",
    ]);
  });

  it("says when stock is already short, in the item's unit", () => {
    const lines = explainPlan(makePlan({ availableNow: -39, runOutDate: "2026-11-16" }), WEEKS);
    expect(lines[0]).toBe("Already short: open orders are 39 cases more than the sellable stock.");
  });

  it("never invents an order-by date without a lead time", () => {
    const lines = explainPlan(
      makePlan({ status: "lead time not set", leadTimeDays: null, bufferDays: null, arrivesIfOrderedToday: null, runOutDate: "2027-01-10" }),
      WEEKS,
    );
    expect(lines).toContain("No lead time is set for Test Vendor, so there is no order-by date.");
    expect(lines.some((l) => l.includes("must be placed") || l.includes("had to be placed"))).toBe(false);
  });

  it("states the horizon when no shortage is projected", () => {
    expect(explainPlan(makePlan(), WEEKS)).toContain(
      "Without counting any PO, no shortage is projected within 26 weeks.",
    );
  });
});
