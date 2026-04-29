import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  TRUCK_PRESETS,
  customTruckSpec,
  truckCrossSection,
  type CustomTruckRow,
  type TruckSpec,
} from "@/lib/trucks";
import { fetchAllCases, buildCaseLookup } from "@/lib/cases";
import { hydrateVendorInput, type InputMethod } from "@/lib/vendor-input";
import {
  packVendors,
  type LoadResult,
  type ManualPlacement,
} from "@/lib/load-packer";
import {
  computeVendorPacking,
  computeVendorWeight,
} from "@/lib/packing";
import { buildVendorColorMap } from "@/lib/vendor-colors";
import TruckSVG from "@/components/truck/TruckSVG";
import PrintActions from "@/components/job/PrintActions";

// Print view: a clean, paper-friendly load plan. The crew prints this
// at the loading dock and checks vendors off as they arrive. One page
// per truck.
//
// PDF: there's no @react-pdf/renderer here on purpose. The browser's
// "Save as PDF" via window.print() handles it well, works on every
// platform (including iOS/Android Safari), produces a clean output
// matching exactly what the user sees on screen, and adds zero
// dependencies. The print stylesheet (in this file's <style> block)
// hides the editor chrome and forces a page break per truck.

type PageProps = {
  params: Promise<{ id: string }>;
};

type JobTruckRow = {
  id: string;
  truck_type: "26ft_penske" | "53ft_semi" | "custom";
  custom_truck_id: string | null;
  label: string | null;
  sort_order: number;
};

function parseManualPlacements(raw: unknown): (ManualPlacement | null)[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    if (
      entry &&
      typeof entry === "object" &&
      typeof (entry as { xIn?: unknown }).xIn === "number" &&
      typeof (entry as { yIn?: unknown }).yIn === "number"
    ) {
      return {
        xIn: (entry as { xIn: number }).xIn,
        yIn: (entry as { yIn: number }).yIn,
      };
    }
    return null;
  });
}

function truckSpecFor(
  row: JobTruckRow,
  customs: Map<string, CustomTruckRow>,
): TruckSpec {
  if (row.truck_type === "custom") {
    const ref = row.custom_truck_id ? customs.get(row.custom_truck_id) : null;
    if (!ref) return TRUCK_PRESETS["26ft_penske"];
    return customTruckSpec(ref);
  }
  return TRUCK_PRESETS[row.truck_type];
}

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function JobPrintPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = createAdminClient();

  const [
    { data: job, error: jobErr },
    { data: truckRows },
    { data: vendors },
    cases,
  ] = await Promise.all([
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
    truck_type: r.truck_type as "26ft_penske" | "53ft_semi" | "custom",
    custom_truck_id: r.custom_truck_id,
    label: r.label,
    sort_order: r.sort_order,
  }));

  const customTruckIds = Array.from(
    new Set(
      trucks
        .map((t) => t.custom_truck_id)
        .filter((idVal): idVal is string => idVal !== null),
    ),
  );
  const customTruckById = new Map<string, CustomTruckRow>();
  if (customTruckIds.length > 0) {
    const { data: customRows } = await supabase
      .from("custom_trucks")
      .select(
        "id, label, interior_length_ft, interior_width_ft, interior_height_ft, cubic_feet, cargo_weight_lb, has_liftgate, liftgate_lb",
      )
      .in("id", customTruckIds);
    for (const r of customRows ?? []) {
      customTruckById.set(r.id, {
        id: r.id,
        label: r.label,
        interiorLengthFt: Number(r.interior_length_ft),
        interiorWidthFt: Number(r.interior_width_ft),
        interiorHeightFt: Number(r.interior_height_ft),
        cubicFeet: Number(r.cubic_feet),
        cargoWeightLb: Number(r.cargo_weight_lb),
        hasLiftgate: r.has_liftgate,
        liftgateLb: r.liftgate_lb === null ? null : Number(r.liftgate_lb),
      });
    }
  }

  const caseMap = buildCaseLookup(cases);

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

  // Pack each truck so the visualization matches the editor exactly.
  const packsByTruck = new Map<string, LoadResult>();
  const truckSpecsById = new Map<string, TruckSpec>();
  for (const t of trucks) {
    const spec = truckSpecFor(t, customTruckById);
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
        manualPlacements: parseManualPlacements(v.row.manual_placements),
      })),
      truckCS,
    );
    packsByTruck.set(t.id, load);
  }

  const generatedAt = new Date().toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <>
      <PrintStyles />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 sm:py-6 print-root">
        <div className="flex items-center justify-between mb-4 no-print">
          <Link
            href={`/jobs/${job.id}`}
            className="inline-flex items-center gap-1.5 text-[11px] text-[#9ca3af] hover:text-[#5a6370] transition-colors duration-150 tracking-wider uppercase active:translate-y-[0.5px]"
          >
            <ArrowLeft size={12} />
            Back to editor
          </Link>
          <PrintActions jobId={job.id} />
        </div>

        {/* Job header - prints once at the top of the first page */}
        <header className="border-b-2 border-[#0e3e7a] pb-3 mb-4 print-job-header">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <div>
              <div className="text-[10px] tracking-[0.25em] text-[#9ca3af] uppercase mb-0.5">
                Apache Rental Group · Load Plan
              </div>
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-[#0e3e7a]">
                {job.name}
              </h1>
            </div>
            <div className="text-right text-[10px] mono tracking-wider text-[#5a6370]">
              <div>{generatedAt}</div>
              <div className="text-[#9ca3af]">GENERATED</div>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 mt-2 text-xs">
            <Field label="Client" value={job.client ?? "-"} />
            <Field label="Event" value={formatDate(job.event_date)} />
            <Field label="Status" value={(job.status ?? "draft").toUpperCase()} />
            <Field
              label="Trucks"
              value={trucks.length.toString().padStart(2, "0")}
            />
          </div>
        </header>

        {trucks.length === 0 ? (
          <div className="text-sm text-[#5a6370] italic">
            This job has no trucks.
          </div>
        ) : (
          trucks.map((t, i) => {
            const spec = truckSpecsById.get(t.id)!;
            const load = packsByTruck.get(t.id)!;
            const truckVendors = allHydrated.filter(
              (v) => v.row.job_truck_id === t.id,
            );
            return (
              <TruckSection
                key={t.id}
                truckRow={t}
                index={i}
                total={trucks.length}
                spec={spec}
                load={load}
                vendors={truckVendors}
                isLast={i === trucks.length - 1}
              />
            );
          })
        )}

        <footer className="mt-6 pt-3 border-t border-[#e6e8eb] text-[10px] text-[#9ca3af] mono tracking-wider flex justify-between print-footer">
          <span>{job.name}</span>
          <span>Apache Truck Loader · Triseno Systems</span>
        </footer>
      </div>
    </>
  );
}

