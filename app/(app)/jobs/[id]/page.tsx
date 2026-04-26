import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, Check, Package, Plus } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { TRUCK_PRESETS, truckCrossSection, type TruckSpec } from "@/lib/trucks";
import { effectiveLengthFt } from "@/lib/packing";
import { fetchAllCases, buildCaseLookup } from "@/lib/cases";
import {
  hydrateVendorInput,
  type InputMethod,
} from "@/lib/vendor-input";
import { packVendors, type LoadResult } from "@/lib/load-packer";
import { createVendorAction } from "./actions";
import JobHeader from "@/components/job/JobHeader";
import TruckTabs, {
  TruckSettingsBar,
  type TruckTab,
} from "@/components/truck/TruckTabs";
import TruckSVG, {
  buildVendorColorMap,
} from "@/components/truck/TruckSVG";
import TruckSideSVG from "@/components/truck/TruckSideSVG";
import TruckViewToggle, {
  type TruckView,
} from "@/components/truck/TruckViewToggle";
import VendorRow from "@/components/vendor/VendorRow";
import VendorForm from "@/components/vendor/VendorForm";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string; truck?: string; view?: string }>;
};

type JobTruckRow = {
  id: string;
  job_id: string;
  truck_type: "26ft_penske" | "53ft_semi" | "custom";
  custom_truck_id: string | null;
  label: string | null;
  buffer_pct: number;
  sort_order: number;
};

function truckSpecFor(row: JobTruckRow): TruckSpec {
  // Custom trucks land in a later step (admin UI to define them is not
  // built yet). For a job_truck row with truck_type='custom', fall back
  // to 26ft Penske dimensions for math so the page still renders.
  if (row.truck_type === "custom") {
    return TRUCK_PRESETS["26ft_penske"];
  }
  return TRUCK_PRESETS[row.truck_type];
}

