"use client";

import { Download, Printer } from "lucide-react";

// Two screen-only affordances that drive the print page's exports:
//   - "Print" calls window.print() which opens the browser's native
//     print dialog. The user picks "Save as PDF" or sends to a printer.
//     Same code path on iOS/Android Safari and desktop Chrome/Firefox.
//   - "CSV" is a plain anchor download that hits the export.csv route
//     handler; the browser handles the file save.
//
// No router refresh on either - both are pure client/browser actions.

type Props = {
  jobId: string;
};

export default function PrintActions({ jobId }: Props) {
  return (
    <div className="flex items-center gap-2">
      <a
        href={`/jobs/${jobId}/export.csv`}
        download
        className="text-[11px] text-[#5a6370] hover:text-[#0e3e7a] transition-colors duration-150 tracking-wider uppercase font-medium flex items-center gap-1.5 px-2 py-1 rounded hover:bg-[#0e3e7a]/[0.06] active:translate-y-[0.5px]"
      >
        <Download size={12} />
        CSV
      </a>
      <button
        type="button"
        onClick={() => window.print()}
        className="flex items-center gap-1.5 text-xs sm:text-sm bg-[#0e3e7a] text-white font-semibold px-3 py-2 rounded hover:bg-[#02aed6] transition-colors duration-150 min-h-[40px] active:translate-y-[0.5px]"
      >
        <Printer size={14} />
        Print / Save as PDF
      </button>
    </div>
  );
}
