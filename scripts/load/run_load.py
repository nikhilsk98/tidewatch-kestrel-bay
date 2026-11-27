"""Run the Tidewatch load in one transaction.

Order:
  1. Read and check the CSVs (prepare.py), before touching the database.
  2. In one transaction: apply the schema, seed Dana's settings (only
     where missing), validate settings, load the cleaned data, check the
     loaded result, print a report.
  3. Commit only if every step succeeded. Any error rolls everything back,
     so the previous data stays exactly as it was.
"""

import os
from datetime import date
from pathlib import Path

import psycopg
from dotenv import load_dotenv

from prepare import Prepared, prepare_all  # our own file, next to this one

# ---------------------------------------------------------------------
# File locations, worked out from this script's own location.
# ---------------------------------------------------------------------
ROOT = Path(__file__).resolve().parents[2]  # load -> scripts -> project root
SCHEMA = ROOT / "sql" / "schema.sql"
DATA = ROOT / "data"

# ---------------------------------------------------------------------
# Starting values for Dana's tables. Inserted only if the row is missing,
# so her later edits are never overwritten.
# ---------------------------------------------------------------------
DEFAULT_SETTINGS = [
    ("today", "2026-11-16",
     "Planning date. The assignment treats Monday, Nov 16, 2026 as today."),
    ("expiry_cutoff_months", "6",
     "Lots with less than this many months to expiry don't count toward future sales (Dana)."),
    ("aging_received_days", "90",
     "Flag stock received this many days ago or more. Our assumption, not Dana's rule."),
]

# Lead time and cushion in days, confirmed by Dana ("Those are all right").
DANA_VENDOR_SETTINGS = [
    ("BXE", 84, 14, "Vietnam: 12 weeks + 2 weeks cushion"),
    ("AFS", 42, 14, "Chile: 6 weeks + 2 weeks cushion"),
    ("MNP", 14, 7, "Canada: 2 weeks + 1 week cushion"),
    ("ASP", 28, 7, "Alaska: 4 weeks + 1 week cushion"),
    ("DLC", 21, 7, "Maine: 3 weeks + 1 week cushion"),
]

# Dana: "I've stopped buying all 3."
DANA_STOPPED_ITEMS = ["PAN-1012", "SHR-6170", "TIL-FIL"]


# ---------------------------------------------------------------------
# Database steps. Each takes the cursor, so they all share one transaction.
# ---------------------------------------------------------------------
def apply_schema(cur) -> None:
    """Create or rebuild every table and view. schema.sql has no BEGIN/COMMIT."""
    cur.execute(SCHEMA.read_text())


def seed_defaults(cur) -> None:
    """Add Dana's starting values only where her row doesn't exist yet."""
    cur.executemany(
        "INSERT INTO settings (key, value, note) VALUES (%s, %s, %s) "
        "ON CONFLICT (key) DO NOTHING",
        DEFAULT_SETTINGS,
    )
    cur.executemany(
        "INSERT INTO vendor_settings (vendor_code, lead_time_days, buffer_days, note) "
        "VALUES (%s, %s, %s, %s) ON CONFLICT (vendor_code) DO NOTHING",
        DANA_VENDOR_SETTINGS,
    )
    cur.executemany(
        "INSERT INTO item_settings (item_code, reorder_enabled, note) "
        "VALUES (%s, false, %s) ON CONFLICT (item_code) DO NOTHING",
        [(code, "Dana stopped buying this item") for code in DANA_STOPPED_ITEMS],
    )


def validate_settings(cur) -> None:
    """Stop with a clear message if a business rule is missing or invalid.

    Lead times are checked after the data is loaded (validate_loaded_data),
    because only then do we know which vendors supply items Tidewatch may reorder.
    """
    cur.execute("SELECT key, value FROM settings")
    settings = dict(cur.fetchall())

    try:
        date.fromisoformat(settings["today"])
    except (KeyError, ValueError):
        raise SystemExit("Setting 'today' is missing or not a date (YYYY-MM-DD).")

    for key in ("expiry_cutoff_months", "aging_received_days"):
        try:
            value = int(settings[key])
        except (KeyError, ValueError):
            raise SystemExit(f"Setting '{key}' is missing or not a whole number.")
        if value < 0:
            raise SystemExit(f"Setting '{key}' can't be negative.")


