"""Read and clean the BlueTide CSVs, without touching the database.

Everything here works on files only, so a missing or malformed CSV
stops the run before the database is changed. run_load.py then loads
the cleaned result in one transaction.
"""

import re
from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd

KG_TO_LB = 2.20462  # pounds in one kilogram, for pack sizes like "5kg"


# ---------------------------------------------------------------------
# What the preparation step hands to the loader: cleaned rows ready to
# insert, notes for the cleaning log, and warnings to print.
# ---------------------------------------------------------------------
@dataclass
class Prepared:
    vendors: list = field(default_factory=list)       # rows for the vendors table
    items: list = field(default_factory=list)         # rows for the items table
    cleaning_log: list = field(default_factory=list)  # (source_file, item_code, detail, action, reason)
    warnings: list = field(default_factory=list)      # printed at the end, don't stop the load


# ---------------------------------------------------------------------
# Small helpers used by every CSV.
# ---------------------------------------------------------------------
def read_csv(data_dir: Path, name: str, required: list) -> pd.DataFrame:
    """Read a CSV as text, and stop if the file or a needed column is missing."""
    path = data_dir / name
    if not path.exists():
        raise SystemExit(f"Missing file: data/{name}")
    # dtype=str keeps codes like "0012" as text; keep_default_na=False keeps
    # blanks as "" instead of NaN; utf-8-sig ignores a hidden BOM at the start.
    df = pd.read_csv(path, dtype=str, keep_default_na=False, encoding="utf-8-sig")
    missing = set(required) - set(df.columns)
    if missing:
        raise SystemExit(f"data/{name} is missing columns: {sorted(missing)}")
    return df


def clean_code(value: str) -> str:
    """The one cleaning rule for every code: trim spaces, upper case."""
    return value.strip().upper()


def blank_to_none(value: str):
    """Turn an empty cell into None, which becomes NULL in the database."""
    value = value.strip()
    return value or None


def parse_case_lb(pack_size: str):
    """Pounds per case from free text like '10 lb cs', '6x2.2lb', '10/2#', '5kg'.

    Returns None when there is no fixed case weight ('catch wt', 'per lb', blank).
    """
    s = pack_size.strip().lower()
    # Packs of smaller packs: "6x2.2lb", "5 x 2 lb", "10/2#" -> 6 * 2.2, 5 * 2, 10 * 2
    m = re.fullmatch(r"(\d+(?:\.\d+)?)\s*[x/]\s*(\d+(?:\.\d+)?)\s*(?:lb|#)", s)
    if m:
        return round(float(m[1]) * float(m[2]), 3)
    # A single weight in pounds: "10 lb cs", "15lb", "16.5 lb block", "10#"
    m = re.match(r"(\d+(?:\.\d+)?)\s*(?:lb|#)", s)
    if m:
        return float(m[1])
    # A weight in kilograms: "5kg" -> 11.023 lb
    m = re.match(r"(\d+(?:\.\d+)?)\s*kg", s)
    if m:
        return round(float(m[1]) * KG_TO_LB, 3)
    return None


# ---------------------------------------------------------------------
# vendors.csv -> vendors
# BlueTide's lead time is kept as text evidence only (lead_time_raw);
# Dana's confirmed values live in vendor_settings.
# ---------------------------------------------------------------------
def prepare_vendors(data_dir: Path, prep: Prepared) -> None:
    df = read_csv(data_dir, "vendors.csv",
                  ["vendor_code", "vendor_name", "country", "currency", "lead_time_days"])
    df["code"] = df["vendor_code"].map(clean_code)

    dupes = sorted(df.loc[df["code"].duplicated(), "code"].unique())
    if dupes:
        raise SystemExit(f"vendors.csv has duplicate vendor codes: {dupes}")

    for row in df.itertuples(index=False):
        prep.vendors.append((
            row.code,                          # vendor_code
            row.vendor_name.strip(),           # vendor_name
            blank_to_none(row.country),        # country
            blank_to_none(row.currency),       # currency
            blank_to_none(row.lead_time_days), # lead_time_raw (evidence only)
        ))


# ---------------------------------------------------------------------
# items.csv -> items
# Merges duplicate codes, tidies category, parses pounds per case, and
# checks every value the views rely on.
# ---------------------------------------------------------------------
def prepare_items(data_dir: Path, prep: Prepared) -> None:
    df = read_csv(data_dir, "items.csv",
                  ["item_code", "description", "category", "storage", "pack_size",
                   "sell_uom", "vendor_code", "status", "created_date"])
    df["code"] = df["item_code"].map(clean_code)
    vendor_codes = {v[0] for v in prep.vendors}

    for code, group in df.groupby("code", sort=True):
        # The real row is the one already typed correctly ("SHR-1620");
        # the others ("shr-1620 ") are the same product typed differently.
        real = group[group["item_code"] == code]
        if len(real) != 1:
            raise SystemExit(f"items.csv: can't tell which row is the real {code}")
        keep = real.iloc[0]

        for dup in group[group["item_code"] != code].itertuples(index=False):
            prep.cleaning_log.append((
                "items.csv", dup.item_code, f"created {dup.created_date}", "merged",
                f"Duplicate of {code}: same product typed differently",
            ))

        storage = keep["storage"].strip().upper()
        sell_uom = keep["sell_uom"].strip().upper()
        vendor = clean_code(keep["vendor_code"])
        if storage not in ("FROZEN", "FRESH"):
            raise SystemExit(f"items.csv: {code} has unknown storage '{keep['storage']}'")
        if sell_uom not in ("CS", "LB"):
            raise SystemExit(f"items.csv: {code} has unknown unit '{keep['sell_uom']}'")
        if vendor not in vendor_codes:
            raise SystemExit(f"items.csv: {code} has vendor '{vendor}', which isn't in vendors.csv")

        case_lb = parse_case_lb(keep["pack_size"])
        if sell_uom == "CS" and case_lb is None and not code.startswith("ZZ-"):
            prep.warnings.append(
                f"{code}: couldn't read pounds per case from '{keep['pack_size']}'; "
                "pound-to-case conversion won't work for this item")

        prep.items.append((
            code,                                              # item_code
            keep["description"].strip(),                       # description
            keep["category"].strip().capitalize() or None,     # category: "SALMON" -> "Salmon"
            storage,                                           # storage
            sell_uom,                                          # sell_uom
            case_lb,                                           # case_lb
            vendor,                                            # vendor_code
            blank_to_none(keep["status"]),                     # source_status, as written
        ))


# ---------------------------------------------------------------------
# Entry point: prepare every file, in dependency order.
# ---------------------------------------------------------------------
def prepare_all(data_dir: Path) -> Prepared:
    prep = Prepared()
    prepare_vendors(data_dir, prep)   # first: items check their vendor against this
    prepare_items(data_dir, prep)
    # Steps 17-19 add inventory, sales and purchase orders here.
    return prep