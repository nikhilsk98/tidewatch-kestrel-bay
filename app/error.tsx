"use client"; // error boundaries must be Client Components

import { useEffect } from "react";
import Link from "next/link";
import { Icon } from "./_components/Icon";

/**
 * Shown when a page fails for a reason other than a bad setting (those get
 * their own message). Covers every page; the sidebar stays usable.
 */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  // Server errors arrive without details (to avoid leaking them), plus an id for the server log.
  const digest = error instanceof Error && "digest" in error ? String(error.digest) : null;

  return (
    <main className="p-4 sm:p-8">
      <div role="alert" className="max-w-2xl rounded-2xl border border-line bg-card p-6 shadow-sm">
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <Icon name="alert" className="size-5 text-rust" />
          This page couldn&apos;t be loaded
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Tidewatch couldn&apos;t read the purchasing data just now. No numbers are shown rather
          than numbers that might be wrong. This is usually a lost database connection; trying
          again often works.
        </p>
        {digest && <p className="mt-2 text-xs text-ink-muted">Error reference: {digest}</p>}
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => retry()}
            className="rounded-full bg-seaglass px-4 py-2 text-sm font-medium text-kelp"
          >
            Try again
          </button>
          <Link href="/settings" className="rounded-full px-4 py-2 text-sm font-medium text-kelp hover:underline">
            Check purchasing settings
          </Link>
        </div>
      </div>
    </main>
  );
}