type HydratedVendor = {
  row: {
    id: string;
    name: string;
    notes: string | null;
    weight_lb_override: number | null;
  };
  hydrated: ReturnType<typeof hydrateVendorInput>;
  inputMethod: InputMethod;
};

function TruckSection({
  truckRow,
  index,
  total,
  spec,
  load,
  vendors,
  isLast,
}: {
  truckRow: JobTruckRow;
  index: number;
  total: number;
  spec: TruckSpec;
  load: LoadResult;
  vendors: HydratedVendor[];
  isLast: boolean;
}) {
  const lengthFt = load.totalLengthIn / 12;
  const weightLb = load.totalWeightLb;
  const lengthPct = spec.interiorLengthFt > 0 ? lengthFt / spec.interiorLengthFt : 0;
  const weightPct = spec.cargoWeightLb > 0 ? weightLb / spec.cargoWeightLb : 0;
  const overLen = lengthFt > spec.interiorLengthFt;
  const overWt = weightLb > spec.cargoWeightLb;
  const truckTitle =
    truckRow.label?.trim() || `Truck ${index + 1} · ${spec.label}`;
  const vendorColors = buildVendorColorMap(vendors.map((v) => v.row.id));
  const vendorNames = new Map(vendors.map((v) => [v.row.id, v.row.name]));

  return (
    <section
      className={`print-truck-section ${isLast ? "" : "mb-6 print-page-break"}`}
    >
      <div className="border border-[#0e3e7a]/30 rounded-md overflow-hidden mb-3">
        <div className="px-4 py-2 bg-[#0e3e7a]/[0.06] border-b border-[#0e3e7a]/30 flex items-baseline justify-between gap-3">
          <div>
            <div className="text-[10px] tracking-[0.2em] text-[#0e3e7a] uppercase font-semibold">
              Truck {index + 1} of {total}
            </div>
            <div className="text-base font-semibold text-[#0e3e7a]">
              {truckTitle}
            </div>
          </div>
          <div className="text-[10px] mono tracking-wider text-[#5a6370] text-right">
            <div>
              {spec.interiorLengthFt}&apos; × {spec.interiorWidthFt}&apos; ×{" "}
              {spec.interiorHeightFt}&apos;
            </div>
            <div className="text-[#9ca3af]">
              {spec.cubicFeet.toLocaleString()} CU FT ·{" "}
              {spec.cargoWeightLb.toLocaleString()} LB MAX
            </div>
          </div>
        </div>

        <div className="px-3 py-3 bg-white border-b border-[#e6e8eb]">
          <TruckSVG
            truck={spec}
            load={load}
            vendorColors={vendorColors}
            vendorNames={vendorNames}
          />
        </div>

        <div className="grid grid-cols-2 divide-x divide-[#e6e8eb]">
          <CapacityCell
            label="Length"
            value={lengthFt}
            cap={spec.interiorLengthFt}
            unit="FT"
            decimals={1}
            pct={lengthPct}
            over={overLen}
          />
          <CapacityCell
            label="Weight"
            value={weightLb}
            cap={spec.cargoWeightLb}
            unit="LB"
            decimals={0}
            pct={weightPct}
            over={overWt}
          />
        </div>
      </div>

      <VendorTable vendors={vendors} />
    </section>
  );
}

