"""Check the loaded numbers against facts we know from the data.

Read-only: it only runs SELECT queries, on a read-only connection, so it
can never change the database. Run it after every load:

    python scripts/load/verify.py

Each check prints PASS or FAIL. The script exits with an error if any fail.
Expected values were worked out independently from the raw CSVs.
"""

import os
import sys
from pathlib import Path

import psycopg
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]

# (what we're checking, the SQL that returns one value, the expected value)
CHECKS = [
    # --- The load itself ---------------------------------------------------
    ("Stock comes from the latest night (Nov 15)",
     "SELECT value FROM import_info WHERE key = 'snapshot_date'", "2026-11-15"),
    ("45 items after merging 3 duplicates",
     "SELECT count(*) FROM items", 45),
    ("No item code left untidy (spaces or lower case)",
     "SELECT count(*) FROM items WHERE item_code <> upper(btrim(item_code))", 0),

    # --- Lots and the lot_status view --------------------------------------
    ("76 lots sellable on Nov 16",
     "SELECT count(*) FROM lot_status WHERE is_sellable", 76),
    ("11 lots inside the 6-month line",
     "SELECT count(*) FROM lot_status WHERE unavailable_reason LIKE 'Inside%'", 11),
    ("7 lots expired",
     "SELECT count(*) FROM lot_status WHERE unavailable_reason = 'Expired'", 7),
    ("5 damaged lots, none sellable",
     "SELECT count(*) FROM lot_status WHERE location = 'DAMAGED' AND NOT is_sellable", 5),
    ("3 lots on QA hold, none sellable",
     "SELECT count(*) FROM lot_status WHERE location = 'QA-HOLD' AND NOT is_sellable", 3),

    # --- SAL-POR6: the stuck-salmon story ----------------------------------
    ("SAL-POR6: 1,350 cases on hand",
     "SELECT sum(qty) FROM lots WHERE item_code = 'SAL-POR6'", 1350),
    ("SAL-POR6: 0 cases sellable (all inside the 6-month line)",
     "SELECT coalesce(sum(qty) FILTER (WHERE is_sellable), 0) FROM lot_status WHERE item_code = 'SAL-POR6'", 0),
    ("SAL-POR6: 1,050 cases at Harbor",
     "SELECT sum(qty) FROM lots WHERE item_code = 'SAL-POR6' AND location = 'HCS'", 1050),
    ("SAL-POR6: $81,232.50 at cost",
     "SELECT round(sum(qty * unit_cost), 2) FROM lots WHERE item_code = 'SAL-POR6'", 81232.50),
    ("SAL-POR6: 39 cases promised (includes 7 under the old 'Sal-Por6' code)",
     "SELECT sum(qty) FROM sales WHERE item_code = 'SAL-POR6' AND status = 'OPEN'", 39),

    # --- SHR-2125: covered only by an overdue PO ---------------------------
    ("SHR-2125: 90 cases sellable",
     "SELECT sum(qty) FROM lot_status WHERE item_code = 'SHR-2125' AND is_sellable", 90),
    ("SHR-2125: 91 cases promised",
     "SELECT sum(qty) FROM sales WHERE item_code = 'SHR-2125' AND status = 'OPEN'", 91),
    ("SHR-2125: its 800-case PO is 42 days overdue",
     "SELECT days_overdue FROM po_status WHERE item_code = 'SHR-2125'", 42),

    # --- SHR-1620: the Christmas shrimp -------------------------------------
    ("SHR-1620: 560 cases on hand",
     "SELECT sum(qty) FROM lots WHERE item_code = 'SHR-1620'", 560),
    ("SHR-1620: 480 cases sellable",
     "SELECT sum(qty) FROM lot_status WHERE item_code = 'SHR-1620' AND is_sellable", 480),
    ("SHR-1620: 201 cases promised",
     "SELECT sum(qty) FROM sales WHERE item_code = 'SHR-1620' AND status = 'OPEN'", 201),
    ("SHR-1620: its 600-case PO is a future estimate, still unconfirmed",
     "SELECT timing_status FROM po_status WHERE item_code = 'SHR-1620'", "Vendor estimate: unconfirmed"),

    # --- Units, adjustments, POs --------------------------------------------
    ("CAL-RING: 132 lb lot stored as 10 cases",
     "SELECT qty FROM lots WHERE lot_no = 'L261005-02'", 10),
    ("CAL-RING: that lot's cost converted to $35.772 per case",
     "SELECT unit_cost FROM lots WHERE lot_no = 'L261005-02'", 35.772),
    ("Adjustments: COD-FIL -2, POL-BLK -40.5, SHR-2630 -6 (total -48.5)",
     "SELECT sum(qty) FROM adjustments", -48.5),
    ("PAN-0709: 400 cases still to come (1,000 ordered, 600 received)",
     "SELECT qty_remaining FROM purchase_orders WHERE item_code = 'PAN-0709'", 400),
    ("3 open PO lines overdue on Nov 16",
     "SELECT count(*) FROM po_status WHERE is_overdue", 3),

    # --- Demand ------------------------------------------------------------
    ("14,716 sales lines count as demand",
     "SELECT count(*) FROM sales WHERE is_demand", 14716),
    ("All 76 credits excluded, quantities still negative",
     "SELECT count(*) FROM sales WHERE exclude_reason = 'credit (return)' AND qty < 0", 76),
    ("No open order counted as history",
     "SELECT count(*) FROM sales WHERE status = 'OPEN' AND is_demand", 0),

    # --- Dana's settings and reorder rules ----------------------------------
    ("Vietnam lead time is Dana's 84 days, not BlueTide's 56",
     "SELECT lead_time_days FROM vendor_settings WHERE vendor_code = 'BXE'", 84),
    ("TIL-FIL: reordering off, set by Dana",
     "SELECT reason FROM item_reorder WHERE item_code = 'TIL-FIL' AND NOT reorder_enabled", "Set by Dana"),
    ("30 items eligible for order suggestions",
     "SELECT count(*) FROM item_reorder WHERE reorder_enabled", 30),
    ("2 items flagged for review (blank BlueTide status)",
     "SELECT count(*) FROM item_reorder WHERE reason LIKE 'BlueTide status unclear%'", 2),
]


def matches(found, expected) -> bool:
    """Compare numbers with a small tolerance, everything else exactly."""
    if isinstance(expected, (int, float)) and found is not None:
        return abs(float(found) - expected) < 0.001
    return str(found) == str(expected)


def main() -> None:
    load_dotenv(ROOT / ".env.local")
    url = os.environ.get("DATABASE_URL_DIRECT")
    if not url:
        raise SystemExit("DATABASE_URL_DIRECT is missing from .env.local")

    failures = 0
    with psycopg.connect(url) as conn:
        conn.read_only = True                    # this script can never change data
        with conn.cursor() as cur:
            for label, sql, expected in CHECKS:
                cur.execute(sql)
                row = cur.fetchone()
                found = row[0] if row else None
                if matches(found, expected):
                    print(f"  PASS  {label}")
                else:
                    failures += 1
                    print(f"  FAIL  {label}: expected {expected}, found {found}")

    print(f"\n{len(CHECKS) - failures} of {len(CHECKS)} checks passed.")
    if failures:
        sys.exit(1)


if __name__ == "__main__":
    main()
