// Small outline icons, drawn inline so no icon package is needed.
// Decorative by default: the text next to an icon always carries the meaning.

const paths = {
  cart: "M3 4h2l2.4 10.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 7H6.2M9 20h.01M17 20h.01",
  box: "M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9ZM4 7.5l8 4.5 8-4.5M12 12v9",
  notes: "M7 3h7l4 4v14H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm7 0v4h4M9 12h6M9 16h6",
  sliders: "M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M16 4v4M10 10v4M18 16v4",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm5-2 4 4",
  close: "M6 6l12 12M18 6 6 18",
  alert: "M12 4 2.5 20h19L12 4Zm0 6v4m0 3h.01",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v4l3 2",
  arrow: "M5 12h14m-5-5 5 5-5 5",
} as const;

export type IconName = keyof typeof paths;

export function Icon({
  name,
  className = "size-4",
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
