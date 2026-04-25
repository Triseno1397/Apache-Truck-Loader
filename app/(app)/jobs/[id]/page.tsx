import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { TRUCK_PRESETS } from "@/lib/trucks";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function JobEditorPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = createAdminClient();

  const { data: job, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !job) notFound();

  const truck =
    job.truck_type === "custom"
      ? null
      : TRUCK_PRESETS[job.truck_type as "26ft_penske" | "53ft_semi"];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
      <Link
        href="/jobs"
        className="inline-flex items-center gap-1.5 text-[11px] text-[#4a5058] hover:text-[#8a9199] transition tracking-wider uppercase mb-4"
      >
        <ArrowLeft size={12} />
        Jobs
      </Link>

      <div className="mb-4">
        <h1 className="text-lg font-semibold tracking-tight">{job.name}</h1>
        <div className="text-[10px] text-[#4a5058] mono tracking-wider mt-0.5">
          {(truck?.shortLabel ?? "CUSTOM").toUpperCase()} ·{" "}
          {(job.status ?? "draft").toUpperCase()}
        </div>
      </div>

      <div className="border border-dashed border-[#1f2328] rounded-md p-8 text-center">
        <div className="text-sm text-[#8a9199] mb-2">
          Editor scaffolding only
        </div>
        <div className="text-xs text-[#4a5058] leading-relaxed max-w-md mx-auto">
          Vendor inputs, truck visualization, capacity bars, and auto-save
          arrive in the next builds (steps 5-8). For now this page just
          confirms the route + auth gate work.
        </div>
      </div>
    </div>
  );
}
