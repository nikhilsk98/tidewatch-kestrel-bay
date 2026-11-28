// Plain-language labels for what the plan already decided.
// Nothing here calculates a status or a date: it only words the fields
// that lib/projection.ts returns, so the screens never invent a result.

import { formatDate, formatDaysFrom, formatQty } from "@/lib/format";
import type { ItemPlan } from "@/lib/projection";

/** How a label is coloured. Every tone is always shown with its text. */
export type Tone = "urgent" | "review" | "plain" | "muted";

export type Label = { label: string; reason: string; tone: Tone };

/** The recommended action for one item, from its safe-view status. */
export function actionFor(plan: ItemPlan, projectionWeeks: number): Label {
  switch (plan.status) {
    case "order now":
      return {
        label: "Order now",
        reason: "Normal delivery would arrive too late",
        tone: "urgent",
      };
    case "order soon":
      return {
        label: `Order by ${formatDate(plan.orderByDate!, "short")}`,
        reason: `Order-by date is ${formatDaysFrom(plan.daysUntilOrderBy!)}`,
        tone: "plain",
      };
    case "lead time not set":
      return {
        label: "Lead time not set",
        reason: "Add this vendor's lead time in Settings to get an order-by date",
        tone: "review",
      };
    case "not reordered":
      return { label: "Not reordered", reason: plan.reorderReason, tone: "muted" };
    case "ok":
      // Never say "OK" on its own: always give the date or the horizon behind it.
      if (plan.orderByDate) {
        return {
          label: `Order by ${formatDate(plan.orderByDate, "short")}`,
          reason: `Not urgent: order-by date is ${formatDaysFrom(plan.daysUntilOrderBy!)}`,
          tone: "muted",
        };
      }
      return {
        label: `No shortage projected within ${projectionWeeks} weeks`,
        reason: "From today's stock, without counting any PO",
        tone: "muted",
      };
  }
}

/** Extra warnings shown under the action. Order matters: most important first. */
export function flagsFor(plan: ItemPlan): Label[] {
  const flags: Label[] = [];
  if (plan.flags.onlyOverdueCover) {
    flags.push({
      label: "Only covered by an overdue PO",
      reason: "Its only incoming PO is overdue, so it isn't counted",
      tone: "review",
    });
  }
  if (plan.flags.dependsOnUnconfirmedDelivery) {
    flags.push({
      label: "Review delivery timing",
      reason: "Covered only if vendor dates hold, and none are confirmed",
      tone: "review",
    });
  }
  // The item_reorder view words this reason; Dana asked to review these items.
  if (plan.reorderReason.startsWith("BlueTide status unclear")) {
    flags.push({
      label: "BlueTide status unclear",
      reason: plan.reorderReason,
      tone: "review",
    });
  }
  if (plan.flags.estimatedDemand) {
    flags.push({
      label: "Forecast partly estimated",
      reason: "Last year's sales stopped during a stockout",
      tone: "plain",
    });
  }
  return flags;
}

/** "Relying on vendor dates": either vendor-date flag is set. */
export function reliesOnVendorDates(plan: ItemPlan): boolean {
  return plan.flags.dependsOnUnconfirmedDelivery || plan.flags.onlyOverdueCover;
}

/** Items Dana has to act on this Monday (the default worklist). */
export function needsAction(plan: ItemPlan): boolean {
  return (
    plan.status === "order now" ||
    plan.status === "order soon" ||
    plan.status === "lead time not set"
  );
}

/** Short sentences explaining the plan, for the item panel's "Why" section. */
export function explainPlan(plan: ItemPlan, projectionWeeks: number): string[] {
  const lines: string[] = [];
  const uom = plan.sellUom;

  if (plan.status === "not reordered") {
    lines.push(
      `Tidewatch doesn't suggest buying this item (${plan.reorderReason}). Its stock and open orders are still shown.`,
    );
  }
  if (plan.availableNow < 0) {
    lines.push(
      `Already short: open orders are ${formatQty(-plan.availableNow, uom)} more than the sellable stock.`,
    );
  }

  if (plan.runOutDate) {
    lines.push(
      `Without counting any PO, stock runs out on ${formatDate(plan.runOutDate)}.`,
    );
  } else {
    lines.push(
      `Without counting any PO, no shortage is projected within ${projectionWeeks} weeks.`,
    );
  }

  if (plan.leadTimeDays === null) {
    lines.push(
      `No lead time is set for ${plan.vendorName}, so there is no order-by date.`,
    );
  } else if (plan.orderByDate && plan.daysUntilOrderBy !== null) {
    const verb = plan.daysUntilOrderBy < 0 ? "had to be placed" : "must be placed";
    lines.push(
      `With ${plan.leadTimeDays} days delivery and ${plan.bufferDays} days cushion, the order ${verb} by ${formatDate(plan.orderByDate)} (${formatDaysFrom(plan.daysUntilOrderBy)}).`,
    );
  }
  if (plan.arrivesIfOrderedToday && plan.status !== "not reordered") {
    const late =
      plan.runOutDate !== null && plan.arrivesIfOrderedToday > plan.runOutDate;
    lines.push(
      `Ordered today, it would arrive about ${formatDate(plan.arrivesIfOrderedToday)}${late ? ", after stock runs out" : ""}.`,
    );
  }

  if (plan.incoming.some((po) => po.countsInScenario)) {
    if (plan.scenarioRunOutDate === null) {
      lines.push(
        `If vendor dates hold, no shortage is projected within ${projectionWeeks} weeks. No vendor date is confirmed.`,
      );
    } else if (plan.scenarioRunOutDate === plan.runOutDate) {
      lines.push(
        `Even if vendor dates hold, it still runs out on ${formatDate(plan.scenarioRunOutDate)}.`,
      );
    } else {
      lines.push(
        `If vendor dates hold, it runs out on ${formatDate(plan.scenarioRunOutDate)} instead. No vendor date is confirmed.`,
      );
    }
  }
  if (plan.flags.onlyOverdueCover) {
    lines.push(
      "Its only incoming PO is overdue. It isn't counted, and no arrival date is assumed.",
    );
  }
  if (plan.flags.estimatedDemand) {
    lines.push(
      "Part of the forecast is estimated: last year shipped nothing in some weeks while out of stock.",
    );
  }
  return lines;
}
