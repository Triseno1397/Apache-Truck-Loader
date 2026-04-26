import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, Check, Package, Plus } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { TRUCK_PRESETS, truckCrossSection } from "@/lib/trucks";
import {
  computeVendorLinearFeet,
  computeVendorWeight,
  effectiveLengthFt,
} from "@/lib/packing";
import { fetchAllCases, buildCaseLookup } from "@/lib/cases";
import {
  hydrateVendorInput,
  type InputMethod,
} from "@/lib/vendor-input";
import JobHeader from "@/components/job/JobHeader";
import VendorRow from "@/components/vendor/VendorRow";
import VendorForm from "@/components/vendor/VendorForm";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ add?: string; edit?: string }>;
};

export default async function JobEditorPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sp = await searchParams;
  const showAdd = sp.add === "1";
  const editId = sp.edit ?? null;

  const supabase = createAdminClient();

  const [{ data: job, error: jobErr }, { data: vendors }, cases] =
    await Promise.all([
      supabase.from("jobs").select("*").eq("id", id).single(),
      supabase
        .from("vendors")
        .select("*")
        .eq("job_id", id)
        .order("created_at", { ascending: true }),
      fetchAllCases(),
    ]);

  if (jobErr || !job) notFound();

  const caseMap = buildCaseLookup(cases);
  const truckSpec =
    job.truck_type === "custom"
      ? null
      : TRUCK_PRESETS[job.truck_type as "26ft_penske" | "53ft_semi"];

  // Custom trucks land in step 9; for now if a job has truck_type='custom'
  // but no rendering surface, fall back to 26ft Penske dimensions for math.
  const truckForMath = truckSpec ?? TRUCK_PRESETS["26ft_penske"];
  const truckCS = truckCrossSection(truckForMath);
  const interiorLengthFt = truckForMath.interiorLengthFt;
  const cargoWeightLb = truckForMath.cargoWeightLb;

  const hydratedVendors = (vendors ?? []).map((v) => {
    const inputMethod = v.input_method as InputMethod;
    const hydrated = hydrateVendorInput({
      inputMethod,
      inputData: v.input_data as unknown,
      stackable: v.stackable,
      cases: caseMap,
    });
    return { row: v, hydrated, inputMethod };
  });

  // Totals
  const totalLinearFt = hydratedVendors.reduce(
    (sum, v) =>
      sum +
      (v.hydrated ? computeVendorLinearFeet(v.hydrated, truckCS) : 0),
    0,
  );
  const totalWeight = hydratedVendors.reduce(
    (sum, v) =>
      sum +
      (v.hydrated
        ? computeVendorWeight(v.hydrated, v.row.weight_lb_override)
        : 0),
    0,
  );

  const effectiveLen = effectiveLengthFt(interiorLengthFt, job.buffer_pct);
  const lengthPct = totalLinearFt / interiorLengthFt;
  const weightPct = totalWeight / cargoWeightLb;
  const overLength = totalLinearFt > interiorLengthFt;
  const overWeight = totalWeight > cargoWeightLb;
  const overEffective = totalLinearFt > effectiveLen;

  const editingVendor = editId
    ? hydratedVendors.find((v) => v.row.id === editId)
    : null;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
      <Link
        href="/jobs"
        className="inline-flex items-center gap-1.5 text-[11px] text-[#9ca3af] hover:text-[#5a6370] transition tracking-wider uppercase mb-3"
      >
        <ArrowLeft size={12} />
        Jobs
      </Link>

      <JobHeader
        jobId={job.id}
        initialName={job.name}
        initialClient={job.client}
        initialEventDate={job.event_date}
        initialTruckType={
          job.truck_type as "26ft_penske" | "53ft_semi" | "custom"
        }
        initialStatus={
          job.status as "draft" | "confirmed" | "loaded" | "archived"
        }
      />

      {/* Capacity summary - full SVG visualization comes in step 6/7 */}
      <div className="border border-[#e6e8eb] bg-[#f8f9fa] rounded-md mb-4 overflow-hidden">
        <div className="px-4 sm:px-5 py-3 border-b border-[#e6e8eb] flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-[#272727]">
              {truckSpec?.label ?? "Custom truck"}
            </div>
            <div className="text-[10px] text-[#9ca3af] mono tracking-wide mt-0.5">
              {truckForMath.interiorLengthFt}' x{" "}
              {truckForMath.interiorWidthFt}' x{" "}
              {truckForMath.interiorHeightFt}' ·{" "}
              {truckForMath.cubicFeet} CU FT ·{" "}
              {truckForMath.cargoWeightLb.toLocaleString()} LB MAX
              {truckForMath.hasLiftgate &&
                ` · ${truckForMath.liftgateLb} LB LIFTGATE`}
            </div>
          </div>
          {(overLength || overWeight) && (
            <div className="flex items-center gap-1.5 text-[#dc2626] bg-[#dc2626]/10 border border-[#dc2626]/30 rounded px-2 py-1 text-[10px] font-semibold tracking-wider">
              <AlertTriangle size={12} />
              OVER CAPACITY
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-[#e6e8eb]">
          <CapacityCell
            label="Length"
            value={totalLinearFt}
            cap={interiorLengthFt}
            unit="FT"
            decimals={1}
            highlight={overLength}
            warning={!overLength && overEffective}
            extraNote={
              overLength
                ? `+${(totalLinearFt - interiorLengthFt).toFixed(1)} FT OVER`
                : overEffective
                  ? `OVER BUFFER (${effectiveLen.toFixed(1)} FT EFFECTIVE)`
                  : null
            }
          />
          <CapacityCell
            label="Weight"
            value={totalWeight}
            cap={cargoWeightLb}
            unit="LB"
            decimals={0}
            highlight={overWeight}
          />
        </div>
      </div>

      {/* Vendor list */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-baseline gap-2">
            <h2 className="text-sm font-semibold tracking-tight">Vendors</h2>
            <span className="text-[10px] text-[#9ca3af] mono tracking-wider">
              {hydratedVendors.length.toString().padStart(2, "0")} LISTED
            </span>
          </div>
          {!showAdd && !editId && (
            <Link
              href={`/jobs/${job.id}?add=1`}
              className="flex items-center gap-1.5 text-xs sm:text-sm bg-[#0e3e7a] text-white font-semibold px-3 py-2 rounded hover:bg-[#02aed6] transition min-h-[40px]"
            >
              <Plus size={14} />
              Add vendor
            </Link>
          )}
        </div>

        {showAdd && (
          <VendorForm jobId={job.id} truck={truckCS} cases={cases} />
        )}

        <div className="space-y-2">
          {hydratedVendors.map((v) =>
            editingVendor && editingVendor.row.id === v.row.id ? (
              <VendorForm
                key={v.row.id}
                jobId={job.id}
                truck={truckCS}
                cases={cases}
                initial={{
                  vendorId: v.row.id,
                  name: v.row.name,
                  inputMethod: v.inputMethod,
                  inputData: (v.row.input_data ?? {}) as Record<
                    string,
                    unknown
                  >,
                  stackable: v.row.stackable,
                  weightOverride: v.row.weight_lb_override,
                  notes: v.row.notes,
                }}
              />
            ) : (
              <VendorRow
                key={v.row.id}
                jobId={job.id}
                vendorId={v.row.id}
                name={v.row.name}
                notes={v.row.notes}
                inputMethod={v.inputMethod}
                hydrated={v.hydrated}
                weightOverride={v.row.weight_lb_override}
                truck={truckCS}
              />
            ),
          )}
        </div>

        {hydratedVendors.length === 0 && !showAdd && (
          <div className="border border-dashed border-[#e6e8eb] rounded-md p-8 sm:p-10 text-center">
            <Package size={24} className="mx-auto mb-2 text-[#d1d5db]" />
            <div className="text-sm text-[#5a6370] mb-1">No vendors yet</div>
            <div className="text-xs text-[#9ca3af]">
              Add the vendors sending gear for this load to see if it fits.
            </div>
          </div>
        )}
      </div>

      {/* Footer status */}
      {hydratedVendors.length > 0 && (
        <div className="bg-[#f8f9fa] border border-[#e6e8eb] rounded-md p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {overLength || overWeight ? (
              <>
                <AlertTriangle size={14} className="text-[#dc2626]" />
                <span className="text-xs text-[#dc2626] font-semibold">
                  Won't fit - need a bigger truck or split the load
                </span>
              </>
            ) : overEffective ? (
              <>
                <AlertTriangle size={14} className="text-[#ff7302]" />
                <span className="text-xs text-[#ff7302]">
                  Over the {job.buffer_pct}% buffer - very tight
                </span>
              </>
            ) : lengthPct > 0.75 ? (
              <>
                <AlertTriangle size={14} className="text-[#ffa902]" />
                <span className="text-xs text-[#ffa902]">
                  Tight - leave room for misc gear
                </span>
              </>
            ) : (
              <>
                <Check size={14} className="text-[#16a34a]" />
                <span className="text-xs text-[#16a34a] font-medium">
                  Fits with room to spare
                </span>
              </>
            )}
          </div>
          <div className="text-[10px] text-[#9ca3af] mono tracking-wider hidden sm:block">
            {Math.max(0, interiorLengthFt - totalLinearFt).toFixed(1)} FT
            REMAINING
          </div>
        </div>
      )}
    </div>
  );
}

