import { afterEach, describe, expect, it } from "vitest";
import {
  formatDate,
  formatDaysFrom,
  formatMoney,
  formatQty,
  locationName,
  unitName,
} from "@/lib/format";

describe("formatQty", () => {
  it("rounds pounds to one decimal, with the unit", () => {
    expect(formatQty(1240.46, "LB")).toBe("1,240.5 lb");
    expect(formatQty(2, "LB")).toBe("2 lb");
  });

  it("rounds cases to whole numbers, with the unit", () => {
    expect(formatQty(450.4, "CS")).toBe("450 cases");
    expect(formatQty(1350, "CS")).toBe("1,350 cases");
  });

  it("uses the singular for exactly one case", () => {
    expect(formatQty(1, "CS")).toBe("1 case");
    expect(formatQty(-1, "CS")).toBe("-1 case");
  });

  it("keeps negatives (already short) and never shows -0", () => {
    expect(formatQty(-39, "CS")).toBe("-39 cases");
    expect(formatQty(-0.2, "CS")).toBe("0 cases");
    expect(formatQty(-0.04, "LB")).toBe("0 lb");
  });
});

describe("unitName", () => {
  it("names the selling unit", () => {
    expect(unitName("LB")).toBe("lb");
    expect(unitName("CS")).toBe("cases");
    expect(unitName("CS", 1)).toBe("case");
  });
});

describe("formatDate", () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it("formats in each style", () => {
    expect(formatDate("2026-11-16")).toBe("Mon, Nov 16, 2026");
    expect(formatDate("2026-11-15", "weekday")).toBe("Sun, Nov 15");
    expect(formatDate("2026-12-22", "medium")).toBe("Dec 22, 2026");
    expect(formatDate("2026-12-22", "short")).toBe("Dec 22");
  });

  it("reads dates in UTC, so the computer's time zone can't shift the day", () => {
    for (const tz of ["Pacific/Kiritimati", "Pacific/Pago_Pago", "America/New_York"]) {
      process.env.TZ = tz; // UTC+14, UTC-11, and Dana's own zone
      expect(formatDate("2026-11-16")).toBe("Mon, Nov 16, 2026");
      expect(formatDate("2027-01-01", "short")).toBe("Jan 1");
    }
  });
});

describe("formatMoney", () => {
  it("shows whole dollars", () => {
    expect(formatMoney(169378.13)).toBe("$169,378");
    expect(formatMoney(97421.67)).toBe("$97,422");
  });
});

describe("formatDaysFrom", () => {
  it("says late, today, or in N days", () => {
    expect(formatDaysFrom(-62)).toBe("62 days late");
    expect(formatDaysFrom(-1)).toBe("1 day late");
    expect(formatDaysFrom(0)).toBe("today");
    expect(formatDaysFrom(1)).toBe("in 1 day");
    expect(formatDaysFrom(14)).toBe("in 14 days");
  });
});

describe("locationName", () => {
  it("spells out known codes and passes unknown ones through", () => {
    expect(locationName("HCS")).toBe("Harbor Cold Storage");
    expect(locationName("XYZ")).toBe("XYZ");
  });
});
