import Link from "next/link";
import { Package } from "lucide-react";
import SignOutButton from "@/components/SignOutButton";

export default function Header() {
  return (
    <header className="border-b border-[#1f2328] bg-[#0a0b0d] sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <Link
          href="/jobs"
          className="flex items-center gap-3 min-w-0 hover:opacity-80 transition"
        >
          <div className="w-7 h-7 rounded bg-[#00d4ff] flex items-center justify-center flex-shrink-0">
            <Package size={14} className="text-[#0a0b0d]" />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-sm tracking-tight truncate">
              Apache Truck Loader
            </div>
            <div className="text-[10px] text-[#4a5058] tracking-[0.2em] uppercase">
              v0.1
            </div>
          </div>
        </Link>

        <SignOutButton />
      </div>
    </header>
  );
}