function CapacityCell({
  label,
  value,
  cap,
  unit,
  decimals,
  highlight,
  warning,
  extraNote,
}: {
  label: string;
  value: number;
  cap: number;
  unit: string;
  decimals: number;
  highlight?: boolean;
  warning?: boolean;
  extraNote?: string | null;
}) {
  const pct = Math.min(1, value / cap);
  const overPct = value / cap;
  const color = highlight
    ? "#dc2626"
    : warning
      ? "#ff7302"
      : overPct > 0.95
        ? "#ff7302"
        : overPct > 0.75
          ? "#ffa902"
          : "#0e3e7a";

  return (
    <div className="p-4 sm:p-5">
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-[10px] tracking-[0.2em] text-[#9ca3af] uppercase">
          {label}
        </div>
        <div
          className="text-xs mono font-semibold tabular-nums"
          style={{ color }}
        >
          {value.toFixed(decimals)} / {cap.toLocaleString()} {unit}
        </div>
      </div>
      <div className="h-2 bg-white border border-[#e6e8eb] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct * 100}%`, backgroundColor: color }}
        />
      </div>
      <div className="flex items-baseline justify-between mt-1.5">
        <div className="text-[10px] text-[#9ca3af] mono">
          {(overPct * 100).toFixed(0)}%{" "}
          {label === "Length" ? "FULL" : "LOADED"}
        </div>
        {extraNote && (
          <div className="text-[10px] mono" style={{ color }}>
            {extraNote}
          </div>
        )}
      </div>
    </div>
  );
}
