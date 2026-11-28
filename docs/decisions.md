# Tidewatch: decisions and assumptions

Every choice that changes a number on screen, why it was made, and where it came from.

**Status key**
- **Confirmed**: Dana confirmed it (kickoff call or her email reply).
- **Our call**: Dana left it to us, or the data required a choice. Reasoning given.
- **Assumption**: not confirmed. Easy to change, and worth checking with Dana.

Planning date for everything date-based: **Monday, November 16, 2026** (stored in `settings.today`, never the computer clock).

---

## 1. Scope

| Decision | Why | Source | Status |
|---|---|---|---|
| Answer Dana's two questions only: what will run out before a new order could arrive, and what she's stuck with. | That's what the first version is for. Walt: "Dana first." | Kickoff call | Confirmed |
| Fresh items are out of scope. | Dana buys fresh daily and doesn't need help with it. | Kickoff call | Confirmed |
| Marco's requests (pricing, route planning, emails) wait. `price_list.csv` is kept in `data/` but not loaded. | Dana first. | Kickoff call | Confirmed |
| No natural-language Q&A (chatbot) in this version. | Its answers couldn't be made traceable, which conflicts with "every number explained". | Our call | Our call |

## 2. Cleaning the data

| Decision | Why | Source | Status |
|---|---|---|---|
| Use only the latest inventory night in the file (Nov 15). The older night's rows (115, Nov 14) are logged as one note, and the night used is saved in `import_info` so the screen can say which night the stock is from. | The file contains two nights; using both would double the stock. Picking the latest instead of hard-coding a date means a future file works unchanged. | Kickoff call (Dana) | Confirmed |
| Clean item codes (trim spaces, upper case) and merge duplicates: `COD-LOIN `, `shr-1620 `, `Sal-Por6`. The row already typed in the clean format is kept as the real item; the others are logged as merged. If a group ever had no clean row, or more than one, the load stops. | They are the same products typed differently; stock, sales and POs must join to one item. Every duplicate is a 2021 import (created 2021-04-12). | Data check | Our call |
| Pounds per case are read from the free-text pack size using one unit table (lb, lbs, #, kg, g, oz): packs of packs ("6x2.2lb", "10/2#", "4x2.5kg") and single weights ("10 lb cs", "10#", "5kg" = 11.023 lb). "catch wt", "per lb" and blank give no case weight; a case item without one triggers a warning. Adding a unit is one line in the table. | Needed to convert lots received in pounds into cases. Verified: identical results to the earlier version on every real pack size. | Data check | Our call |
| Category is tidied to one form ("SALMON", "shrimp" → "Salmon", "Shrimp"). | Consistent grouping on screen. | Data check | Our call |
| Store every quantity in the item's selling unit (cases, or pounds for salmon sides and pollock blocks). Lots received in the other unit are converted using pounds per case parsed from `pack_size`. Unit cost is converted with the quantity. | Dana converts in her head today. Converting once in the loader means the app never mixes units. CAL-RING and LOB-T56 have lots received in pounds. | Kickoff call, data check | Our call |
| Keep QA-HOLD and DAMAGED lots in the database, but never count them as sellable. | "If I can't sell it, it isn't inventory." Keeping the rows lets Tidewatch explain why its number differs from BlueTide's. | Kickoff call (Walt) | Confirmed |
| ZZ items are never suggested for reordering, whatever their status says (ZZ-SCL-0002 says "Active"). | Old-system items nobody deleted. | Kickoff call (Dana) | Confirmed |
| Subtract ADJ rows from the item's stock. | They are count corrections. | Dana's email | Confirmed |
| Expired lots are kept but not sellable. | They can't be sold, but they belong in the "stuck with" picture. | Our call | Our call |
| A lot with no expiry date is not sellable and is flagged "Expiry unknown: review required". | Conservative: better to under-count than promise stock that may be unsellable. No such lots exist in this data; the rule covers future files. | Our call | Assumption |
| Zero-quantity lots are dropped and recorded in the cleaning log (8 lots, all "-01B" splits). | They add nothing to stock. | Data check | Our call |
| A unit conversion that doesn't come out to a whole number of cases triggers a warning. | A fractional case count usually means a wrong pack size or a typo. All three real conversions are whole numbers (10, 22, 16). | Our call | Our call |
| A lot with an unknown location, an unknown unit, a negative quantity, an unknown item or a repeated lot number stops the load. | Better to stop with a clear message than load stock that may not be real. | Our call | Our call |
| The raw CSVs are kept unchanged in `data/`; every fix happens in the loader. | Reproducible, reviewable, and the evidence for "What we cleaned". On a real deployment, customer data would not be committed to a repo. | Our call | Our call |

## 3. Stock and the six-month line

| Decision | Why | Source | Status |
|---|---|---|---|
| Lots inside six months of expiry don't count toward future sales. They still appear in "stuck with". | "Once a lot is inside 6 months, I'm discounting it or dumping it." She still orders newer stock to cover sales. | Dana's email | Confirmed |
| The six-month rule applies only to frozen lots. A fresh lot is sellable until the day before it expires. | Dana's rule is about frozen stock; fresh fish lasts days. Found by reading the real output: all 6 unexpired fresh lots were wrongly labelled "inside the 6-month line", which would have listed fresh fish as stuck stock. Fixed in the one view where the rule lives. | Data check | Our call |
| A lot is sellable through `sellable_until` = expiry date − 6 months. On that exact day it's still sellable. | Dana's rule is "less than six months left"; exactly six months is not less. | Our interpretation | Assumption |
| The deadline is calculated once and used everywhere, including in the projection: each lot stops counting after its own `sellable_until`. | A lot sellable today may cross the line during the forecast window. | Our call | Our call |
| Promised stock = quantity on OPEN sales lines. On-hand is never reduced for it twice. It's used two ways: "available now" = sellable − promised (a display number), and in the dated projection each booked order is subtracted on its planned ship date, once. | Open orders are spoken for, but the stock is still in the on-hand report. The open quantity is what still has to ship. | Dana's email | Confirmed |
| Stock at Harbor Cold Storage (HCS) is highlighted with its value. | Harbor charges by the pallet each month. | Kickoff call (Walt) | Confirmed |
| "Stuck with" has two groups. Aging: inside the 6-month line, expired, or expected to pass the line before it sells (from the projection, selling oldest first). Unavailable: damaged, on QA hold, or expiry unknown. Each lot shows its value at cost and whether it's at Harbor. | Dana's question is about stock getting too old; holds and damaged stock can't be sold either, but for different reasons, so they're shown separately. Projected expiry catches stock before it's stuck, while discounting can still help. | Kickoff call (Dana, Walt) | Our call |
| "Received 90+ days ago" is shown as an adjustable check, not a rule. | Dana never set this threshold. It measures time since receipt, not time at Harbor, and isn't proof of excess. | Our call | Assumption |
| Stock value uses lot `unit_cost` as reported. Its currency is not established. | `vendors.csv` says Maritime Northern Pack bills in CAD, but that doesn't prove lot costs are in CAD. | Data check | Assumption |

## 4. Purchase orders

| Decision | Why | Source | Status |
|---|---|---|---|
| Only Open POs count. Remaining = ordered − received. Received, Closed and Cancelled lines are ignored (summarised in the cleaning log). An exact duplicate line is counted once and logged; two different lines with the same PO and line number stop the load. A partly received line is flagged in the cleaning log. Result: 377 lines → 14 open lines, 3 of them overdue on Nov 16. | Partial deliveries stay open for the rest (PAN-0709: 1,000 ordered, 600 received, 400 still coming). | Kickoff call (Dana), data check | Confirmed |
| A PO whose vendor differs from the item's vendor in items.csv triggers a warning. | A mismatch would mean the wrong lead time; none in the current data. | Our call | Our call |
| Every expected date is a vendor estimate, never confirmed. | Dates are the vendor's original quote and nobody updates them. | Dana's email | Confirmed |
| Every open PO gets one timing label: "Arrival date unknown" (no date), "Overdue: arrival unconfirmed" (date already passed) or "Vendor estimate: unconfirmed" (future date). A missing date is never treated as on time. | Dana: all open PO dates are original quotes nobody updates. | Dana's email | Confirmed |
| Overdue POs stay visible as outstanding orders with their quantities, but never cover demand on an invented arrival date. | "Please don't assume they'll land soon." | Dana's email | Confirmed |
| "Not overdue" never means reliable. A future-dated PO is still an unconfirmed estimate and only supports the labelled "if vendor dates hold" scenario. | Dana has no better dates for any open PO. | Dana's email | Confirmed |
| Items covered only by a late PO are flagged. | Dana asked to see this. Example: SHR-2125 has 90 on hand, 91 promised, and only an 800-case PO due Oct 5. | Dana's email | Confirmed |
| The main screen shows coverage without unconfirmed POs, plus a flag "Coverage depends on unconfirmed delivery". The "if vendor dates hold" scenario is in the item detail. | Safe by default, and simple enough for Dana's one-minute test. | Our call | Our call |
| "I've handled this" never auto-matches a later PO. When an item has both an active handled note and open POs, the item panel shows them side by side with a prompt to check whether a PO is the one she handled; Dana decides. A handled note never adds supply or changes any calculation. | Matching automatically could count the same order twice, or miss one; hiding the risk would be worse. | Our call | Our call |

## 5. Demand

| Decision | Why | Source | Status |
|---|---|---|---|
| Whether a sales line counts as demand is decided in one function, `demand_reason()` in `prepare.py`, checking in order: cancelled, open order, credit, transfer (INTERNAL), cruise (CRUISE), sample ($0). The first that applies is stored as the line's reason. Result: 14,716 of 15,750 lines count; 1,034 don't (294 cancelled, 180 open, 76 credits, 378 transfers, 2 cruise, 104 samples). | One place to change the rule in a live review, and every excluded line keeps its reason. | Our call | Our call |
| Excluded sales are summarised in the cleaning log as one note per reason; each line's own reason stays on the sales row. | Logging 1,034 lines one by one would bury the useful notes. | Our call | Our call |
| The 51 sales lines with dates written like 01/04/2026 are read as month/day/year. | Some of those dates have days above 12 (e.g. 01/18/2026), which only works as month/day; all fall in January to April 2026, matching their order numbers. | Data check | Our call |
| A sales line whose customer isn't in customers.csv, or has an unrecognised type, counts as normal demand and triggers a warning. | Unknown customers are most likely ordinary buyers; the warning makes sure someone checks. None in the current data. | Our call | Assumption |
| Exclude samples ($0 lines), transfers, the cruise order and cancelled lines from demand. | They don't reflect normal customer buying. | Dana's email | Confirmed |
| Identify transfers and the cruise order by `customer_type` (INTERNAL, CRUISE), not by name. | More reliable than matching text like "TRANSFER - PVD". | Data check | Our call |
| Exclude return credits from demand. Credits remain visible separately; current stock comes from the on-hand report. | Return reasons are unknown, and a credit may not mean the customer needed less. Checked by product: credits are under 1% of shipments for every active frozen item and are concentrated on the three discontinued items. **Limitation:** if replacements are booked as new sales, demand may be slightly overstated. | Dana left it to us | Our call |
| OPEN lines are commitments, not history. They never count toward historical demand. | Counting them would add demand that hasn't happened yet. | Our call | Our call |
| Use `ship_date` for all history and for timing open orders. | It's when stock actually leaves. One basis for both avoids mismatches. Invoiced orders ship a median of 2 days after ordering. | Data check | Our call |
| Forecast from last year's sales in the same weeks. | Demand is seasonal (Lent, holidays). Dana knows of no customer changes. **Limitation:** history starts November 2025, so there is one year to learn from. | Dana's email | Confirmed |
| Forecast weeks are counted from the planning date; each week ahead uses the same week last year, 364 days back so weekdays line up. If a week ahead has no matching week in the data, the item's recent 8-week average is used. | Dana: last year's same-season sales are fine. | Dana's email | Confirmed |
| A run of zero-sales weeks (up to 6) between normal selling weeks is treated as a stockout, not a lack of demand, and filled with the average of the last two selling weeks before it. Those weeks are flagged "estimated" on screen. | SHR-1620 shipped nothing Dec 15 to Jan 10 last year: Dana's Christmas stockout ("we ran out of 16/20 shrimp ten days before Christmas"). Copying last year would forecast zero demand for this Christmas and repeat the stockout. Checked across all items: only SHR-1620 has such a gap. The estimate (101 cases a week) is conservative for the post-Christmas weeks. | Kickoff call (Dana), data check | Assumption |
| Booked orders and forecast overlap: per item, per week, demand = the larger of the forecast and what's booked. Individual ship dates are kept for the day-by-day projection. | Adding both would double-count. Per-week keeps a big booking this week from erasing next month's forecast. | Our call | Assumption |

## 6. Ordering

| Decision | Why | Source | Status |
|---|---|---|---|
| Lead times and cushion use the values proposed to Dana, which she confirmed ("Those are all right"): Bien Xanh, Vietnam (BXE) 84 days + 14 cushion; Austral Frío, Chile (AFS) 42 + 14; Maritime Northern Pack, Canada (MNP) 14 + 7; Aleutian Shore, Alaska (ASP) 28 + 7; Downeast Lobster, Maine (DLC) 21 + 7. For Vietnam, the upper end of her 10–12 week range is used. BlueTide's values are kept only as evidence. | BlueTide is outdated (says 8 weeks for Vietnam), missing for Chile, and text ("2-3 wks") for DLC. | Dana's email | Confirmed |
| An item with no lead time for its vendor gets a "Lead time not set" flag instead of an order-by date, and the loader warns about any reorderable item in that situation. Example: TIL-FIL's vendor (OCN) has no lead time; if Dana re-enables it, Tidewatch asks for one rather than inventing a date. | Never guess an order date. | Our call | Our call |
| The projection walks forward one day at a time for `projection_weeks`: count corrections on day 0, booked orders on their ship dates, extra forecast demand (above what's booked that week) spread evenly over the week, oldest stock sold first, and each lot dropped after its sellable-until date. The run-out date is the first day demand can't be met. | Shows when stock really runs out, including lots crossing the 6-month line during the period. Selling oldest first matches how a warehouse ships. | Our call | Our call |
| Order-by date = run-out date − (lead time + cushion). Order now: order-by is today or past (shown as days late). Order soon: within 14 days. Otherwise OK. | An order placed after the order-by date can't arrive, with its cushion, before stock runs out. 14 days gives Dana two Monday reviews of warning. | Our call | Assumption |
| Every item is projected twice: the safe view (no PO counted) drives the status; the scenario (future vendor estimates arrive on their dates) is shown alongside. Flags: "only covered by an overdue PO" and "coverage depends on unconfirmed delivery". | Dana: don't assume POs will land; she wants to see items only covered by a late PO. | Dana's email | Confirmed |
| Minimum order quantities are ignored. | "Don't worry about those." | Dana's email | Confirmed |
| A suggested order amount is wanted as a suggestion Dana checks herself. Not built yet: the rule for calculating it will be decided and documented first; until then the item panel says "not yet available". | Nice to have; she'll still check it herself. New purchasing logic shouldn't be added without an agreed rule. | Dana's email | Confirmed (feature) / Pending (rule) |
| SHR-6170, TIL-FIL and PAN-1012 start with reordering turned off. Dana can turn it back on, and imports never overwrite her choice. Every order alert and suggested amount reads the `item_reorder` view, so the choice is enforced, not just stored. | She has stopped buying all three. | Dana's email | Confirmed |
| BlueTide's item status is kept as written, separate from Dana's choice. When they disagree, both are shown. | The disagreement is evidence, not an error. | Our call | Our call |
| Items with a blank or unclear status are treated as reorderable and flagged for review (for example LOB-MEAT, PAN-PORT4). | Running out hurts Dana more than over-ordering. | Our call | Assumption |
| `item_reorder` controls purchase recommendations only. Items that aren't reordered still show their remaining stock, anything that needs clearing, and their customers' open orders. | Dana still has to sell through or clear that stock and fill booked orders. | Our call | Our call |

## 7. Data model

| Decision | Why | Source | Status |
|---|---|---|---|
| Store facts, not conclusions. Views (`lot_status`, `item_reorder`, `po_status`) work out sellability, reorder eligibility and PO timing from `settings`. Every unavailable lot gets a reason (sellable lots have none, by design), and every item and PO gets a label, so no result is an unexplained blank. A missing setting never makes rows disappear. | A rule change is one edit, not a reload. | Our call | Our call |
| Two kinds of tables: rebuilt from the CSVs each load, and Dana's own input (settings, lead times, reorder choices, "handled"), which is never dropped. | Reloading the data must never erase Dana's decisions. | Our call | Our call |
| Dana's tables have no foreign keys. The loader checks that their codes still exist and flags any that don't instead of deleting them. | The tables they relate to are replaced on every load. | Our call | Our call |
| No `CASCADE` on drops. Views are dropped by name first. | If something unexpected depends on a table, Postgres stops with an error instead of silently deleting it. | Our call | Our call |
| The loader is split in two: `prepare.py` reads and cleans the CSVs with no database involved (every cleaning rule lives there); `run_load.py` handles the schema, settings, inserts, checks and commit. | A bad file fails before Neon is touched, and a cleaning change and a database change each have one obvious home. | Our call | Our call |
| The loader reads and validates every CSV before connecting to the database, so a missing or malformed file fails before anything is touched. Then, in one transaction, it applies the schema, seeds defaults, validates settings, loads the data and validates the result (row counts, snapshot date, units, demand exclusions, Dana's codes still matching), committing only after every check passes. `schema.sql` has no `BEGIN`/`COMMIT` of its own, so it can't end that transaction early. | A failed load leaves the previous data untouched, so the live site never shows empty or half-loaded tables. | Our call | Our call |
| Lots only accept the five known locations (NB, PVD, HCS, QA-HOLD, DAMAGED). An unknown location stops the load with a clear error. | A typo like "QA_HOLD" would otherwise slip past the hold check and count as sellable. | Our call | Our call |
| A "handled" quantity is optional but must be above zero, and an undo time can't be earlier than the entry. | Catches bad input at the database. | Our call | Our call |
| Missing or invalid settings (planning date, a negative cutoff) stop the backend before any projection or recommendation runs, with a clear error. The views' "Settings missing" labels are a backstop, not the check. | Prevents silent, unexplained numbers. | Our call | Our call |
| Primary keys use the source's own codes where they're unique (item code, lot number, order + line, PO + line). | A duplicate row is rejected instead of counted twice. **Limitation:** lot numbers are unique in this snapshot, but a future file could validly repeat one across locations. | Data check | Our call |
| Quantities are stored without a unit column; the unit lives once, in `items.sell_uom`. Every API response that includes a quantity also returns its unit, and the screens always show the two together ("450 cases", "1,240 lb"), never a bare number. | One source of truth: storing the unit on every row would repeat the same fact and create a new way for rows to disagree. | Our call | Our call |
| Codes in Dana's tables (vendor_settings, item_settings, handled) must be trimmed and upper case, enforced by a check constraint. The check is added with a guarded `ALTER TABLE` in `schema.sql`, so it applies to tables that already exist. | Dana's tables have no foreign keys, so a badly typed code would silently never match. | Our call | Our call |
| Rebuilt tables are written only by the loader; the app only reads them. In Dana's tables only values are edited, never the key columns. | No key is ever changed while other rows point at it. | Our call | Our call |
| Checked: every item, vendor and customer code referenced in the CSVs exists after cleaning, and every PO's vendor matches its item's vendor. The foreign keys enforce this on every future load. | Integrity verified against the real data, not assumed. | Data check | Our call |
| `sales` and `purchase_orders` keep one row per line, so order-level facts (date, customer, vendor) repeat on each line, and `sales.customer_type` is copied from customers. This deliberately skips strict 2NF/3NF. | These tables are rebuilt from BlueTide and never edited, so the update errors normalization prevents can't occur. Checked: every line of an order has the same customer and dates. Simpler, traceable forecast queries. Alternative if the system grew: separate orders/order_lines and customers tables. | Our call | Our call |
| `items.storage` only accepts FROZEN or FRESH; the loader tidies category case and warns about unknown customer types. | The views rely on exact values (`FRESH`, `INTERNAL`, `CRUISE`); a value like "Fresh" would otherwise slip past them. | Our call | Our call |
| `scripts/load/verify.py` checks 33 known facts against the loaded data (counts, the SAL-POR6, SHR-2125 and SHR-1620 stories, unit conversions, adjustments, demand exclusions, Dana's settings). Expected values were worked out independently from the raw CSVs. It runs on a read-only connection. | Proves the numbers are right before anything is built on them, and gives a one-command regression check after any change, including live ones. | Our call | Our call |
| Calculations run in the web app's backend (TypeScript), reading settings at request time, rather than being precomputed by the loader. | After a setting is saved, the app refreshes the affected results without rerunning the CSV loader. (An open screen doesn't change by itself; the settings page's Save triggers the refresh.) | Our call | Our call |
| Every calculation starts with `loadPlanningRules()`, which checks the planning date is a real date, the cutoff and aging values are whole numbers of 0 or more, and `projection_weeks` is at least 1 and covers the longest lead time plus cushion (98 days). Any failure stops projections with a clear error naming the setting; the minimum horizon is worked out from current lead times, not hard-coded. | Invalid planning settings must stop projections, not silently change them. (Calculation logic has its own checks; see Step 29.) The views' "Settings missing" labels are only a backstop. | Our call | Our call |
| New setting `projection_weeks` (default 26): how far ahead stock is projected. Dana didn't specify a horizon. The minimum (14 weeks) comes from her slowest lead time plus cushion (Vietnam, 98 days); 26 adds headroom. Seeded like the others, so it's added without touching Dana's values. | Order-by dates for Vietnam must fall inside the projection, with room if a lead time grows. | Our call (minimum from Dana's lead times) | Assumption |
| Postgres dates reach the app as "YYYY-MM-DD" text, not JavaScript dates. | Treating a calendar date as a timestamp risks it shifting a day when parsed or formatted in another time zone; text avoids that path. | Our call | Our call |
| NUMERIC and counts arrive as JavaScript numbers; money is rounded to cents when displayed. | Deliberate trade-off: values here are small and bounded (counts up to 15,750, quantities in the thousands, totals around $81,000), so counts and quantities are exact. A larger or financial system would use exact decimals. | Our call | Assumption |
| Vendors with incomplete lead-time settings are left out of the lead-time list, but their items still appear, marked "Lead time not set: review required." | Nothing is hidden from Dana. | Our call | Our call |
| The screens use five read routes: `/api/plan` (Monday screen), `/api/items/[code]` (item detail with the evidence behind every number), `/api/stuck`, `/api/cleaned` ("What we cleaned") and `/api/settings`. The step-by-step check routes (`/api/items` list, `/api/demand`, `/api/incoming`) are removed; their logic lives in `lib/`. Each plan also shows when a new order would arrive if placed today. | A small, clear API; thin routes over logic in `lib/`, so a live change happens in one place. "Arrives if ordered today" turns "62 days late" into something Dana can act on. | Our call | Our call |
| Every API route starts with `await connection()` (from `next/server`) so it's calculated fresh on each request. | The project has Next.js Cache Components on, where `export const dynamic` isn't allowed; without this, a route could be calculated once at build time and serve stale numbers. | Our call | Our call |
| `scripts/check_app.py` checks the app end to end through its API: 43 checks covering statuses, run-out and order-by dates, flags, stuck totals, item detail and the cleaning report, plus rules that must hold for every item (available = sellable + corrections − promised; order-by = run-out − lead time − cushion; fresh, ZZ and stopped items never get an order status; POs never make the scenario run out earlier; overdue POs never count). It only sends GET requests, so it can also be run against the live site. | Protects the calculations the same way verify.py protects the data, and proves after any live change that nothing else moved. | Our call | Our call |
| The worklist defaults to "Needs action": order now, order soon, and lead time not set. Handled items are hidden there by default but stay in the attention panel with a "Handled" tag. | Dana must act on missing lead times too; an urgent shortage shouldn't disappear just because a note was added. | Our call | Our call |
| Settings page: `expiry_cutoff_months`, `aging_received_days` and `projection_weeks` are editable; the planning date (`today`) is shown read-only. Each change is checked with the same rules as `loadPlanningRules()` (the validation functions are shared, not copied) and saved all-or-nothing in one transaction. A vendor without lead times can get a new row (lead time and cushion both required); an item's reorder choice can be set back to "Follow BlueTide status" (NULL). Fresh and ZZ items aren't listed, because an override can't take effect for them. | Dana can fix rules and lead times herself; the planning date is the assignment's fixed "today" and moving it would shift every date. Every read still validates all settings, so a bad value can't slip through. | Our call | Our call |
| Handled notes: undo sets `cleared_at` and keeps the row. A note's timestamp is the real time it was saved, not the planning date. | A record of what was noted and when it was taken back. | Our call | Our call |
| The interface uses the Kelp and fog palette: deep kelp for structure and the attention panel, sea glass only for interaction and selection, rust red for urgent shortages, amber for uncertain deliveries, moss green only for confirmed positive states. Every colour is paired with a text label and checked for contrast. | A calm, distinct identity suited to seafood purchasing; accents never compete with warning colours, and no colour implies stock is safe based on unconfirmed supply. | Our call | Our call |
| The loader uses the direct database connection; the web app uses the pooled one. | The loader is one long bulk job; the app makes many short requests. | Our call | Our call |
| Python runs in a virtual environment with pinned `requirements.txt`. | Anyone can reproduce the data load exactly. | Our call | Our call |

## 8. Open questions for Dana

- What currency are lot unit costs in?
- Should anything count as "excess" beyond the six-month line and Harbor cost, for example a received-90+-days threshold?
- Should LOB-MEAT and PAN-PORT4 (blank status in BlueTide) be reordered?

## 9. Next steps (out of scope for this version)

- Support more than one distributor: organisation ownership and organisation-aware keys.
- Replace drop-and-rebuild with upserts if data needs history across loads.
- Marco's features: stock check and pricing.
