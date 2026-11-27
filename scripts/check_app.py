"""Check the app's answers end to end, through its API.

verify.py checks the loaded data. This script checks the calculations the
screens show: run-out and order-by dates, statuses, flags, stuck stock and the
cleaning report, plus rules that must hold for every item.

It only reads (GET requests), so it's safe against the live site too.

    python scripts/check_app.py                            # local dev server
    python scripts/check_app.py https://your-app.vercel.app  # the live site

Expected values were worked out independently from the raw CSVs.
"""

import json
import sys
import urllib.error
import urllib.request
from datetime import date, timedelta

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000").rstrip("/")
results = []   # (passed, label, detail)


def get(path: str):
    """Fetch a route and return (status code, parsed JSON)."""
    try:
        with urllib.request.urlopen(BASE + path, timeout=60) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, json.load(error)


def check(label: str, found, expected) -> None:
    """Record PASS/FAIL. Numbers are compared with a small tolerance."""
    if isinstance(expected, (int, float)) and not isinstance(expected, bool) and found is not None:
        ok = abs(float(found) - expected) < 0.01
    else:
        ok = found == expected
    results.append((ok, label, f"expected {expected}, found {found}"))


def rule(label: str, broken: list) -> None:
    """Record a rule that must hold for every item; list the items that break it."""
    results.append((not broken, label, f"broken for: {', '.join(broken[:8])}"))


# --------------------------------------------------------------------- plan
status, plan = get("/api/plan")
check("/api/plan answers", status, 200)
plans = {p["itemCode"]: p for p in plan["plans"]}

check("Order now: 11 items", plan["summary"]["orderNow"], 11)
check("Order soon: 8 items", plan["summary"]["orderSoon"], 8)
check("OK: 11 items", plan["summary"]["ok"], 11)
check("Not reordered: 15 items (6 fresh, 6 ZZ, 3 stopped by Dana)", plan["summary"]["notReordered"], 15)
check("Planning date is Nov 16", plan["meta"]["planningDate"], "2026-11-16")
check("Stock as of Nov 15", plan["meta"]["stockAsOf"], "2026-11-15")

shr1620 = plans["SHR-1620"]
check("SHR-1620 runs out Dec 22 (Christmas, again)", shr1620["runOutDate"], "2026-12-22")
check("SHR-1620 should have been ordered by Sep 15", shr1620["orderByDate"], "2026-09-15")
check("SHR-1620 still runs out Dec 22 even if the Dec 28 PO lands", shr1620["scenarioRunOutDate"], "2026-12-22")
check("SHR-1620 would arrive Feb 8 if ordered today", shr1620["arrivesIfOrderedToday"], "2027-02-08")
check("SHR-1620 forecast flagged as estimated over last year's stockout", shr1620["flags"]["estimatedDemand"], True)

check("SHR-2125 runs out Nov 26", plans["SHR-2125"]["runOutDate"], "2026-11-26")
check("SHR-2125 flagged: only covered by an overdue PO", plans["SHR-2125"]["flags"]["onlyOverdueCover"], True)
check("SAL-POR6 runs out immediately (nothing sellable)", plans["SAL-POR6"]["runOutDate"], "2026-11-16")
check("CRAB-SNW5: order soon, by Nov 17", (plans["CRAB-SNW5"]["status"], plans["CRAB-SNW5"]["orderByDate"]),
      ("order soon", "2026-11-17"))
check("COD-FIL: OK, lasts to Feb 25 if its PO lands", (plans["COD-FIL"]["status"], plans["COD-FIL"]["scenarioRunOutDate"]),
      ("ok", "2027-02-25"))
check("TIL-FIL: not reordered (Dana stopped buying it)", plans["TIL-FIL"]["status"], "not reordered")
check("6 items depend on unconfirmed deliveries",
      sum(p["flags"]["dependsOnUnconfirmedDelivery"] for p in plans.values()), 6)