def load_prepared_data(cur, prep: Prepared) -> None:
    """Insert the cleaned rows. Vendors first: items point at them."""
    cur.executemany(
        "INSERT INTO vendors (vendor_code, vendor_name, country, currency, lead_time_raw) "
        "VALUES (%s, %s, %s, %s, %s)",
        prep.vendors,
    )
    cur.executemany(
        "INSERT INTO items (item_code, description, category, storage, sell_uom, "
        "case_lb, vendor_code, source_status) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
        prep.items,
    )
    cur.executemany(
        "INSERT INTO lots (lot_no, item_code, location, qty, pack_date, expiry_date, "
        "received_date, unit_cost) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
        prep.lots,
    )
    cur.executemany(
        "INSERT INTO adjustments (ref, item_code, qty) VALUES (%s, %s, %s)",
        prep.adjustments,
    )
    cur.executemany(
        "INSERT INTO sales (order_no, line_no, order_date, ship_date, customer_code, "
        "customer_type, item_code, qty, status, is_demand, exclude_reason) "
        "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
        prep.sales,
    )
    # Step 19: purchase orders go here.
    cur.executemany(
        "INSERT INTO cleaning_log (source_file, item_code, detail, action, reason) "
        "VALUES (%s, %s, %s, %s, %s)",
        prep.cleaning_log,
    )
    cur.execute("INSERT INTO import_info (key, value) VALUES ('loaded_at', now()::text)")
    cur.execute(
        "INSERT INTO import_info (key, value) VALUES ('snapshot_date', %s)",
        (prep.snapshot_date,),
    )


def validate_loaded_data(cur, prep: Prepared) -> None:
    """Check what landed in the database before committing."""
    # 1. Every prepared row arrived, no more and no fewer.
    expected = {
        "vendors": len(prep.vendors),
        "items": len(prep.items),
        "lots": len(prep.lots),
        "adjustments": len(prep.adjustments),
        "sales": len(prep.sales),
        "cleaning_log": len(prep.cleaning_log),
    }
    for table, count in expected.items():
        cur.execute(f"SELECT count(*) FROM {table}")
        found = cur.fetchone()[0]
        if found != count:
            raise SystemExit(f"{table}: expected {count} rows, found {found}")

    # 2. Items Tidewatch may reorder whose vendor has no lead time. Warn, don't
    #    stop: the screen will show "Lead time not set" instead of a date.
    cur.execute("""
        SELECT i.item_code, i.vendor_code
        FROM item_reorder r
        JOIN items i ON i.item_code = r.item_code
        LEFT JOIN vendor_settings vs ON vs.vendor_code = i.vendor_code
        WHERE r.reorder_enabled
          AND (vs.lead_time_days IS NULL OR vs.buffer_days IS NULL)
        ORDER BY i.item_code
    """)
    for code, vendor in cur.fetchall():
        prep.warnings.append(f"{code}: may be reordered, but vendor {vendor} has no lead time set")

    # 3. Dana's entries whose code isn't in the current data. Flag, never delete.
    checks = [
        ("vendor_settings", "vendor_code", "vendors"),
        ("item_settings", "item_code", "items"),
        ("handled", "item_code", "items"),
    ]
    for table, column, source in checks:
        cur.execute(
            f"SELECT DISTINCT {column} FROM {table} "
            f"WHERE {column} NOT IN (SELECT {column} FROM {source}) ORDER BY 1"
        )
        for (code,) in cur.fetchall():
            prep.warnings.append(f"{table}: '{code}' isn't in the current {source} data (kept, not deleted)")


def report(cur, prep: Prepared) -> None:
    """Print row counts and any warnings, so you can see what happened."""
    tables = ["vendors", "items", "lots", "adjustments", "sales", "cleaning_log",
              "settings", "vendor_settings", "item_settings"]
    for table in tables:
        cur.execute(f"SELECT count(*) FROM {table}")
        print(f"  {table:<16} {cur.fetchone()[0]:>5} rows")
    cur.execute("SELECT count(*) FROM sales WHERE is_demand")
    print(f"  sales counted as demand: {cur.fetchone()[0]}")
    cur.execute("SELECT count(*) FROM sales WHERE status = 'OPEN'")
    print(f"  open order lines (promised stock): {cur.fetchone()[0]}")
    print(f"  Stock as of: {prep.snapshot_date}")
    if prep.warnings:
        print("Warnings:")
        for warning in prep.warnings:
            print(f"  - {warning}")
    else:
        print("No warnings.")


# ---------------------------------------------------------------------
# The order everything runs in.
# ---------------------------------------------------------------------
def main() -> None:
    prep = prepare_all(DATA)  # 1. read and check the CSVs, no database yet

    load_dotenv(ROOT / ".env.local")
    url = os.environ.get("DATABASE_URL_DIRECT")
    if not url:
        raise SystemExit("DATABASE_URL_DIRECT is missing from .env.local")

    # 2. One connection, one transaction. Leaving the block normally commits;
    #    any error inside it rolls everything back.
    with psycopg.connect(url) as conn:
        with conn.cursor() as cur:
            apply_schema(cur)
            seed_defaults(cur)
            validate_settings(cur)
            load_prepared_data(cur, prep)
            validate_loaded_data(cur, prep)
            report(cur, prep)
    print("Committed.")  # 3. only reached if the commit succeeded


if __name__ == "__main__":
    main()
