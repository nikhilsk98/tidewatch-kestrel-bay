import { Suspense } from "react";
import { connection } from "next/server";
import { getCleaningReport } from "@/lib/cleaned";
import { formatDate } from "@/lib/format";
import { loadPlanningRules, SettingsError } from "@/lib/settings";
import { SettingsErrorNotice } from "../_components/SettingsErrorNotice";
import { PageSkeleton } from "../_components/Skeletons";

export default function DataNotesPage() {
  return (
    <Suspense fallback={<PageSkeleton label="Loading data notes…" />}>
      <DataNotes />
    </Suspense>
  );
}

/** The report, or the settings problem that stops it ("unavailable lots" depends on the planning date). */
async function loadReport() {
  try {
    await loadPlanningRules();
    return { ok: true as const, report: await getCleaningReport() };
  } catch (error) {
    if (error instanceof SettingsError) return { ok: false as const, message: error.message };
    throw error;
  }
}

async function DataNotes() {
  await connection(); // always read fresh from the database, never cached
  const result = await loadReport();
  if (!result.ok) return <SettingsErrorNotice message={result.message} />;
  const { report } = result;

  // Group the notes by the file they came from, keeping the loader's order.
  const byFile = new Map<string, typeof report.notes>();
  for (const note of report.notes) {
    byFile.set(note.sourceFile, [...(byFile.get(note.sourceFile) ?? []), note]);
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">Data notes</h1>
      <p className="mt-0.5 text-ink-muted">
        What was changed, merged or left out when BlueTide&apos;s files were loaded, and why.
      </p>
      <p className="mt-2 text-sm">
        Stock as of {report.stockAsOf ? formatDate(report.stockAsOf) : "unknown"}
        {report.loadedAt && (
          <span className="text-ink-muted">
            {" "}
            · files loaded {formatDate(report.loadedAt.slice(0, 10), "medium")}
          </span>
        )}
      </p>

      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-line bg-card p-5 shadow-sm">
          <h2 className="font-semibold">Sales lines</h2>
          <p className="mt-1 text-sm tabular-nums">
            {report.totals.demandLines.toLocaleString("en-US")} of{" "}
            {report.totals.salesLines.toLocaleString("en-US")} count as demand
          </p>
          <ul className="mt-2 space-y-0.5 text-sm text-ink-muted tabular-nums">
            {report.excludedSales.map((s) => (
              <li key={s.reason ?? "other"}>
                {s.reason ?? "Other"}: {s.lines.toLocaleString("en-US")} lines not counted
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-line bg-card p-5 shadow-sm">
          <h2 className="font-semibold">Lots</h2>
          <p className="mt-1 text-sm tabular-nums">
            {report.totals.sellableLots} of {report.totals.lots} lots count for future sales
          </p>
          <ul className="mt-2 space-y-0.5 text-sm text-ink-muted tabular-nums">
            {report.unavailableLots.map((l) => (
              <li key={l.reason}>
                {l.reason}: {l.lots} {l.lots === 1 ? "lot" : "lots"}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {[...byFile].map(([file, notes]) => (
        <section key={file} className="mt-6 rounded-2xl border border-line bg-card p-5 shadow-sm">
          <h2 className="font-semibold">
            {file} <span className="text-sm font-normal text-ink-muted">· {notes.length} notes</span>
          </h2>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-muted">
                  <th scope="col" className="py-2 pr-3 font-medium">Item</th>
                  <th scope="col" className="py-2 pr-3 font-medium">What was done</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Why</th>
                  <th scope="col" className="py-2 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody>
                {notes.map((n, i) => (
                  <tr key={i} className="border-t border-line align-top">
                    <td className="py-2 pr-3 whitespace-nowrap">{n.itemCode ?? "All items"}</td>
                    <td className="py-2 pr-3 capitalize">{n.action}</td>
                    <td className="py-2 pr-3">{n.reason}</td>
                    <td className="py-2 text-ink-muted">{n.detail ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </main>
  );
}
