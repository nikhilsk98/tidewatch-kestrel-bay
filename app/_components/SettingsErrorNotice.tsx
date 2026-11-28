import Link from "next/link";
import { Icon } from "./Icon";

/** A business rule is missing or invalid: say which one and where to fix it. */
export function SettingsErrorNotice({ message }: { message: string }) {
  return (
    <main className="p-4 sm:p-8">
      <div
        role="alert"
        className="max-w-2xl rounded-2xl border border-amber-accent/40 bg-amber-bg p-6"
      >
        <h1 className="flex items-center gap-2 text-lg font-semibold text-amber-ink">
          <Icon name="alert" className="size-5 text-amber-accent" />
          Purchasing settings need attention
        </h1>
        <p className="mt-2 text-sm text-amber-ink">{message}</p>
        <p className="mt-2 text-sm text-amber-ink">
          No order dates are calculated until this is fixed, so nothing on
          this screen can be trusted yet.
        </p>
        <Link
          href="/settings"
          className="mt-4 inline-flex rounded-full bg-seaglass px-4 py-2 text-sm font-medium text-kelp"
        >
          Open purchasing settings
        </Link>
      </div>
    </main>
  );
}
