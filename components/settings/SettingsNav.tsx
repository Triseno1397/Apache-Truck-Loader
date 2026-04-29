"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Layers, Truck } from "lucide-react";

// Segmented nav across settings sections. usePathname drives the active
// state - usePathname is a client hook, so this whole file is a client
// component but it's tiny and renders inside the (server) settings
// layout.

const ITEMS = [
  { href: "/settings/cases", label: "Cases", Icon: Layers },
  { href: "/settings/trucks", label: "Trucks", Icon: Truck },
];

export default function SettingsNav() {
  const pathname = usePathname() ?? "";
  return (
    <div className="flex items-stretch gap-1 mb-4 sm:mb-5 -mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto pb-1">
      {ITEMS.map(({ href, label, Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded border transition-colors duration-150 min-h-[40px] active:translate-y-[0.5px] ${
              active
                ? "bg-[#0e3e7a]/[0.06] border-[#0e3e7a] text-[#0e3e7a]"
                : "bg-[#f8f9fa] border-[#e6e8eb] text-[#5a6370] hover:border-[#d1d5db] hover:bg-[#eff1f4] hover:text-[#272727]"
            }`}
          >
            <Icon size={12} />
            <span className="text-xs font-semibold tracking-tight">{label}</span>
          </Link>
        );
      })}
    </div>
  );
}
