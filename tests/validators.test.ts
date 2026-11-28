import { describe, expect, it } from "vitest";
import { validateHandled } from "@/lib/handled";
import { validateSettingsChange, type CurrentSettings } from "@/lib/settingsUpdate";

describe("validateHandled", () => {
  it("cleans the item code and turns blanks into null", () => {
    expect(validateHandled({ itemCode: "  shr-1620 ", qty: "", expectedDate: "", note: "  " })).toEqual({
      ok: true,
      value: { itemCode: "SHR-1620", qty: null, expectedDate: null, note: null },
    });
  });

  it("accepts a full note, with quantity given as text or number", () => {
    expect(validateHandled({ itemCode: "SHR-1620", qty: "400", expectedDate: "2027-02-08", note: " Emailed BXE " })).toEqual({
      ok: true,
      value: { itemCode: "SHR-1620", qty: 400, expectedDate: "2027-02-08", note: "Emailed BXE" },
    });
    expect(validateHandled({ itemCode: "SAL-SIDE", qty: 12.5 })).toMatchObject({ ok: true, value: { qty: 12.5 } });
  });

  it.each([
    [null, "Send a JSON object."],
    ["text", "Send a JSON object."],
    [{}, "Item code is required."],
    [{ itemCode: "   " }, "Item code is required."],
    [{ itemCode: "X", qty: 0 }, "Quantity must be a number above zero, or left empty."],
    [{ itemCode: "X", qty: -5 }, "Quantity must be a number above zero, or left empty."],
    [{ itemCode: "X", qty: "lots" }, "Quantity must be a number above zero, or left empty."],
    [{ itemCode: "X", expectedDate: "2026-02-30" }, "Expected arrival must be a real date (YYYY-MM-DD), or left empty."],
    [{ itemCode: "X", expectedDate: "12/28/2026" }, "Expected arrival must be a real date (YYYY-MM-DD), or left empty."],
    [{ itemCode: "X", note: 42 }, "Note must be text."],
    [{ itemCode: "X", note: "a".repeat(1001) }, "Note must be at most 1000 characters."],
  ])("rejects %j", (body, error) => {
    expect(validateHandled(body)).toEqual({ ok: false, error });
  });
});

// Today's real values: Vietnam is the longest at 84 + 14 = 98 days, so the horizon must be at least 14 weeks.
function current(): CurrentSettings {
  return {
    settings: new Map([
      ["today", "2026-11-16"],
      ["expiry_cutoff_months", "6"],
      ["aging_received_days", "90"],
      ["projection_weeks", "26"],
    ]),
    vendorSettings: new Map([
      ["BXE", { leadTimeDays: 84, bufferDays: 14 }],
      ["MNP", { leadTimeDays: 14, bufferDays: 7 }],
    ]),
    vendorCodes: new Set(["BXE", "MNP", "OCN"]),
    items: new Map([
      ["TIL-FIL", true],
      ["ZZ-SCL-0002", false],
      ["FRESH-COD", false],
    ]),
  };
}

describe("validateSettingsChange", () => {
  it("accepts a valid change and stores numbers as plain text", () => {
    const result = validateSettingsChange(
      {
        settings: { expiry_cutoff_months: "04" },
        vendors: [{ vendorCode: " ocn ", leadTimeDays: 30, bufferDays: "7" }],
        items: [{ itemCode: "til-fil", reorderEnabled: null }],
      },
      current(),
    );
    expect(result).toEqual({
      ok: true,
      change: {
        settings: { expiry_cutoff_months: "4" },
        vendors: [{ vendorCode: "OCN", leadTimeDays: 30, bufferDays: 7 }],
        items: [{ itemCode: "TIL-FIL", reorderEnabled: null }],
      },
    });
  });

  it("accepts the horizon at exactly the minimum (14 weeks = 98 days)", () => {
    expect(validateSettingsChange({ settings: { projection_weeks: 14 } }, current()).ok).toBe(true);
  });

  it.each([
    ["not an object", null, "Send a JSON object."],
    ["empty change", {}, "Nothing to save."],
    ["the planning date", { settings: { today: "2026-11-23" } }, "Setting 'today' is the planning date and can't be changed here."],
    ["an unknown setting", { settings: { colour: "blue" } }, "Setting 'colour' can't be changed here."],
    ["a negative cutoff", { settings: { expiry_cutoff_months: -1 } }, "Setting 'expiry_cutoff_months' is missing or not a whole number of at least 0."],
    ["a fractional cutoff", { settings: { expiry_cutoff_months: "4.5" } }, "Setting 'expiry_cutoff_months' is missing or not a whole number of at least 0."],
    ["a blank value", { settings: { aging_received_days: "" } }, "Setting 'aging_received_days' is missing or not a whole number of at least 0."],
    ["a zero horizon", { settings: { projection_weeks: 0 } }, "Setting 'projection_weeks' is missing or not a whole number of at least 1."],
    [
      "a horizon shorter than the longest lead time plus cushion",
      { settings: { projection_weeks: 13 } },
      "Setting 'projection_weeks' (13) is shorter than the longest lead time plus cushion (98 days). Increase it to at least 14.",
    ],
    [
      "a lead time that no longer fits the horizon",
      { vendors: [{ vendorCode: "BXE", leadTimeDays: 200, bufferDays: 14 }] },
      "Setting 'projection_weeks' (26) is shorter than the longest lead time plus cushion (214 days). Increase it to at least 31.",
    ],
    ["an unknown vendor", { vendors: [{ vendorCode: "XXX", leadTimeDays: 1, bufferDays: 1 }] }, "Unknown vendor 'XXX'."],
    ["a missing cushion", { vendors: [{ vendorCode: "OCN", leadTimeDays: 30 }] }, "Setting 'cushion for OCN' is missing or not a whole number of at least 0."],
    [
      "a vendor listed twice",
      { vendors: [{ vendorCode: "OCN", leadTimeDays: 1, bufferDays: 1 }, { vendorCode: "ocn", leadTimeDays: 2, bufferDays: 2 }] },
      "Vendor OCN is listed twice.",
    ],
    ["an unknown item", { items: [{ itemCode: "NOPE", reorderEnabled: true }] }, "Unknown item 'NOPE'."],
    [
      "a ZZ item",
      { items: [{ itemCode: "ZZ-SCL-0002", reorderEnabled: true }] },
      "Reordering for ZZ-SCL-0002 can't be changed: fresh and old-system (ZZ) items are never reordered.",
    ],
    [
      "a reorder choice that isn't yes, no or null",
      { items: [{ itemCode: "TIL-FIL", reorderEnabled: "maybe" }] },
      "Reorder choice for TIL-FIL must be yes, no, or follow BlueTide status.",
    ],
  ])("rejects %s", (_name, body, error) => {
    expect(validateSettingsChange(body, current())).toEqual({ ok: false, error });
  });

  it("rejects the whole change when any part is invalid", () => {
    const result = validateSettingsChange(
      { settings: { expiry_cutoff_months: 4 }, vendors: [{ vendorCode: "XXX", leadTimeDays: 1, bufferDays: 1 }] },
      current(),
    );
    expect(result.ok).toBe(false);
  });
});
