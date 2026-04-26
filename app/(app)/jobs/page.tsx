import Link from "next/link";
import { Package, Plus } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { TRUCK_PRESETS } from "@/lib/trucks";
import { createJobAction } from "./actions";

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

function formatDate(date: string | null): string {
  if (!date) return "-";
  return new Date(date).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default async function JobsPage() {
  const supabase = createAdminClient();
  const { data: jobs, error } = await supabase
    .from("jobs")
    .select("id, name, client, event_date, status, truck_type, updated_at")
    .order("updated_at", { ascending: false });

  if (error) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="border border-[#dc2626]/30 bg-[#dc2626]/10 text-[#dc2626] rounded-md p-4 text-sm">
          Could not load jobs: {error.message}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
      <div className="flex items-center justify-between mb-4 sm:mb-6 gap-3">
        <div>
          <h1 className="text-base sm:text-lg font-semibold tracking-tight">
            Jobs
          </h1>
          <div className="text-[10px] text-[#9ca3af] mono tracking-wider">
            {(jobs?.length ?? 0).toString().padStart(2, "0")} TOTAL
          </div>
        </div>
        <form action={createJobAction}>
          <button
            type="submit"
            className="flex items-center gap-1.5 text-xs sm:text-sm bg-[#0e3e7a] text-[#ffffff] font-semibold px-3 py-2 rounded hover:bg-[#02aed6] transition min-h-[40px]"
          >
            <Plus size={14} />
            New job
          </button>
        </form>
      </div>

      {jobs && jobs.length > 0 ? (
        <div className="space-y-2">
          {jobs.map((job) => {
            const truck =
              job.truck_type === "custom"
                ? null
                : TRUCK_PRESETS[job.truck_type as "26ft_penske" | "53ft_semi"];
            const statusKey = job.status ?? "draft";
            return (
              <Link
                key={job.id}
                href={`/jobs/${job.id}`}
                className="block bg-[#f8f9fa] border border-[#e6e8eb] rounded-md p-3 sm:p-4 hover:border-[#d1d5db] transition group"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-1">
                      <div className="text-sm font-semibold text-[#272727] truncate">
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
                      <span>{truck?.shortLabel ?? "CUSTOM"}</span>
                      <span>{formatDate(job.event_date)}</span>
                    </div>
                  </div>
                  <div className="text-[10px] text-[#9ca3af] mono tracking-wider whitespace-nowrap">
                    {relativeTime(job.updated_at)}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="border border-dashed border-[#e6e8eb] rounded-md p-10 sm:p-12 text-center">
          <Package size={28} className="mx-auto mb-3 text-[#d1d5db]" />
          <div className="text-sm text-[#5a6370] mb-1">No jobs yet</div>
          <div className="text-xs text-[#9ca3af]">
            Hit{" "}
            <span className="text-[#272727]">New job</span> to plan your first
            load.
          </div>
        </div>
      )}
    </div>
  );
}
