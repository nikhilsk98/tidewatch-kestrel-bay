import { describe, expect, it } from "vitest";
import { reconcile } from "@/lib/reconcile";

// SHR-1620's real evidence (from /api/items/SHR-1620): four lots, one on QA hold,
// no count corrections, seven open orders adding up to 201 cases.
const shr1620 = {
  lots: [
    { qty: 140, unavailableReason: null },
    { qty: 80, unavailableReason: null },
    { qty: 260, unavailableReason: null },
    { qty: 80, unavailableReason: "On QA hold" },
  ],
  corrections: [],
  openOrders: [12, 8, 14, 9, 23, 15, 120].map((qty) => ({ qty })),
};

describe("reconcile", () => {
  it("balances for SHR-1620: 560 on hand − 80 on hold = 480 sellable; − 201 promised = 279", () => {
    const result = reconcile(shr1620, 279);
    expect(result.lines).toEqual([
      { label: "On hand (BlueTide, all lots)", qty: 560, kind: "start" },
      { label: "On QA hold (1 lot)", qty: -80, kind: "step" },
      { label: "Sellable", qty: 480, kind: "subtotal" },
      { label: "Count corrections", qty: 0, kind: "step" },
      { label: "Promised to customers (open orders)", qty: -201, kind: "step" },
      { label: "Available now", qty: 279, kind: "subtotal" },
    ]);
    expect(result.availableNow).toBe(279);
    expect(result.balances).toBe(true);
  });

  it("reports a mismatch instead of hiding it", () => {
    const result = reconcile(shr1620, 300);
    expect(result.availableNow).toBe(279);
    expect(result.balances).toBe(false);
  });

  it("subtracts each unavailable lot once, grouped by reason in a fixed order", () => {
    const result = reconcile(
      {
        lots: [
          { qty: 10, unavailableReason: "Inside the 6-month line" },
          { qty: 5, unavailableReason: "Damaged" },
          { qty: 7, unavailableReason: "Inside the 6-month line" },
          { qty: 3, unavailableReason: "On QA hold" },
          { qty: 100, unavailableReason: null },
        ],
        corrections: [{ qty: -4 }],
        openOrders: [],
      },
      96,
    );
    expect(result.lines.map((l) => [l.label, l.qty])).toEqual([
      ["On hand (BlueTide, all lots)", 125],
      ["On QA hold (1 lot)", -3],
      ["Damaged (1 lot)", -5],
      ["Inside the 6-month line (2 lots)", -17],
      ["Sellable", 100],
      ["Count corrections", -4],
      ["Promised to customers (open orders)", -0],
      ["Available now", 96],
    ]);
    expect(result.balances).toBe(true);
  });

  it("ignores floating-point crumbs on pound items", () => {
    const result = reconcile(
      { lots: [{ qty: 0.1, unavailableReason: null }, { qty: 0.2, unavailableReason: null }], corrections: [], openOrders: [] },
      0.3,
    );
    expect(result.balances).toBe(true);
  });
});
