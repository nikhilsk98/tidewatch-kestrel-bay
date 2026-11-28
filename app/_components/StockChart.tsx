"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { addDays, daysBetween } from "@/lib/dates";
import { formatDate, formatQty, unitName } from "@/lib/format";
import type { ItemPlan } from "@/lib/projection";

type Props = { plan: ItemPlan; planningDate: string };

/** "w/e Nov 22": the label of the week that contains `date` (week 0 starts on the planning date). */
function weekLabel(planningDate: string, weekIndex: number): string {
  return `w/e ${formatDate(addDays(planningDate, 7 * weekIndex + 6), "short")}`;
}

/**
 * Sellable stock at the end of each week, both views from the plan:
 * solid = safe view (no PO counted), dashed = if vendor dates hold.
 */
export function StockChart({ plan, planningDate }: Props) {
  const uom = plan.sellUom;
  const weeks = plan.safeWeeklyEndStock.length;
  const weekOf = (date: string) => Math.floor(daysBetween(planningDate, date) / 7);

  const data = plan.safeWeeklyEndStock.map((safe, i) => ({
    week: weekLabel(planningDate, i),
    safe,
    scenario: plan.scenarioWeeklyEndStock[i],
  }));

  // Only future vendor estimates get a marker; an overdue PO never gets an invented date.
  const poMarkers = new Map<string, number>();
  for (const po of plan.incoming) {
    if (!po.countsInScenario || !po.expectedDate) continue;
    const w = weekOf(po.expectedDate);
    if (w < 0 || w >= weeks) continue;
    const label = weekLabel(planningDate, w);
    poMarkers.set(label, (poMarkers.get(label) ?? 0) + po.qty);
  }
  const runOutWeek =
    plan.runOutDate && weekOf(plan.runOutDate) < weeks
      ? weekLabel(planningDate, weekOf(plan.runOutDate))
      : null;

  const summary =
    `Week by week over ${weeks} weeks. Without counting any PO, stock ends the first week at ` +
    `${formatQty(plan.safeWeeklyEndStock[0] ?? 0, uom)} and ` +
    (plan.runOutDate
      ? `runs out on ${formatDate(plan.runOutDate)}. `
      : `does not run out. `) +
    (plan.scenarioRunOutDate
      ? `If vendor dates hold, it runs out on ${formatDate(plan.scenarioRunOutDate)}.`
      : `If vendor dates hold, it does not run out within ${weeks} weeks.`);

  return (
    <figure>
      <div className="h-64 w-full" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 16, right: 12, bottom: 0, left: 4 }}>
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis
              dataKey="week"
              tick={{ fontSize: 11, fill: "var(--ink-muted)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--line)" }}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--ink-muted)" }}
              tickLine={false}
              axisLine={false}
              width={56}
              label={{
                value: unitName(uom),
                angle: -90,
                position: "insideLeft",
                fill: "var(--ink-muted)",
                fontSize: 11,
              }}
            />
            <Tooltip
              formatter={(value, name) => [formatQty(Number(value), uom), name]}
              contentStyle={{ borderRadius: 12, borderColor: "var(--line)", fontSize: 12 }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <ReferenceLine y={0} stroke="var(--ink-muted)" />
            {[...poMarkers].map(([week, qty]) => (
              <ReferenceLine
                key={week}
                x={week}
                stroke="var(--amber-accent)"
                strokeDasharray="2 3"
                label={{ value: `PO ${formatQty(qty, uom)}`, position: "top", fontSize: 10, fill: "var(--amber-ink)" }}
              />
            ))}
            {runOutWeek && (
              <ReferenceLine
                x={runOutWeek}
                stroke="var(--rust)"
                label={{
                  value: `Runs out ${formatDate(plan.runOutDate!, "short")}`,
                  position: "insideTopRight",
                  fontSize: 10,
                  fill: "var(--rust)",
                }}
              />
            )}
            {/* The safe line is drawn last so it stays visible where both views are equal. */}
            <Line
              name="If vendor dates hold"
              dataKey="scenario"
              stroke="var(--amber-accent)"
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={false}
              isAnimationActive={false}
            />
            <Line
              name="Safe view (no PO counted)"
              dataKey="safe"
              stroke="var(--kelp)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-1 text-xs text-ink-muted">
        <span className="sr-only">{summary} </span>
        Sellable stock at the end of each week, in {unitName(uom)}. Red line: projected stockout.
        Dotted amber lines: vendor-estimated PO arrivals (unconfirmed). Overdue POs are not shown
        because they have no arrival date.
      </figcaption>
    </figure>
  );
}
