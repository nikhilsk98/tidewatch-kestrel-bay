"""Run the Tidewatch load in one transaction.

Order: apply the schema, seed Dana's settings (only where missing),
load the CSVs (Steps 16-19), validate, then commit.
If anything fails, everything rolls back and the old data stays.
"""

import os
from datetime import date
from pathlib import Path

import psycopg
from dotenv import load_dotenv

# Project root, worked out from this file's location, so the script
# runs correctly from any folder.
ROOT = Path(__file__).resolve().parents[2]
SCHEMA = ROOT / "sql" / "schema.sql"

# Starting values. Seeded only if missing: Dana's later edits win.
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


def apply_schema(cur):
    """Run sql/schema.sql. No BEGIN/COMMIT inside it: we own the transaction."""
    cur.execute(SCHEMA.read_text())


def seed_defaults(cur):
    """Insert starting values only where nothing exists yet."""
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


def validate_settings(cur):
    """Stop with a clear message if a required setting is missing or invalid."""
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

    cur.execute(
        "SELECT vendor_code FROM vendor_settings "
        "WHERE lead_time_days IS NOT NULL AND buffer_days IS NOT NULL"
    )
    have = {row[0] for row in cur.fetchall()}
    missing = {v[0] for v in DANA_VENDOR_SETTINGS} - have
    if missing:
        raise SystemExit(f"Missing lead time or cushion for: {sorted(missing)}")


def report(cur):
    """Print what exists, so you can see the run worked."""
    cur.execute(
        "SELECT table_type, table_name FROM information_schema.tables "
        "WHERE table_schema = 'public' ORDER BY table_type, table_name"
    )
    for table_type, name in cur.fetchall():
        print(f"  {table_type:<10} {name}")
    for table in ("settings", "vendor_settings", "item_settings"):
        cur.execute(f"SELECT count(*) FROM {table}")
        print(f"  {table}: {cur.fetchone()[0]} rows")


def main():
    load_dotenv(ROOT / ".env.local")
    url = os.environ.get("DATABASE_URL_DIRECT")
    if not url:
        raise SystemExit("DATABASE_URL_DIRECT is missing from .env.local")

    # One connection, one transaction. Leaving this block normally commits;
    # any error inside it rolls everything back.
    with psycopg.connect(url) as conn:
        with conn.cursor() as cur:
            apply_schema(cur)
            seed_defaults(cur)
            # Steps 16-19: load the CSVs here, on this same cursor.
            validate_settings(cur)
            report(cur)
    print("Committed.")


if __name__ == "__main__":
    main()