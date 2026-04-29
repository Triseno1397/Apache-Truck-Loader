import Image from "next/image";
import Link from "next/link";
import { Settings } from "lucide-react";
import SignOutButton from "@/components/SignOutButton";

export default function Header() {
  return (
    <>
      {/* Navy brand strip - thin accent across the very top of every page */}
      <div className="h-1 bg-[#0e3e7a]" />
      <header className="border-b border-[#e6e8eb] bg-[#ffffff] sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <Link
            href="/jobs"
            className="flex items-center gap-3 min-w-0 hover:opacity-80 transition"
          >
            <Image
              src="/apache-logo.png"
              alt="Apache Rental Group"
              width={140}
              height={94}
              priority
              className="h-9 w-auto flex-shrink-0"
            />
            <div className="min-w-0 border-l border-[#e6e8eb] pl-3">
              <div className="font-semibold text-sm tracking-tight text-[#0e3e7a] truncate">
                Truck Loader
              </div>
              <div className="text-[10px] text-[#9ca3af] tracking-[0.2em] uppercase">
                v0.1
              </div>
            </div>
          </Link>

          <div className="flex items-center gap-1">
            <Link
              href="/settings/cases"
              title="Case library"
              className="text-[#9ca3af] hover:text-[#0e3e7a] transition-colors duration-150 p-2 -m-2 active:translate-y-[0.5px]"
            >
              <Settings size={14} />
            </Link>
            <SignOutButton />
          </div>
        </div>
      </header>
    </>
  );
}
