"use client";

import { useMemo, useState } from "react";
import type { HandledNote } from "@/lib/handled";
import type { ItemPlan } from "@/lib/projection";
import type { StuckLot, StuckSummary } from "@/lib/stuck";
import { AttentionPanel } from "./AttentionPanel";
import { ItemPanel } from "./ItemPanel";
import { PageHeader } from "./PageHeader";
import { StockToClear } from "./StockToClear";
import { SummaryCards } from "./SummaryCards";
import { Worklist } from "./Worklist";
import { DEFAULT_FILTERS, type Filters } from "./worklistView";

type Props = {
  plans: ItemPlan[];
  stuck: { summary: StuckSummary; lots: StuckLot[] };
  handled: HandledNote[];
  planningDate: string;
  stockAsOf: string | null;
  projectionWeeks: number;
  agingReceivedDays: number;
  orderSoonDays: number; // passed from the server: lib/projection.ts can't be imported into the browser
};

/**
 * The Monday screen. Holds the state the sections share: the worklist
 * filters (the header search and the summary cards both change them) and
 * which item's detail panel is open.
 */
export function MondayWorkspace(props: Props) {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [openCode, setOpenCode] = useState<string | null>(null);

  // item code -> its active handled notes, newest first
  const handledByItem = useMemo(() => {
    const byItem = new Map<string, HandledNote[]>();
    for (const note of props.handled) {
      byItem.set(note.itemCode, [...(byItem.get(note.itemCode) ?? []), note]);
    }
    return byItem;
  }, [props.handled]);

  const openPlan = props.plans.find((p) => p.itemCode === openCode) ?? null;

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        planningDate={props.planningDate}
        stockAsOf={props.stockAsOf}
        search={filters.search}
        onSearch={(search) => setFilters({ ...filters, search })}
      />

      <SummaryCards
        plans={props.plans}
        stuckSummary={props.stuck.summary}
        orderSoonDays={props.orderSoonDays}
        risk={filters.risk}
        onRisk={(risk) => setFilters({ ...filters, risk })}
      />

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* On small screens the urgent items come first; on desktop they sit to the right. */}
        <div className="lg:col-span-4 lg:col-start-9 lg:row-start-1">
          <AttentionPanel
            plans={props.plans}
            handledByItem={handledByItem}
            onReview={setOpenCode}
            onShowAll={() => setFilters({ ...DEFAULT_FILTERS, risk: "order now" })}
          />
        </div>
        <div className="min-w-0 lg:col-span-8 lg:col-start-1 lg:row-start-1">
          <Worklist
            plans={props.plans}
            filters={filters}
            onFilters={setFilters}
            handledByItem={handledByItem}
            projectionWeeks={props.projectionWeeks}
            planningDate={props.planningDate}
            onReview={setOpenCode}
          />
        </div>
      </div>

      <StockToClear
        lots={props.stuck.lots}
        summary={props.stuck.summary}
        plans={props.plans}
        agingReceivedDays={props.agingReceivedDays}
        onReview={setOpenCode}
      />

      {openPlan && (
        <ItemPanel
          key={openPlan.itemCode}
          plan={openPlan}
          planningDate={props.planningDate}
          projectionWeeks={props.projectionWeeks}
          onClose={() => setOpenCode(null)}
        />
      )}
    </main>
  );
}
