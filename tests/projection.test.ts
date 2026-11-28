import { describe, expect, it } from "vitest";
import { project } from "@/lib/projection";

// Small made-up inputs for the day-by-day projection. Day 0 is the planning date.
const TODAY = "2026-11-16";
const noBookings = new Map<number, number>();
const noArrivals = new Map<number, number>();

describe("project", () => {
  it("10 cases selling 2 a day run out on day 5", () => {
    const result = project({
      today: TODAY,
      days: 7,
      lots: [{ qty: 10, sellableUntil: "2027-06-30", lotNo: "L1" }],
      corrections: 0,
      booked: noBookings,
      weeklyForecast: [14], // 2 a day
      arrivals: noArrivals,
    });
    expect(result.runOutDate).toBe("2026-11-21"); // days 0-4 use the 10 cases; day 5 can't be met
    expect(result.weeklyEndStock).toEqual([0]);
    expect(result.expiresUnsold).toEqual([]);
  });

  it("lasts the whole projection when stock covers demand", () => {
    const result = project({
      today: TODAY,
      days: 14,
      lots: [{ qty: 100, sellableUntil: "2027-06-30", lotNo: "L1" }],
      corrections: 0,
      booked: noBookings,
      weeklyForecast: [14, 14],
      arrivals: noArrivals,
    });
    expect(result.runOutDate).toBeNull();
    expect(result.weeklyEndStock).toEqual([86, 72]);
  });

  it("drops a lot after its sellable-until date and records what was left unsold", () => {
    const result = project({
      today: TODAY,
      days: 7,
      lots: [{ qty: 100, sellableUntil: "2026-11-18", lotNo: "OLD" }],
      corrections: 0,
      booked: noBookings,
      weeklyForecast: [7], // 1 a day
      arrivals: noArrivals,
    });
    // Sells 1 a day on Nov 16, 17 and 18 (still sellable on its last day), then it's gone.
    expect(result.expiresUnsold).toEqual([{ lotNo: "OLD", qty: 97, lastSellableDay: "2026-11-18" }]);
    expect(result.runOutDate).toBe("2026-11-19");
  });

  it("sells the oldest lot first, so the newer lot is what remains", () => {
    const result = project({
      today: TODAY,
      days: 7,
      lots: [
        { qty: 50, sellableUntil: "2027-06-30", lotNo: "NEW" },
        { qty: 5, sellableUntil: "2026-11-30", lotNo: "OLD" },
      ],
      corrections: 0,
      booked: noBookings,
      weeklyForecast: [7],
      arrivals: noArrivals,
    });
    expect(result.expiresUnsold).toEqual([]); // OLD sold out before its date
    expect(result.weeklyEndStock).toEqual([48]);
  });

  it("ships a booked order on its own day", () => {
    const result = project({
      today: TODAY,
      days: 7,
      lots: [{ qty: 50, sellableUntil: "2027-06-30", lotNo: "L1" }],
      corrections: 0,
      booked: new Map([[3, 60]]), // more than is in stock, shipping on day 3
      weeklyForecast: [0],
      arrivals: noArrivals,
    });
    expect(result.runOutDate).toBe("2026-11-19"); // day 3
    expect(result.weeklyEndStock).toEqual([0]);
  });

  it("adds only the forecast above what's already booked that week", () => {
    const result = project({
      today: TODAY,
      days: 7,
      lots: [{ qty: 50, sellableUntil: "2027-06-30", lotNo: "L1" }],
      corrections: 0,
      booked: new Map([[2, 30]]),
      weeklyForecast: [35], // week demand = max(35, 30) = 35, not 65
      arrivals: noArrivals,
    });
    expect(result.runOutDate).toBeNull();
    expect(result.weeklyEndStock).toEqual([15]);
  });

  it("an arrival (scenario only) pushes the run-out date out", () => {
    const base = {
      today: TODAY,
      days: 14,
      lots: [{ qty: 10, sellableUntil: "2027-06-30", lotNo: "L1" }],
      corrections: 0,
      booked: noBookings,
      weeklyForecast: [14, 14], // 2 a day
    };
    const safe = project({ ...base, arrivals: noArrivals });
    const scenario = project({ ...base, arrivals: new Map([[3, 20]]) });
    expect(safe.runOutDate).toBe("2026-11-21");
    expect(scenario.runOutDate).toBeNull(); // 30 cases cover 14 days at 2 a day
    expect(scenario.weeklyEndStock).toEqual([16, 2]);
  });

  it("a count correction larger than the stock means short on day 0", () => {
    const result = project({
      today: TODAY,
      days: 7,
      lots: [{ qty: 5, sellableUntil: "2027-06-30", lotNo: "L1" }],
      corrections: -8,
      booked: noBookings,
      weeklyForecast: [0],
      arrivals: noArrivals,
    });
    expect(result.runOutDate).toBe(TODAY);
  });
});