export default async function JobEditorPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sp = await searchParams;
  const editId = sp.edit ?? null;
  const requestedTruckId = sp.truck ?? null;
  const view: TruckView = sp.view === "side" ? "side" : "top";

  const supabase = createAdminClient();

  const [{ data: job, error: jobErr }, { data: truckRows }, { data: vendors }, cases] =
    await Promise.all([
      supabase.from("jobs").select("*").eq("id", id).single(),
      supabase
        .from("job_trucks")
        .select("*")
        .eq("job_id", id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("vendors")
        .select("*")
        .eq("job_id", id)
        .order("created_at", { ascending: true }),
      fetchAllCases(),
    ]);

  if (jobErr || !job) notFound();

  const trucks: JobTruckRow[] = (truckRows ?? []).map((r) => ({
    id: r.id,
    job_id: r.job_id,
    truck_type: r.truck_type as "26ft_penske" | "53ft_semi" | "custom",
    custom_truck_id: r.custom_truck_id,
    label: r.label,
    buffer_pct: r.buffer_pct,
    sort_order: r.sort_order,
  }));

  // Edge case: a job with zero trucks shouldn't normally exist (createJob
  // seeds one, the migration backfilled one for legacy rows, and the
  // delete action blocks the last one). But render something useful if
  // it ever happens.
  if (trucks.length === 0) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="border border-[#dc2626]/30 bg-[#dc2626]/10 text-[#dc2626] rounded-md p-4 text-sm">
          This job has no trucks. Reload the page or open it from the jobs list.
        </div>
      </div>
    );
  }

  const activeTruck =
    trucks.find((t) => t.id === requestedTruckId) ?? trucks[0];

  const caseMap = buildCaseLookup(cases);

  // Hydrate every vendor (we still need all of them for the roll-up
  // and for filtering by truck). Group them by job_truck_id.
  const allHydrated = (vendors ?? []).map((v) => {
    const inputMethod = v.input_method as InputMethod;
    const hydrated = hydrateVendorInput({
      inputMethod,
      inputData: v.input_data as unknown,
      stackable: v.stackable,
      cases: caseMap,
    });
    return { row: v, hydrated, inputMethod };
  });

  // Pack each truck independently and stash results by truck id.
  const packsByTruck = new Map<string, LoadResult>();
  const truckSpecsById = new Map<string, TruckSpec>();
  let totalLinearFt = 0;
  let totalCapLinearFt = 0;
  let totalWeight = 0;
  let totalCapWeight = 0;
  let anyTruckOverCapacity = false;

  for (const t of trucks) {
    const spec = truckSpecFor(t);
    truckSpecsById.set(t.id, spec);
    const truckCS = truckCrossSection(spec);
    const vendorsForTruck = allHydrated.filter(
      (v) => v.row.job_truck_id === t.id && v.hydrated !== null,
    );
    const load = packVendors(
      vendorsForTruck.map((v) => ({
        id: v.row.id,
        vendorInput: v.hydrated!,
        weightOverride: v.row.weight_lb_override,
        canBeBase: v.row.can_be_base,
      })),
      truckCS,
    );
    packsByTruck.set(t.id, load);

    const lenFt = load.totalLengthIn / 12;
    totalLinearFt += lenFt;
    totalCapLinearFt += spec.interiorLengthFt;
    totalWeight += load.totalWeightLb;
    totalCapWeight += spec.cargoWeightLb;
    if (lenFt > spec.interiorLengthFt || load.totalWeightLb > spec.cargoWeightLb) {
      anyTruckOverCapacity = true;
    }
  }

  // Build the tab descriptors that drive TruckTabs.
  const truckTabs: TruckTab[] = trucks.map((t) => {
    const spec = truckSpecsById.get(t.id)!;
    const load = packsByTruck.get(t.id)!;
    const lenFt = load.totalLengthIn / 12;
    return {
      id: t.id,
      truckType: t.truck_type,
      label: t.label,
      bufferPct: t.buffer_pct,
      vendorCount: allHydrated.filter((v) => v.row.job_truck_id === t.id).length,
      fillPct: spec.interiorLengthFt > 0 ? lenFt / spec.interiorLengthFt : 0,
      overCapacity:
        lenFt > spec.interiorLengthFt ||
        load.totalWeightLb > spec.cargoWeightLb,
    };
  });

  // ----- Active truck context (drives the visualization + vendor list) -----

  const activeSpec = truckSpecsById.get(activeTruck.id)!;
  const activeLoad = packsByTruck.get(activeTruck.id)!;
  const activeTruckCS = truckCrossSection(activeSpec);
  const activeVendors = allHydrated.filter(
    (v) => v.row.job_truck_id === activeTruck.id,
  );
  const vendorColors = buildVendorColorMap(activeVendors.map((v) => v.row.id));
  const vendorNames = new Map(
    activeVendors.map((v) => [v.row.id, v.row.name]),
  );

  const activeLinearFt = activeLoad.totalLengthIn / 12;
  const activeWeight = activeLoad.totalWeightLb;
  const activeEffectiveLen = effectiveLengthFt(
    activeSpec.interiorLengthFt,
    activeTruck.buffer_pct,
  );
  const activeOverLen = activeLinearFt > activeSpec.interiorLengthFt;
  const activeOverWeight = activeWeight > activeSpec.cargoWeightLb;
  const activeOverEff = activeLinearFt > activeEffectiveLen;
  const activeLengthPct =
    activeSpec.interiorLengthFt > 0
      ? activeLinearFt / activeSpec.interiorLengthFt
      : 0;

  const editingVendor = editId
    ? activeVendors.find((v) => v.row.id === editId) ?? null
    : null;

  // Other trucks the user can move a vendor TO (used in VendorRow).
  const otherTrucks = trucks
    .filter((t) => t.id !== activeTruck.id)
    .map((t) => ({
      id: t.id,
      label:
        t.label?.trim() ||
        `Truck ${trucks.findIndex((x) => x.id === t.id) + 1}`,
    }));

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
        initialStatus={
          job.status as "draft" | "confirmed" | "loaded" | "archived"
        }
      />

      {/* Cross-truck roll-up - sits above the tabs so the user always sees
          how the whole load looks regardless of which truck they're on. */}
      {trucks.length > 1 && (
        <RollupSummary
          truckCount={trucks.length}
          totalLinearFt={totalLinearFt}
          totalCapLinearFt={totalCapLinearFt}
          totalWeight={totalWeight}
          totalCapWeight={totalCapWeight}
          anyOver={anyTruckOverCapacity}
        />
      )}

      <TruckTabs
        jobId={job.id}
        trucks={truckTabs}
        activeTruckId={activeTruck.id}
      />

      <TruckSettingsBar
        jobId={job.id}
        truck={truckTabs.find((t) => t.id === activeTruck.id)!}
        vendorCount={activeVendors.length}
        totalTruckCount={trucks.length}
      />

      {/* Active truck capacity panel */}
      <div className="border border-[#0e3e7a]/20 bg-[#f8f9fa] rounded-md mb-4 overflow-hidden">
        <div className="px-4 sm:px-5 py-3 border-b border-[#e6e8eb] bg-[#0e3e7a]/[0.04] flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-[#0e3e7a]">
              {activeSpec.label}
            </div>
            <div className="text-[10px] text-[#9ca3af] mono tracking-wide mt-0.5">
              {activeSpec.interiorLengthFt}' x{" "}
              {activeSpec.interiorWidthFt}' x{" "}
              {activeSpec.interiorHeightFt}' ·{" "}
              {activeSpec.cubicFeet} CU FT ·{" "}
              {activeSpec.cargoWeightLb.toLocaleString()} LB MAX
              {activeSpec.hasLiftgate &&
                ` · ${activeSpec.liftgateLb} LB LIFTGATE`}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <TruckViewToggle jobId={job.id} active={view} />
            {(activeOverLen || activeOverWeight) && (
              <div className="flex items-center gap-1.5 text-[#dc2626] bg-[#dc2626]/10 border border-[#dc2626]/30 rounded px-2 py-1 text-[10px] font-semibold tracking-wider">
                <AlertTriangle size={12} />
                OVER CAPACITY
              </div>
            )}
          </div>
        </div>

        <div className="px-3 sm:px-5 py-3 bg-white border-b border-[#e6e8eb]">
          {view === "side" ? (
            <TruckSideSVG
              truck={activeSpec}
              load={activeLoad}
              vendorColors={vendorColors}
              vendorNames={vendorNames}
            />
          ) : (
            <TruckSVG
              truck={activeSpec}
              load={activeLoad}
              vendorColors={vendorColors}
              vendorNames={vendorNames}
            />
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-[#e6e8eb]">
          <CapacityCell
            label="Length"
            value={activeLinearFt}
            cap={activeSpec.interiorLengthFt}
            unit="FT"
            decimals={1}
            highlight={activeOverLen}
            warning={!activeOverLen && activeOverEff}
            extraNote={
              activeOverLen
                ? `+${(activeLinearFt - activeSpec.interiorLengthFt).toFixed(1)} FT OVER`
                : activeOverEff
                  ? `OVER BUFFER (${activeEffectiveLen.toFixed(1)} FT EFFECTIVE)`
                  : null
            }
          />
          <CapacityCell
            label="Weight"
            value={activeWeight}
            cap={activeSpec.cargoWeightLb}
            unit="LB"
            decimals={0}
            highlight={activeOverWeight}
          />
        </div>
      </div>

      {/* Vendor list (active truck only) */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-baseline gap-2">
            <h2 className="text-sm font-semibold tracking-tight text-[#0e3e7a]">Vendors</h2>
            <span className="text-[10px] text-[#9ca3af] mono tracking-wider">
              {activeVendors.length.toString().padStart(2, "0")} ON THIS TRUCK
            </span>
          </div>
          {!editId && (
            <form action={createVendorAction}>
              <input type="hidden" name="jobId" value={job.id} />
              <input type="hidden" name="jobTruckId" value={activeTruck.id} />
              <button
                type="submit"
                className="flex items-center gap-1.5 text-xs sm:text-sm bg-[#0e3e7a] text-white font-semibold px-3 py-2 rounded hover:bg-[#02aed6] transition min-h-[40px]"
              >
                <Plus size={14} />
                Add vendor
              </button>
            </form>
          )}
        </div>

        <div className="space-y-2">
          {activeVendors.map((v) =>
            editingVendor && editingVendor.row.id === v.row.id ? (
              <VendorForm
                key={v.row.id}
                jobId={job.id}
                truck={activeTruckCS}
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
                  canBeBase: v.row.can_be_base,
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
                truck={activeTruckCS}
                otherTrucks={otherTrucks}
              />
            ),
          )}
        </div>

        {activeVendors.length === 0 && !editId && (
          <div className="border border-dashed border-[#e6e8eb] rounded-md p-8 sm:p-10 text-center">
            <Package size={24} className="mx-auto mb-2 text-[#d1d5db]" />
            <div className="text-sm text-[#5a6370] mb-1">No vendors on this truck yet</div>
            <div className="text-xs text-[#9ca3af]">
              Add the vendors sending gear for this truck to see if it fits.
            </div>
          </div>
        )}
      </div>

      {/* Footer status (per active truck) */}
      {activeVendors.length > 0 && (
        <div className="bg-[#f8f9fa] border border-[#e6e8eb] rounded-md p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {activeOverLen || activeOverWeight ? (
              <>
                <AlertTriangle size={14} className="text-[#dc2626]" />
                <span className="text-xs text-[#dc2626] font-semibold">
                  Won't fit on this truck - need a bigger truck or split the load
                </span>
              </>
            ) : activeOverEff ? (
              <>
                <AlertTriangle size={14} className="text-[#ff7302]" />
                <span className="text-xs text-[#ff7302]">
                  Over the {activeTruck.buffer_pct}% buffer - very tight
                </span>
              </>
            ) : activeLengthPct > 0.75 ? (
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
            {Math.max(0, activeSpec.interiorLengthFt - activeLinearFt).toFixed(1)} FT
            REMAINING
          </div>
        </div>
      )}
    </div>
  );
}

function RollupSummary({
  truckCount,
  totalLinearFt,
  totalCapLinearFt,
  totalWeight,
  totalCapWeight,
  anyOver,
}: {
  truckCount: number;
  totalLinearFt: number;
  totalCapLinearFt: number;
  totalWeight: number;
  totalCapWeight: number;
  anyOver: boolean;
}) {
  const lenPct =
    totalCapLinearFt > 0 ? totalLinearFt / totalCapLinearFt : 0;
  const wtPct = totalCapWeight > 0 ? totalWeight / totalCapWeight : 0;
  return (
    <div className="border border-[#0e3e7a]/30 bg-[#0e3e7a]/[0.04] rounded-md mb-3 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <div className="text-[10px] tracking-[0.2em] text-[#0e3e7a] uppercase font-semibold">
            Whole Load
          </div>
          <div className="text-xs text-[#5a6370] mt-0.5">
            Across {truckCount} trucks
          </div>
        </div>
        <div className="flex items-center gap-5">
          <div className="text-right">
            <div className="text-sm mono font-semibold tabular-nums text-[#272727]">
              {totalLinearFt.toFixed(1)} / {totalCapLinearFt.toFixed(1)} FT
            </div>
            <div className="text-[10px] text-[#9ca3af] mono tracking-wider">
              {(lenPct * 100).toFixed(0)}% LENGTH
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm mono font-semibold tabular-nums text-[#272727]">
              {totalWeight.toFixed(0)} / {totalCapWeight.toLocaleString()} LB
            </div>
            <div className="text-[10px] text-[#9ca3af] mono tracking-wider">
              {(wtPct * 100).toFixed(0)}% WEIGHT
            </div>
          </div>
          {anyOver && (
            <div className="flex items-center gap-1.5 text-[#dc2626] bg-[#dc2626]/10 border border-[#dc2626]/30 rounded px-2 py-1 text-[10px] font-semibold tracking-wider">
              <AlertTriangle size={12} />
              ONE TRUCK OVER
            </div>
          )}
        </div>
      </div>
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
