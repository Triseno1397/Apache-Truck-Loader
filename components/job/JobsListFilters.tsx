"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";

// URL-driven so a refresh, deep-link, or back-button keeps the user
// on the exact list they were looking at. The server reads ?q= and
// ?status= and applies them in the supabase query, so there's no
// client-side filtering happening here at all - this component only
// controls the URL.

export type StatusFilter = "all" | "draft" | "confirmed" | "loaded" | "archived";

const STATUS_CHIPS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "ALL" },
  { id: "draft", label: "DRAFT" },
  { id: "confirmed", label: "CONFIRMED" },
  { id: "loaded", label: "LOADED" },
  { id: "archived", label: "ARCHIVED" },
];

const SEARCH_DEBOUNCE_MS = 250;

type Props = {
  initialQ: string;
  currentStatus: StatusFilter;
};

export default function JobsListFilters({ initialQ, currentStatus }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(initialQ);
  const [pending, startTransition] = useTransition();
  // Skip the first render's debounced URL push - otherwise just landing
  // on the page would replace the URL with the same value and waste a
  // round trip.
  const isFirstRenderRef = useRef(true);

  function pushParams(next: URLSearchParams) {
    const qs = next.toString();
    startTransition(() => {
      router.replace(`/jobs${qs ? `?${qs}` : ""}`, { scroll: false });
    });
  }

  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }
    const timer = setTimeout(() => {
      const sp = new URLSearchParams(searchParams.toString());
      const trimmed = q.trim();
      if (trimmed) sp.set("q", trimmed);
      else sp.delete("q");
      pushParams(sp);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function setStatus(next: StatusFilter) {
    if (next === currentStatus) return;
    const sp = new URLSearchParams(searchParams.toString());
    if (next === "all") sp.delete("status");
    else sp.set("status", next);
    pushParams(sp);
  }

  function clearSearch() {
    setQ("");
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
      <div className="relative flex-1 min-w-0">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9ca3af] pointer-events-none"
        />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, client, notes..."
          className="w-full bg-white border border-[#d1d5db] rounded pl-9 pr-9 py-2 text-sm focus:outline-none focus:border-[#0e3e7a] transition-colors duration-150 min-h-[40px]"
        />
        {q && (
          <button
            type="button"
            onClick={clearSearch}
            title="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[#9ca3af] hover:text-[#272727] transition-colors duration-150 p-1 active:translate-y-[0.5px]"
          >
            {pending ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <X size={12} />
            )}
          </button>
        )}
        {!q && pending && (
          <Loader2
            size={12}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9ca3af] animate-spin"
          />
        )}
      </div>

      <div className="flex items-stretch gap-1 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-shrink-0">
        {STATUS_CHIPS.map((chip) => {
          const active = chip.id === currentStatus;
          return (
            <button
              key={chip.id}
              type="button"
              onClick={() => setStatus(chip.id)}
              className={`flex-shrink-0 px-2.5 py-1.5 rounded border text-[10px] mono tracking-wider transition-colors duration-150 min-h-[36px] active:translate-y-[0.5px] ${
                active
                  ? "bg-[#0e3e7a] border-[#0e3e7a] text-white"
                  : "bg-white border-[#d1d5db] text-[#5a6370] hover:border-[#9ca3af] hover:bg-[#f8f9fa] hover:text-[#272727]"
              }`}
            >
              {chip.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