function VendorTable({ vendors }: { vendors: HydratedVendor[] }) {
  if (vendors.length === 0) {
    return (
      <div className="text-xs text-[#9ca3af] italic px-3 py-2">
        No vendors on this truck.
      </div>
    );
  }
  return (
    <table className="w-full text-xs print-vendor-table">
      <thead>
        <tr className="border-b border-[#0e3e7a]/30 text-[10px] tracking-[0.15em] text-[#0e3e7a] uppercase">
          <th className="text-left py-1.5 px-2 w-6">✓</th>
          <th className="text-left py-1.5 px-2">Vendor</th>
          <th className="text-left py-1.5 px-2">Method</th>
          <th className="text-right py-1.5 px-2">Lin Ft</th>
          <th className="text-right py-1.5 px-2">Weight</th>
          <th className="text-left py-1.5 px-2">Notes</th>
        </tr>
      </thead>
      <tbody>
        {vendors.map((v) => {
          const lengthIn = v.hydrated ? computeLinearFt(v) : 0;
          const weightLb = v.hydrated ? computeWeight(v) : 0;
          return (
            <tr
              key={v.row.id}
              className="border-b border-[#e6e8eb] align-top"
            >
              <td className="px-2 py-1.5">
                <span className="inline-block w-3 h-3 border border-[#9ca3af] rounded-sm" />
              </td>
              <td className="px-2 py-1.5 font-medium text-[#272727]">
                {v.row.name}
              </td>
              <td className="px-2 py-1.5 text-[#5a6370] uppercase tracking-wider text-[10px] mono">
                {v.inputMethod}
              </td>
              <td className="px-2 py-1.5 text-right mono tabular-nums text-[#0e3e7a] font-semibold">
                {lengthIn.toFixed(1)}
              </td>
              <td className="px-2 py-1.5 text-right mono tabular-nums">
                {weightLb.toFixed(0)}
              </td>
              <td className="px-2 py-1.5 text-[#5a6370] italic">
                {v.row.notes ?? ""}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function CapacityCell({
  label,
  value,
  cap,
  unit,
  decimals,
  pct,
  over,
}: {
  label: string;
  value: number;
  cap: number;
  unit: string;
  decimals: number;
  pct: number;
  over: boolean;
}) {
  const color = over
    ? "#dc2626"
    : pct > 0.95
      ? "#ff7302"
      : pct > 0.75
        ? "#ffa902"
        : "#0e3e7a";
  return (
    <div className="px-3 py-2">
      <div className="flex items-baseline justify-between mb-1">
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
      <div className="h-1.5 bg-[#f8f9fa] border border-[#e6e8eb] rounded-full overflow-hidden">
        <div
          className="h-full"
          style={{
            width: `${Math.min(100, pct * 100)}%`,
            backgroundColor: color,
          }}
        />
      </div>
      <div className="text-[10px] mono text-[#9ca3af] mt-0.5">
        {(pct * 100).toFixed(0)}% {label === "Length" ? "FULL" : "LOADED"}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] tracking-[0.2em] text-[#9ca3af] uppercase">
        {label}
      </div>
      <div className="text-[#272727] mono tracking-wide">{value}</div>
    </div>
  );
}

// Per-vendor linear-ft + weight match the figures shown in the editor's
// VendorRow. The packer's per-vendor math is width-agnostic for linear/
// cubic/footprint methods, so a generic 8ft cross-section is fine here -
// these numbers are an aid for the loader, not an attempt to re-pack.
function computeLinearFt(v: HydratedVendor): number {
  if (!v.hydrated) return 0;
  return computeVendorPacking(v.hydrated, {
    widthIn: 96,
    heightIn: 100,
  }).linearFt;
}

function computeWeight(v: HydratedVendor): number {
  if (!v.hydrated) return 0;
  return computeVendorWeight(v.hydrated, v.row.weight_lb_override);
}

function PrintStyles() {
  // Inlined here so the print page is self-contained. All print-only
  // rules live behind `@media print` so screen output stays untouched.
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
@media print {
  /* Hide on-screen-only chrome marked .no-print. The auth layout's
     Header + brand strip handle their own print:hidden. */
  .no-print {
    display: none !important;
  }
  body {
    background: #ffffff !important;
  }
  .print-root {
    max-width: 100% !important;
    padding: 0 !important;
  }
  .print-page-break {
    page-break-after: always;
    break-after: page;
  }
  .print-truck-section {
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .print-vendor-table {
    page-break-inside: auto;
  }
  .print-vendor-table tr {
    page-break-inside: avoid;
  }
  .print-footer {
    page-break-before: avoid;
  }
  /* Print-friendly link colors - underline removed inside the load plan
     so the URL hint isn't distracting on paper. */
  a {
    color: inherit !important;
    text-decoration: none !important;
  }
  /* Preserve the colored capacity bars + vendor color chips when
     printing. Browsers default to stripping background colors to save
     ink; this overrides that for our visualization. */
  svg, .print-truck-section {
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }
}

@page {
  size: letter portrait;
  margin: 0.5in;
}
`,
      }}
    />
  );
}
