"""Read and clean the BlueTide CSVs, without touching the database.

Everything here works on files only, so a missing or malformed CSV
stops the run before the database is changed. run_load.py then loads
the cleaned result in one transaction.
"""

import re
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

import pandas as pd

# How many pounds each pack-size unit is worth. To accept a new unit,
# add one line here; every pattern in parse_case_lb uses this table.
UNIT_TO_LB = {
    "lb": 1.0,
    "lbs": 1.0,
    "#": 1.0,          # "10#" means 10 pounds
    "kg": 2.20462,
    "g": 0.00220462,
    "oz": 0.0625,      # 16 oz in a pound
}
UNIT = r"(lbs|lb|#|kg|oz|g)"  # longer names first, so "lbs" isn't read as "lb" + "s"

QTY_UNITS = ("CS", "LB", "KG")                            # units a quantity may arrive in
LOCATIONS = ("NB", "PVD", "HCS", "QA-HOLD", "DAMAGED")    # the only locations we accept
SALE_STATUSES = ("INVOICED", "OPEN", "CANCELLED")          # the only sales statuses we accept
CUSTOMER_TYPES = ("RESTAURANT", "GROCERY", "INTERNAL", "CRUISE")  # types the demand rules know


# ---------------------------------------------------------------------
# What the preparation step hands to the loader: cleaned rows ready to
# insert, notes for the cleaning log, and warnings to print.
# ---------------------------------------------------------------------
@dataclass
class Prepared:
    vendors: list = field(default_factory=list)       # rows for the vendors table
    items: list = field(default_factory=list)         # rows for the items table
    lots: list = field(default_factory=list)          # rows for the lots table
    adjustments: list = field(default_factory=list)   # rows for the adjustments table
    sales: list = field(default_factory=list)         # rows for the sales table
    snapshot_date: str = None                         # which inventory night was used
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
    """Pounds per case from free text like '10 lb cs', '6x2.2lb', '10/2#', '5kg', '4x2.5kg'.

    Returns None when there is no fixed case weight ('catch wt', 'per lb', blank).
    """
    s = pack_size.strip().lower()
    # Packs of smaller packs: "6x2.2lb", "10/2#", "4x2.5kg" -> count * size * pounds per unit
    m = re.fullmatch(rf"(\d+(?:\.\d+)?)\s*[x/]\s*(\d+(?:\.\d+)?)\s*{UNIT}", s)
    if m:
        return round(float(m[1]) * float(m[2]) * UNIT_TO_LB[m[3]], 3)
    # A single weight: "10 lb cs", "16.5 lb block", "10#", "5kg"
    # (?![a-z]) stops "5 gal" from being read as 5 grams.
    m = re.match(rf"(\d+(?:\.\d+)?)\s*{UNIT}(?![a-z])", s)
    if m:
        return round(float(m[1]) * UNIT_TO_LB[m[2]], 3)
    return None


def parse_date(value: str, where: str):
    """A date from 'YYYY-MM-DD' or 'MM/DD/YYYY'; blank becomes None; anything else stops the run."""
    value = value.strip()
    if not value:
        return None
    for fmt in ("%Y-%m-%d", "%m/%d/%Y"):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            pass
    raise SystemExit(f"{where}: can't read the date '{value}'")


