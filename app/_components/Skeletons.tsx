// Grey placeholders shaped like the page, shown while data loads.
// "motion-safe:" keeps them still for anyone who prefers reduced motion.

function Block({ className }: { className: string }) {
  return <div className={`rounded-2xl bg-line/70 motion-safe:animate-pulse ${className}`} />;
}

/** The Monday screen's layout: header, four cards, worklist and attention panel. */
export function WorkspaceSkeleton() {
  return (
    <div role="status" className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
      <span className="sr-only">Loading Monday purchasing…</span>
      <Block className="h-8 w-64" />
      <Block className="mt-2 h-5 w-80 max-w-full" />
      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Block key={i} className="h-32" />
        ))}
      </div>
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
        <Block className="h-72 lg:col-span-4 lg:col-start-9 lg:row-start-1" />
        <Block className="h-[480px] lg:col-span-8 lg:col-start-1 lg:row-start-1" />
      </div>
    </div>
  );
}

/** A plain page: title plus a few content blocks (settings, data notes). */
export function PageSkeleton({ label }: { label: string }) {
  return (
    <div role="status" className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <span className="sr-only">{label}</span>
      <Block className="h-8 w-56" />
      <Block className="mt-2 h-5 w-96 max-w-full" />
      <Block className="mt-6 h-40" />
      <Block className="mt-6 h-72" />
    </div>
  );
}
