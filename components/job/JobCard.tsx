"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { deleteJobAction } from "@/app/(app)/jobs/[id]/actions";

// Card on the jobs list. The whole card is clickable (Link) - the
// delete button is a sibling inside a relative wrapper so we don't
// nest <button> inside <a> (invalid HTML). Optimistic delete: hides
// the card immediately and restores it if the server fails, matching
// the VendorRow pattern.

const STATUS_LABELS: Record<string, string> = {
  draft: "DRAFT",
  confirmed: "CONFIRMED",
  loaded: "LOADED",
  archived: "ARCHIVED",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "text-[#5a6370] border-[#d1d5db]",
  confirmed: "text-[#0e3e7a] border-[#0e3e7a]/30",
  loaded: "text-[#16a34a] border-[#16a34a]/30",
  archived: "text-[#9ca3af] border-[#e6e8eb]",
};

type Props = {
  job: {
    id: string;
    name: string;
    client: string | null;
    event_date: string | null;
    status: "draft" | "confirmed" | "loaded" | "archived" | null;
    updated_at: string;
  };
  truckLabel: string;
  formattedDate: string;
  relativeTime: string;
};

export default function JobCard({
  job,
  truckLabel,
  formattedDate,
  relativeTime,
}: Props) {
  const router = useRouter();
  const [hidden, setHidden] = useState(false);
  const [deleting, startDelete] = useTransition();
  const statusKey = job.status ?? "draft";

  function handleDelete() {
    if (
      !confirm(
        `Delete "${job.name}"? This is permanent and removes the job, all its trucks, and all its vendors.`,
      )
    ) {
      return;
    }
    setHidden(true);
    startDelete(async () => {
      const result = await deleteJobAction({ jobId: job.id });
      if (!result.ok) {
        setHidden(false);
        alert(`Couldn't delete job: ${result.error}`);
        return;
      }
      router.refresh();
    });
  }

  if (hidden) return null;

  return (
    <div className="relative group">
      <Link
        href={`/jobs/${job.id}`}
        className="block bg-[#f8f9fa] border border-[#e6e8eb] rounded-md p-3 sm:p-4 pr-12 sm:pr-14 hover:border-[#0e3e7a] hover:bg-[#0e3e7a]/[0.03] transition-colors duration-150 active:translate-y-[0.5px]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 mb-1">
              <div className="text-sm font-semibold text-[#0e3e7a] truncate">
                {job.name}
              </div>
              <span
                className={`text-[9px] mono tracking-wider border rounded px-1.5 py-[1px] ${STATUS_COLORS[statusKey]}`}
              >
                {STATUS_LABELS[statusKey]}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-[#5a6370] mono tracking-wide">
              {job.client && <span>{job.client}</span>}
              <span>{truckLabel}</span>
              <span>{formattedDate}</span>
            </div>
          </div>
          <div className="text-[10px] text-[#9ca3af] mono tracking-wider whitespace-nowrap">
            {relativeTime}
          </div>
        </div>
      </Link>

      {/* Delete button - absolute-positioned sibling so it lives outside
          the Link's clickable area. opacity-0 + group-hover:opacity-100
          keeps the card uncluttered until the user shows intent; on
          touch devices we always show it (sm+) since hover is unreliable. */}
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        title="Delete job"
        className="absolute top-2 right-2 sm:top-3 sm:right-3 text-[#9ca3af] hover:text-[#dc2626] hover:bg-[#dc2626]/10 transition-colors duration-150 p-2 rounded active:translate-y-[0.5px] disabled:opacity-50 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 focus-visible:opacity-100"
      >
        {deleting ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Trash2 size={14} />
        )}
      </button>
    </div>
  );
}