def to_sell_uom(qty: float, uom: str, code: str, items: dict):
    """Convert a quantity into the item's selling unit.

    Returns (converted quantity, multiplier). The multiplier is how many
    selling units one original unit is worth; costs are divided by it.
    Kilograms become pounds first; pounds become cases using pounds per case.
    """
    sell_uom, case_lb = items[code]
    uom = uom.strip().upper()
    if uom not in QTY_UNITS:
        raise SystemExit(f"{code}: unknown unit '{uom}' (expected one of {QTY_UNITS})")
    multiplier = 1.0
    if uom == "KG":
        multiplier, uom = UNIT_TO_LB["kg"], "LB"
    if uom != sell_uom:
        if case_lb is None:
            raise SystemExit(f"{code}: can't convert {uom} to {sell_uom} without pounds per case")
        multiplier = multiplier / case_lb if sell_uom == "CS" else multiplier * case_lb
    return round(qty * multiplier, 3), multiplier


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
# inventory_on_hand.csv -> lots and adjustments
# Keeps only the latest night, sends ADJ rows to adjustments, drops
# zero-quantity lots, converts units (cost too), and keeps every real
# lot, including holds, damaged and expired: the views decide what sells.
# ---------------------------------------------------------------------
def prepare_inventory(data_dir: Path, prep: Prepared) -> None:
    source = "inventory_on_hand.csv"
    df = read_csv(data_dir, source,
                  ["snapshot_date", "item_code", "location", "lot_no", "qty", "uom",
                   "pack_date", "expiry_date", "received_date", "unit_cost"])
    df["snapshot_date"] = df["snapshot_date"].str.strip()

    # The file can hold more than one night. Use the latest; log the rest.
    nights = sorted(df["snapshot_date"].unique())
    snapshot = nights[-1]
    older = df[df["snapshot_date"] != snapshot]
    if len(older):
        prep.cleaning_log.append((
            source, None, f"{len(older)} rows from {', '.join(nights[:-1])}", "excluded",
            f"Older inventory night; only the latest ({snapshot}) is used",
        ))
    prep.snapshot_date = snapshot
    df = df[df["snapshot_date"] == snapshot]

    items = {row[0]: (row[4], row[5]) for row in prep.items}  # code -> (sell_uom, case_lb)
    seen = set()

    for row in df.itertuples(index=False):
        code = clean_code(row.item_code)
        lot = row.lot_no.strip()
        where = f"{source}, lot {lot}"
        if code not in items:
            raise SystemExit(f"{where}: item {code} isn't in items.csv")
        if lot in seen:
            raise SystemExit(f"{where}: this lot number appears twice")
        seen.add(lot)
        try:
            qty = float(row.qty)
        except ValueError:
            raise SystemExit(f"{where}: quantity '{row.qty}' isn't a number")

        # ADJ rows are count corrections, not lots (Dana: "subtract them").
        if lot.upper().startswith("ADJ-"):
            converted, _ = to_sell_uom(qty, row.uom, code, items)
            prep.adjustments.append((lot, code, converted))
            continue

        if qty == 0:
            prep.cleaning_log.append((source, code, lot, "excluded", "Zero quantity: nothing on hand"))
            continue
        if qty < 0:
            raise SystemExit(f"{where}: negative quantity on a lot that isn't an adjustment")

        location = row.location.strip().upper()
        if location not in LOCATIONS:
            raise SystemExit(f"{where}: unknown location '{row.location}'")

        converted, multiplier = to_sell_uom(qty, row.uom, code, items)
        cost = blank_to_none(row.unit_cost)
        cost = round(float(cost) / multiplier, 4) if cost is not None else None

        if multiplier != 1.0:
            sell_uom = items[code][0]
            prep.cleaning_log.append((
                source, code, lot, "converted",
                f"Received as {qty:g} {row.uom.strip().upper()}; stored as {converted:g} {sell_uom}",
            ))
            if sell_uom == "CS" and abs(converted - round(converted)) > 0.01:
                prep.warnings.append(f"{code} lot {lot}: {qty:g} {row.uom} is {converted:g} cases, not a whole number")

        prep.lots.append((
            lot,                                       # lot_no
            code,                                      # item_code
            location,                                  # location
            converted,                                 # qty, in the item's selling unit
            parse_date(row.pack_date, where),          # pack_date
            parse_date(row.expiry_date, where),        # expiry_date
            parse_date(row.received_date, where),      # received_date
            cost,                                      # unit_cost, per selling unit
        ))


# ---------------------------------------------------------------------
# sales_lines.csv (+ customer type from customers.csv) -> sales
# Every line is loaded. demand_reason() decides, once, whether a line
# counts toward normal demand; lines that don't keep their reason.
# ---------------------------------------------------------------------
def demand_reason(status: str, order_no: str, qty: float, customer_type, price: float):
    """Why a sales line does NOT count toward demand, or None if it does.

    This is the one place that decides what counts as normal demand.
    The first rule that applies gives the reason.
    """
    if status == "CANCELLED":
        return "cancelled"
    if status == "OPEN":
        return "open order (promised stock, not history)"
    if order_no.startswith("CM-") or qty < 0:
        return "credit (return)"               # your call: returns don't reduce demand
    if customer_type == "INTERNAL":
        return "transfer between warehouses"    # Dana: transfers are right to leave out
    if customer_type == "CRUISE":
        return "cruise order (one-off)"         # Marco: "That was a one-off."
    if price == 0:
        return "sample ($0)"                    # Dana: samples are right to leave out
    return None


