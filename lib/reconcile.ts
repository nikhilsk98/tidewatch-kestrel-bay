// The item panel's stock reconciliation: from BlueTide's on-hand to
// Tidewatch's "available now", one line per step. It only adds up rows that
// /api/items/[code] already returned, then checks the result against the
// plan, so any disagreement is shown instead of hidden.

export type ReconcileInput = {
  lots: { qty: number; unavailableReason: string | null }[];
  corrections: { qty: number }[];
  openOrders: { qty: number }[];
};

export type ReconcileLine = {
  label: string;
  qty: number; // signed: minus lines are negative
  kind: "start" | "step" | "subtotal";
};

export type Reconciliation = {
  lines: ReconcileLine[];
  availableNow: number;
  expected: number; // plan.availableNow
  balances: boolean;
};

// Unavailable groups in a fixed, readable order (reasons come from the lot_status view).
const REASON_ORDER = ["On QA hold", "Damaged", "Expired", "Inside", "Expiry unknown"];
const rank = (reason: string) => {
  const i = REASON_ORDER.findIndex((prefix) => reason.startsWith(prefix));
  return i === -1 ? REASON_ORDER.length : i;
};
const sum = (rows: { qty: number }[]) => rows.reduce((t, r) => t + r.qty, 0);
const TOLERANCE = 0.01; // pounds carry decimals; ignore floating-point crumbs

export function reconcile(input: ReconcileInput, expected: number): Reconciliation {
  const onHand = sum(input.lots);

  // Each unavailable lot has exactly one reason, so it's subtracted once.
  const groups = new Map<string, { qty: number; lots: number }>();
  for (const lot of input.lots) {
    if (!lot.unavailableReason) continue;
    const group = groups.get(lot.unavailableReason) ?? { qty: 0, lots: 0 };
    group.qty += lot.qty;
    group.lots += 1;
    groups.set(lot.unavailableReason, group);
  }
  const unavailable = [...groups.entries()].sort(
    ([a], [b]) => rank(a) - rank(b) || a.localeCompare(b),
  );

  const sellable = onHand - unavailable.reduce((t, [, g]) => t + g.qty, 0);
  const corrections = sum(input.corrections);
  const promised = sum(input.openOrders);
  const availableNow = sellable + corrections - promised;

  const lines: ReconcileLine[] = [
    { label: "On hand (BlueTide, all lots)", qty: onHand, kind: "start" },
    ...unavailable.map(([reason, g]) => ({
      label: `${reason} (${g.lots} ${g.lots === 1 ? "lot" : "lots"})`,
      qty: -g.qty,
      kind: "step" as const,
    })),
    { label: "Sellable", qty: sellable, kind: "subtotal" },
    { label: "Count corrections", qty: corrections, kind: "step" },
    { label: "Promised to customers (open orders)", qty: -promised, kind: "step" },
    { label: "Available now", qty: availableNow, kind: "subtotal" },
  ];

  return {
    lines,
    availableNow,
    expected,
    balances: Math.abs(availableNow - expected) < TOLERANCE,
  };
}
