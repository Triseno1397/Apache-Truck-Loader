import Link from "next/link";
import { Package, Plus, SearchX } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { TRUCK_PRESETS } from "@/lib/trucks";
import { createJobAction } from "./actions";
import JobsListFilters, {
  type StatusFilter,
} from "@/components/job/JobsListFilters";

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

type TruckSummary = { type: "26ft_penske" | "53ft_semi" | "custom" };

// Compact label for the job card. "26ft Box x2" when all the same type;
// otherwise list each ("26ft Box + 53ft Semi"). For 3+ mixed, fall back
// to a count.
function summarizeTrucks(trucks: TruckSummary[]): string {
  if (trucks.length === 0) return "NO TRUCK";
  const counts = new Map<string, number>();
  for (const t of trucks) {
    counts.set(t.type, (counts.get(t.type) ?? 0) + 1);
  }
  const labelOf = (type: string) =>
    type === "custom"
      ? "CUSTOM"
      : (TRUCK_PRESETS[type as "26ft_penske" | "53ft_semi"]?.shortLabel.toUpperCase() ?? "TRUCK");

  if (counts.size === 1) {
    const [type, n] = [...counts.entries()][0];
    return n > 1 ? `${labelOf(type)} ×${n}` : labelOf(type);
  }
  if (trucks.length <= 3) {
    return [...counts.entries()]
      .map(([type, n]) => (n > 1 ? `${labelOf(type)}×${n}` : labelOf(type)))
      .join(" + ");
  }
  return `${trucks.length} TRUCKS`;
}

type PageProps = {
  searchParams: Promise<{ q?: string; status?: string }>;
};

const STATUS_VALUES: ReadonlyArray<StatusFilter> = [
  "all",
  "draft",
  "confirmed",
  "loaded",
  "archived",
];

function normalizeStatus(raw: string | undefined): StatusFilter {
  if (!raw) return "all";
  return STATUS_VALUES.includes(raw as StatusFilter)
    ? (raw as StatusFilter)
    : "all";
}

export default async function JobsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const rawQ = (sp.q ?? "").trim();
  // The supabase .or() filter uses commas + parens as separators; if a
  // user types those into the search box they'd break the query. Strip
  // them - the crew is searching for plain text job names like
  // "Coachella Mainstage", not regex. Also strip % so users can't
  // accidentally inject SQL wildcards into ilike.
  const q = rawQ.replace(/[,()%]/g, " ").trim();
  const statusFilter = normalizeStatus(sp.status);

  const supabase = createAdminClient();
  let query = supabase
    .from("jobs")
    .select("id, name, client, event_date, status, updated_at")
    .order("updated_at", { ascending: false });

  // Status: an explicit chip narrows to that status; "all" hides
  // archived from the default list (per spec - archived jobs are
  // searchable but not in the default view).
  if (statusFilter === "all") {
    query = query.neq("status", "archived");
  } else {
    query = query.eq("status", statusFilter);
  }

  if (q) {
    const wild = `%${q}%`;
    query = query.or(
      `name.ilike.${wild},client.ilike.${wild},notes.ilike.${wild}`,
    );
  }

  const { data: jobs, error } = await query;

  if (error) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="border border-[#dc2626]/30 bg-[#dc2626]/10 text-[#dc2626] rounded-md p-4 text-sm">
          Could not load jobs: {error.message}
        </div>
      </div>
    );
  }

  // Fetch trucks for every visible job in one round-trip so the list page
  // stays a single roundtrip per render.
  const jobIds = (jobs ?? []).map((j) => j.id);
  const trucksByJob = new Map<string, TruckSummary[]>();
  if (jobIds.length > 0) {
    const { data: truckRows } = await supabase
      .from("job_trucks")
      .select("job_id, truck_type, sort_order")
      .in("job_id", jobIds)
      .order("sort_order", { ascending: true });
    for (const row of truckRows ?? []) {
      const arr = trucksByJob.get(row.job_id) ?? [];
      arr.push({ type: row.truck_type as TruckSummary["type"] });
      trucksByJob.set(row.job_id, arr);
    }
  }

  const isFiltered = q !== "" || statusFilter !== "all";
  // The count line reads differently when filtered ("X of Y matching")
  // vs unfiltered ("X total"). Skip the second query when nothing is
  // filtered - the count is just jobs.length in that case.
  let totalCount = jobs?.length ?? 0;
  if (isFiltered) {
    const { count } = await supabase
      .from("jobs")
      .select("id", { count: "exact", head: true });
    totalCount = count ?? 0;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
      <div className="flex items-center justify-between mb-3 sm:mb-4 gap-3">
        <div>
          <h1 className="text-base sm:text-lg font-semibold tracking-tight text-[#0e3e7a]">
            Jobs
          </h1>
          <div className="text-[10px] text-[#9ca3af] mono tracking-wider">
            {isFiltered
              ? `${(jobs?.length ?? 0).toString().padStart(2, "0")} OF ${totalCount.toString().padStart(2, "0")} MATCHING`
              : `${totalCount.toString().padStart(2, "0")} TOTAL`}
          </div>
        </div>
        <form action={createJobAction}>
          <button
            type="submit"
            className="flex items-center gap-1.5 text-xs sm:text-sm bg-[#0e3e7a] text-[#ffffff] font-semibold px-3 py-2 rounded hover:bg-[#02aed6] transition-colors duration-150 min-h-[40px] active:translate-y-[0.5px]"
          >
            <Plus size={14} />
            New job
          </button>
        </form>
      </div>

      <JobsListFilters initialQ={rawQ} currentStatus={statusFilter} />

      {jobs && jobs.length > 0 ? (
        <div className="space-y-2">
          {jobs.map((job) => {
            const truckLabel = summarizeTrucks(trucksByJob.get(job.id) ?? []);
            const statusKey = job.status ?? "draft";
            return (
              <Link
                key={job.id}
                href={`/jobs/${job.id}`}
                className="block bg-[#f8f9fa] border border-[#e6e8eb] rounded-md p-3 sm:p-4 hover:border-[#0e3e7a] hover:bg-[#0e3e7a]/[0.03] transition-colors duration-150 active:translate-y-[0.5px] group"
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
      ) : isFiltered ? (
        <div className="border border-dashed border-[#e6e8eb] rounded-md p-10 sm:p-12 text-center">
          <SearchX size={28} className="mx-auto mb-3 text-[#d1d5db]" />
          <div className="text-sm text-[#5a6370] mb-1">
            No jobs match these filters
          </div>
          <div className="text-xs text-[#9ca3af]">
            Try a different search or clear the status filter.
          </div>
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