check("2 items only covered by an overdue PO",
      sum(p["flags"]["onlyOverdueCover"] for p in plans.values()), 2)

# ------------------------------------------- rules that must hold for every item
def d(text):
    return date.fromisoformat(text)

rule("Available now = sellable + corrections - promised",
     [c for c, p in plans.items()
      if abs(p["availableNow"] - (p["sellable"] + p["corrections"] - p["promised"])) > 0.01])
rule("Order-by date = run-out date - (lead time + cushion)",
     [c for c, p in plans.items()
      if p["orderByDate"] and d(p["orderByDate"]) != d(p["runOutDate"]) - timedelta(days=p["leadTimeDays"] + p["bufferDays"])])
rule("Fresh and ZZ items never get an order status",
     [c for c, p in plans.items()
      if (p["category"] == "Fresh" or c.startswith("ZZ-")) and p["status"] != "not reordered"])
rule("Items Dana stopped buying never get an order status",
     [c for c in ("PAN-1012", "SHR-6170", "TIL-FIL") if plans[c]["status"] != "not reordered"])
rule("POs only add stock: the scenario never runs out earlier than the safe view",
     [c for c, p in plans.items()
      if p["runOutDate"] and p["scenarioRunOutDate"] and d(p["scenarioRunOutDate"]) < d(p["runOutDate"])])
rule("Overdue POs never count in the scenario",
     [c for c, p in plans.items() for po in p["incoming"] if po["isOverdue"] and po["countsInScenario"]])
rule("Every forecast covers the whole projection (26 weeks)",
     [c for c, p in plans.items() if len(p["weeklyForecast"]) != 26])

# --------------------------------------------------------------------- stuck
status, stuck = get("/api/stuck")
check("/api/stuck answers", status, 200)
check("21 stuck lots", stuck["summary"]["lots"], 21)
check("$169,378.13 stuck at cost", stuck["summary"]["totalValue"], 169378.13)
check("$133,295.82 aging", stuck["summary"]["agingValue"], 133295.82)
check("$36,082.31 unavailable (damaged, on hold)", stuck["summary"]["unavailableValue"], 36082.31)
check("$97,421.17 at Harbor", stuck["summary"]["harborValue"], 97421.17)
por8 = next((l for l in stuck["lots"] if l["lotNo"] == "L260817-02"), None)
check("SAL-POR8 lot L260817-02: 279.7 cases expected to pass the line unsold",
      por8 and por8["qty"], 279.7)

# ------------------------------------------------------------- item detail
status, item = get("/api/items/SHR-1620")
check("/api/items/SHR-1620 answers", status, 200)
check("SHR-1620 detail shows 4 lots", len(item["lots"]), 4)
check("SHR-1620's 80 unsellable cases are on QA hold",
      sum(l["qty"] for l in item["lots"] if l["unavailableReason"] == "On QA hold"), 80)
check("SHR-1620 open orders add up to 201", sum(o["qty"] for o in item["openOrders"]), 201)
check("SHR-1620 detail shows 12 weeks of recent sales", len(item["recentWeeks"]), 12)
status, _ = get("/api/items/NOPE")
check("An unknown item gives 404", status, 404)

# ------------------------------------------------------------------ cleaned
status, cleaned = get("/api/cleaned")
check("/api/cleaned answers", status, 200)
check("28 cleaning notes", len(cleaned["notes"]), 28)
check("Totals: 15,750 sales lines, 14,716 demand, 102 lots, 82 sellable",
      cleaned["totals"], {"salesLines": 15750, "demandLines": 14716, "lots": 102, "sellableLots": 82})

# ------------------------------------------------------------------- report
for ok, label, detail in results:
    print(f"  {'PASS' if ok else 'FAIL'}  {label}" + ("" if ok else f": {detail}"))
failed = sum(not ok for ok, _, _ in results)
print(f"\n{len(results) - failed} of {len(results)} checks passed against {BASE}.")
if failed:
    sys.exit(1)