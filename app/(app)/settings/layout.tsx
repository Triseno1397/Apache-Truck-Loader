import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import SettingsNav from "@/components/settings/SettingsNav";

// Shared chrome for every /settings/* page: a back link to /jobs and a
// segmented sub-nav across the settings sections (Cases / Trucks today;
// Users in Phase 2). Per-page <h1> + body live in each route's page.tsx
// so each section can use its own header copy.

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
      <Link
        href="/jobs"
        className="inline-flex items-center gap-1.5 text-[11px] text-[#9ca3af] hover:text-[#5a6370] transition-colors duration-150 tracking-wider uppercase mb-3 active:translate-y-[0.5px]"
      >
        <ArrowLeft size={12} />
        Jobs
      </Link>

      <SettingsNav />

      {children}
    </div>
  );
}
