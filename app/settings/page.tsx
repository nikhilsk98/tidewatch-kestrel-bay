import { Suspense } from "react";
import { connection } from "next/server";
import { getSettingsPageData } from "@/lib/settingsUpdate";
import { SettingsForm } from "../_components/SettingsForm";

export default function PurchasingSettingsPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">Purchasing settings</h1>
      <p className="mt-0.5 text-ink-muted">
        The rules every order date and stock-to-clear result is calculated from.
      </p>
      <Suspense
        fallback={
          <div role="status" className="mt-6 h-96 rounded-2xl bg-line/70 motion-safe:animate-pulse">
            <span className="sr-only">Loading settings…</span>
          </div>
        }
      >
        <SettingsContent />
      </Suspense>
    </main>
  );
}

async function SettingsContent() {
  await connection(); // always read fresh from the database, never cached
  // Loads even when a setting is invalid: this page is where Dana fixes it.
  const data = await getSettingsPageData();
  return <SettingsForm data={data} />;
}