def prepare_sales(data_dir: Path, prep: Prepared) -> None:
    source = "sales_lines.csv"
    customers = read_csv(data_dir, "customers.csv", ["customer_code", "customer_type"])
    type_of = {clean_code(c): t.strip().upper() or None
               for c, t in zip(customers["customer_code"], customers["customer_type"])}

    df = read_csv(data_dir, source,
                  ["order_no", "line_no", "order_date", "ship_date", "customer_code",
                   "item_code", "qty", "uom", "unit_price", "status"])
    items = {row[0]: (row[4], row[5]) for row in prep.items}  # code -> (sell_uom, case_lb)

    seen = set()
    reasons = {}            # reason -> number of lines, summarised in the cleaning log
    slash_dates = 0         # lines written as MM/DD/YYYY
    unknown_customers = set()
    unknown_types = set()

    for row in df.itertuples(index=False):
        order_no = row.order_no.strip()
        where = f"{source}, order {order_no} line {row.line_no}"
        try:
            line_no = int(row.line_no)
            qty = float(row.qty)
            price = float(row.unit_price) if row.unit_price.strip() else 0.0
        except ValueError:
            raise SystemExit(f"{where}: line number, quantity or price isn't a number")
        if (order_no, line_no) in seen:
            raise SystemExit(f"{where}: this order line appears twice")
        seen.add((order_no, line_no))

        code = clean_code(row.item_code)
        if code not in items:
            raise SystemExit(f"{where}: item {code} isn't in items.csv")
        status = row.status.strip().upper()
        if status not in SALE_STATUSES:
            raise SystemExit(f"{where}: unknown status '{row.status}'")

        if "/" in row.order_date or "/" in row.ship_date:
            slash_dates += 1
        order_date = parse_date(row.order_date, where)
        ship_date = parse_date(row.ship_date, where)
        if order_date is None or ship_date is None:
            raise SystemExit(f"{where}: order date and ship date are both required")

        customer = clean_code(row.customer_code)
        customer_type = type_of.get(customer)
        if customer not in type_of:
            unknown_customers.add(customer)
        elif customer_type not in CUSTOMER_TYPES:
            unknown_types.add(customer_type)

        converted, _ = to_sell_uom(qty, row.uom, code, items)
        reason = demand_reason(status, order_no, qty, customer_type, price)
        if reason:
            reasons[reason] = reasons.get(reason, 0) + 1

        prep.sales.append((
            order_no,                 # order_no
            line_no,                  # line_no
            order_date,               # order_date
            ship_date,                # ship_date: history basis; planned date for OPEN
            customer,                 # customer_code
            customer_type,            # customer_type, from customers.csv
            code,                     # item_code
            converted,                # qty, in the item's selling unit (credits negative)
            status,                   # status
            reason is None,           # is_demand
            reason,                   # exclude_reason
        ))

    # One summary note per reason; each line keeps its own reason in sales.
    for reason, count in sorted(reasons.items()):
        prep.cleaning_log.append((source, None, f"{count} lines", "excluded",
                                  f"Not counted as demand: {reason}"))
    if slash_dates:
        prep.cleaning_log.append((source, None, f"{slash_dates} lines", "converted",
                                  "Dates written MM/DD/YYYY read as month/day/year"))
    for customer in sorted(unknown_customers):
        prep.warnings.append(f"Sales: customer {customer} isn't in customers.csv; counted as normal demand")
    for customer_type in sorted(t for t in unknown_types if t):
        prep.warnings.append(f"Sales: unknown customer type '{customer_type}'; counted as normal demand")


# ---------------------------------------------------------------------
# Entry point: prepare every file, in dependency order.
# ---------------------------------------------------------------------
def prepare_all(data_dir: Path) -> Prepared:
    prep = Prepared()
    prepare_vendors(data_dir, prep)   # first: items check their vendor against this
    prepare_items(data_dir, prep)     # second: inventory, sales and POs check items
    prepare_inventory(data_dir, prep)
    prepare_sales(data_dir, prep)
    # Step 19 adds purchase orders here.
    return prep
