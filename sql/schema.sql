-- Tidewatch schema.
-- 1. Dana's tables: created once, never dropped.
-- 2. Rebuilt tables: dropped and reloaded from the CSVs each time.
-- 3. Views: calculated answers, recreated each time.
-- Every date-based rule uses settings.today, never the computer clock.
--
-- No BEGIN/COMMIT here on purpose: the caller (run_load.py) runs this
-- file inside its own transaction, so the schema and the data load
-- succeed or fail together.

-- 1. Dana's tables ----------------------------------------------
-- No foreign keys: the rebuilt tables they relate to are replaced
-- each load. The loader flags any entry whose code no longer exists.

CREATE TABLE IF NOT EXISTS settings (
  key    TEXT PRIMARY KEY,           -- e.g. 'today', 'expiry_cutoff_months'
  value  TEXT NOT NULL,
  note   TEXT                        -- plain-English explanation for Dana
);

CREATE TABLE IF NOT EXISTS vendor_settings (
  vendor_code     TEXT PRIMARY KEY,
  lead_time_days  INT CHECK (lead_time_days >= 0),  -- Dana-confirmed
  buffer_days     INT CHECK (buffer_days >= 0),     -- extra cushion
  note            TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS item_settings (
  item_code        TEXT PRIMARY KEY,
  reorder_enabled  BOOLEAN,          -- true / false = Dana's override; NULL = no override
  note             TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS handled (
  id             SERIAL PRIMARY KEY,
  item_code      TEXT NOT NULL,
  qty            NUMERIC CHECK (qty > 0),  -- optional, but never zero or negative
  expected_date  DATE,                     -- optional
  note           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  cleared_at     TIMESTAMPTZ,              -- NULL = still active
  CHECK (cleared_at IS NULL OR cleared_at >= created_at)
);

-- 2. Rebuilt tables ---------------------------------------------
-- Drop views first by name, then the tables together.
-- No CASCADE: if anything else depends on these, Postgres stops
-- with an error instead of silently deleting it.

DROP VIEW IF EXISTS lot_status, item_reorder, po_status;
DROP TABLE IF EXISTS cleaning_log, import_info, purchase_orders,
  sales, adjustments, lots, items, vendors;

CREATE TABLE vendors (
  vendor_code     TEXT PRIMARY KEY,
  vendor_name     TEXT NOT NULL,
  country         TEXT,
  currency        TEXT,              -- as BlueTide reports it (e.g. CAD)
  lead_time_raw   TEXT               -- BlueTide's value, kept as evidence only
);

CREATE TABLE items (
  item_code      TEXT PRIMARY KEY,   -- cleaned: trimmed, upper case
  description    TEXT NOT NULL,
  category       TEXT,
  storage        TEXT,               -- FROZEN or FRESH
  sell_uom       TEXT NOT NULL CHECK (sell_uom IN ('CS', 'LB')),
  case_lb        NUMERIC CHECK (case_lb > 0),  -- pounds per case
  vendor_code    TEXT REFERENCES vendors,
  source_status  TEXT                -- BlueTide's status, as written
);

CREATE TABLE lots (
  lot_no         TEXT PRIMARY KEY,   -- unique in the Nov 15 snapshot (documented)
  item_code      TEXT NOT NULL REFERENCES items,
  location       TEXT NOT NULL
                 CHECK (location IN ('NB', 'PVD', 'HCS', 'QA-HOLD', 'DAMAGED')),
  qty            NUMERIC NOT NULL CHECK (qty > 0),  -- in sell_uom
  pack_date      DATE,
  expiry_date    DATE,
  received_date  DATE,
  unit_cost      NUMERIC             -- per sell_uom; currency assumed (documented)
);

CREATE TABLE adjustments (
  ref        TEXT PRIMARY KEY,       -- e.g. ADJ-2211
  item_code  TEXT NOT NULL REFERENCES items,
  qty        NUMERIC NOT NULL        -- negative allowed: count correction down
);

CREATE TABLE sales (
  order_no        TEXT NOT NULL,
  line_no         INT NOT NULL,
  order_date      DATE NOT NULL,
  ship_date       DATE NOT NULL,     -- history basis; planned date for OPEN
  customer_code   TEXT,
  customer_type   TEXT,              -- RESTAURANT, GROCERY, INTERNAL, CRUISE
  item_code       TEXT NOT NULL REFERENCES items,
  qty             NUMERIC NOT NULL,  -- in sell_uom; credits negative
  status          TEXT NOT NULL CHECK (status IN ('INVOICED', 'OPEN', 'CANCELLED')),
  is_demand       BOOLEAN NOT NULL,  -- false for OPEN, cancelled, samples, etc.
  exclude_reason  TEXT,
  PRIMARY KEY (order_no, line_no)
);

CREATE TABLE purchase_orders (
  po_no          TEXT NOT NULL,
  line_no        INT NOT NULL,
  vendor_code    TEXT REFERENCES vendors,
  item_code      TEXT NOT NULL REFERENCES items,
  order_date     DATE,
  expected_date  DATE,               -- vendor's original estimate, never confirmed
  qty_remaining  NUMERIC NOT NULL CHECK (qty_remaining >= 0),
  PRIMARY KEY (po_no, line_no)
);

CREATE TABLE cleaning_log (
  id           SERIAL PRIMARY KEY,
  source_file  TEXT NOT NULL,
  item_code    TEXT,               -- no FK: may record codes that were merged away
  detail       TEXT,
  action       TEXT NOT NULL,      -- excluded, merged, converted, flagged
  reason       TEXT NOT NULL
);

CREATE TABLE import_info (
  key    TEXT PRIMARY KEY,         -- e.g. 'snapshot_date', 'loaded_at'
  value  TEXT NOT NULL
);

-- 3. Views ------------------------------------------------------
-- Each view reads settings with a scalar subquery: always one row,
-- NULL if a setting is missing, so rows never silently disappear.
-- Every unavailable lot gets a reason; every item and PO gets a label.

-- Is each lot sellable as of the planning date?
-- The projection (Step 26) checks sellable_until per day separately.
CREATE VIEW lot_status AS
WITH s AS (
  SELECT
    (SELECT value::date FROM settings WHERE key = 'today')                AS today,
    (SELECT value::int  FROM settings WHERE key = 'expiry_cutoff_months') AS cutoff
),
with_deadline AS (
  SELECT
    l.*,
    s.today,
    s.cutoff,
    -- the one cutoff calculation: last day the lot can be sold at full value
    (l.expiry_date - make_interval(months => s.cutoff))::date AS sellable_until
  FROM lots l CROSS JOIN s
),
with_reason AS (
  SELECT
    d.*,
    CASE
      WHEN d.today IS NULL OR d.cutoff IS NULL THEN 'Settings missing: today or cutoff'
      WHEN d.location = 'QA-HOLD'              THEN 'On QA hold'
      WHEN d.location = 'DAMAGED'              THEN 'Damaged'
      WHEN d.expiry_date IS NULL               THEN 'Expiry unknown: review required'
      WHEN d.expiry_date <= d.today            THEN 'Expired'
      WHEN d.today > d.sellable_until          THEN 'Inside the ' || d.cutoff || '-month line'
    END AS unavailable_reason          -- NULL for sellable lots, by design
  FROM with_deadline d
)
SELECT
  r.*,
  (r.unavailable_reason IS NULL) AS is_sellable  -- sellable only when no reason applies
FROM with_reason r;

-- Should Tidewatch suggest reordering this item, and why?
-- Controls purchase recommendations only; stock stays visible regardless.
CREATE VIEW item_reorder AS
SELECT
  i.item_code,
  i.source_status,
  st.reorder_enabled AS dana_override,
  CASE
    WHEN i.storage = 'FRESH' OR i.item_code LIKE 'ZZ-%'           THEN false
    WHEN st.reorder_enabled IS NOT NULL                            THEN st.reorder_enabled
    WHEN upper(trim(i.source_status)) IN ('DISC', 'DISCONTINUED')  THEN false
    ELSE true
  END AS reorder_enabled,
  CASE
    WHEN i.storage = 'FRESH'                                       THEN 'Fresh: outside this workflow'
    WHEN i.item_code LIKE 'ZZ-%'                                   THEN 'Old system item (ZZ)'
    WHEN st.reorder_enabled IS NOT NULL                            THEN 'Set by Dana'
    WHEN upper(trim(i.source_status)) IN ('DISC', 'DISCONTINUED')  THEN 'BlueTide: discontinued'
    WHEN upper(trim(i.source_status)) IN ('ACTIVE', 'A')           THEN 'BlueTide: active'
    ELSE 'BlueTide status unclear: please review'
  END AS reason
FROM items i
LEFT JOIN item_settings st ON st.item_code = i.item_code;

-- Arrival timing for each open PO, as of the planning date.
-- Every vendor date is an unconfirmed estimate (Dana). Quantities stay
-- visible; only the timing label changes. "Not overdue" never means reliable.
CREATE VIEW po_status AS
WITH s AS (
  SELECT (SELECT value::date FROM settings WHERE key = 'today') AS today
),
with_timing AS (
  SELECT
    p.*,
    s.today,
    CASE
      WHEN s.today IS NULL           THEN 'Settings missing: today'
      WHEN p.expected_date IS NULL   THEN 'Arrival date unknown'
      WHEN p.expected_date < s.today THEN 'Overdue: arrival unconfirmed'
      ELSE 'Vendor estimate: unconfirmed'
    END AS timing_status
  FROM purchase_orders p CROSS JOIN s
)
SELECT
  t.*,
  (t.timing_status = 'Overdue: arrival unconfirmed') AS is_overdue,  -- always true or false
  CASE WHEN t.timing_status = 'Overdue: arrival unconfirmed'
       THEN t.today - t.expected_date END AS days_overdue
FROM with_timing t;