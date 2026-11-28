/** A titled block inside the item panel. */
export function PanelSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="mb-2 text-sm font-semibold tracking-wide text-ink-muted uppercase">{title}</h3>
      {children}
    </section>
  );
}
