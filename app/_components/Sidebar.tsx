"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./Icon";

// Links only to things that exist. "Stock to clear" is a section of the Monday page.
const links: { href: string; label: string; icon: IconName; page: string }[] = [
  { href: "/", label: "Monday purchasing", icon: "cart", page: "/" },
  { href: "/#stock-to-clear", label: "Stock to clear", icon: "box", page: "" },
  { href: "/data-notes", label: "Data notes", icon: "notes", page: "/data-notes" },
  { href: "/settings", label: "Purchasing settings", icon: "sliders", page: "/settings" },
];

function Mark() {
  // A simple geometric mark: a tide line inside a rounded square.
  return (
    <svg viewBox="0 0 24 24" className="size-7" aria-hidden="true">
      <rect width="24" height="24" rx="7" fill="var(--kelp)" />
      <path
        d="M5 14c2.3-2.4 4.7-2.4 7 0s4.7 2.4 7 0"
        fill="none"
        stroke="var(--seaglass)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="border-b border-line bg-card lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-60 lg:shrink-0 lg:flex-col lg:border-r lg:border-b-0">
      <div className="flex items-center gap-2.5 px-4 pt-4 pb-3 lg:px-5 lg:pt-6 lg:pb-6">
        <Mark />
        <div>
          <p className="text-[15px] font-semibold leading-tight">Tidewatch</p>
          <p className="text-xs text-ink-muted">Kestrel Bay Seafood</p>
        </div>
      </div>
      <nav aria-label="Main" className="overflow-x-auto px-3 pb-3 lg:px-3">
        <ul className="flex gap-1 lg:flex-col">
          {links.map((link) => {
            const active = link.page === pathname;
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-2.5 whitespace-nowrap rounded-full px-3.5 py-2 text-sm ${
                    active
                      ? "bg-kelp font-medium text-white"
                      : "text-ink-muted hover:bg-fog hover:text-ink"
                  }`}
                >
                  <Icon name={link.icon} />
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
