import type { Tone } from "@/lib/planLabels";

// Colour always comes with text: a pill is never shown without its label.
const toneClasses: Record<Tone, string> = {
  urgent: "bg-rust-bg text-rust",
  review: "bg-amber-bg text-amber-ink",
  plain: "bg-fog text-ink",
  muted: "bg-fog text-ink-muted",
};

export function Pill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${toneClasses[tone]}`}
    >
      {children}
    </span>
  );
}
