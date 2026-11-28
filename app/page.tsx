import { Suspense } from "react";
import { connection } from "next/server";
import { getActiveHandled } from "@/lib/handled";
import { getLoadInfo } from "@/lib/meta";
import { getItemPlans, ORDER_SOON_DAYS } from "@/lib/projection";
import { loadPlanningRules, SettingsError } from "@/lib/settings";
import { getStuckStock } from "@/lib/stuck";
import { MondayWorkspace } from "./_components/MondayWorkspace";
import { SettingsErrorNotice } from "./_components/SettingsErrorNotice";
import { WorkspaceSkeleton } from "./_components/Skeletons";

// The page shell renders at once; the workspace streams in when the data is ready.
export default function MondayPurchasingPage() {
  return (
    <Suspense fallback={<WorkspaceSkeleton />}>
      <Workspace />
    </Suspense>
  );
}

/** Everything the Monday screen shows, or the settings problem that stops it. */
async function loadWorkspace() {
  try {
    // Settings first: if one is missing or invalid, nothing else may run.
    const { settings } = await loadPlanningRules();
    const [plans, stuck, loadInfo, handled] = await Promise.all([
      getItemPlans(),
      getStuckStock(),
      getLoadInfo(),
      getActiveHandled(),
    ]);
    return { ok: true as const, settings, plans, stuck, loadInfo, handled };
  } catch (error) {
    if (error instanceof SettingsError) return { ok: false as const, message: error.message };
    throw error; // anything else goes to the error page
  }
}

async function Workspace() {
  await connection(); // always read fresh from the database, never cached

  const data = await loadWorkspace();
  if (!data.ok) return <SettingsErrorNotice message={data.message} />;
  return (
    <MondayWorkspace
      plans={data.plans}
      stuck={data.stuck}
      handled={data.handled}
      planningDate={data.settings.today}
      stockAsOf={data.loadInfo.snapshotDate}
      projectionWeeks={data.settings.projectionWeeks}
      agingReceivedDays={data.settings.agingReceivedDays}
      orderSoonDays={ORDER_SOON_DAYS}
    />
  );
}
