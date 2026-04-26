import Link from "next/link";
import {
  Box,
  FileText,
  Image as ImageIcon,
  Layers,
  Package,
  Ruler,
  Trash2,
} from "lucide-react";
import {
  computeVendorPacking,
  computeVendorWeight,
  type VendorInput,
  type TruckCrossSection,
} from "@/lib/packing";
import { INPUT_METHOD_LABELS, type InputMethod } from "@/lib/vendor-input";
import { deleteVendorAction } from "@/app/(app)/jobs/[id]/actions";
import MoveVendorMenu from "@/components/vendor/MoveVendorMenu";

const ICON_BY_METHOD: Record<InputMethod, typeof Package> = {
  linear: Ruler,
  dimensions: Box,
  pieces: Package,
  cubic: Box,
  footprint: Box,
  pallets: Package,
  image: ImageIcon,
};

type Props = {
  jobId: string;
  vendorId: string;
  name: string;
  notes: string | null;
  inputMethod: InputMethod;
  hydrated: VendorInput | null;
  weightOverride: number | null;
  truck: TruckCrossSection;
  // Other trucks on this job the user can reassign this vendor TO. Empty
  // when the job has only one truck (which hides the move affordance).
  otherTrucks: ReadonlyArray<{ id: string; label: string }>;
};

export default function VendorRow({
  jobId,
  vendorId,
  name,
  notes,
  inputMethod,
  hydrated,
  weightOverride,
  truck,
  otherTrucks,
}: Props) {
  const Icon = ICON_BY_METHOD[inputMethod];
  const packing = hydrated
    ? computeVendorPacking(hydrated, truck)
    : { linearFt: 0, layers: 1, perRow: 0, rows: 0, perCrossSection: 0 };
  const weight = hydrated ? computeVendorWeight(hydrated, weightOverride) : 0;
  const isStacked = packing.layers > 1;
  const explain = (() => {
    if (!hydrated) return "invalid";
    if (packing.rows <= 0) return null;
    const stackBit = packing.layers > 1 ? ` x ${packing.layers} high` : "";
    const rowsBit = `${packing.rows} row${packing.rows > 1 ? "s" : ""}`;
    return `${packing.perRow} across${stackBit} x ${rowsBit}`;
  })();

  return (
    <div className="bg-[#f8f9fa] border border-[#e6e8eb] rounded-md p-3 hover:border-[#d1d5db] transition group">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <Icon size={12} className="text-[#9ca3af] flex-shrink-0" />
            <div className="text-[10px] tracking-[0.15em] text-[#9ca3af] uppercase">
              {INPUT_METHOD_LABELS[inputMethod]}
            </div>
            {isStacked && (
              <div className="flex items-center gap-0.5 text-[9px] tracking-wider text-[#0e3e7a] bg-[#0e3e7a]/10 border border-[#0e3e7a]/20 rounded px-1 py-[1px]">
                <Layers size={8} />
                <span className="mono">x{packing.layers}</span>
              </div>
            )}
          </div>
          <div className="text-[#272727] font-medium text-sm truncate">
            {name}
          </div>
          {explain && (
            <div className="text-[11px] text-[#5a6370] mono mt-0.5">
              {explain}
            </div>
          )}
          {notes && (
            <div className="text-[11px] text-[#5a6370] mt-1 italic truncate">
              {notes}
            </div>
          )}
        </div>

        <div className="flex items-center gap-4 flex-shrink-0">
          <div className="text-right">
            <div className="font-mono text-[#0e3e7a] text-sm font-semibold tabular-nums">
              {packing.linearFt.toFixed(1)}
            </div>
            <div className="text-[9px] text-[#9ca3af] tracking-wider">
              LIN FT
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono text-[#272727] text-sm tabular-nums">
              {weight.toFixed(0)}
            </div>
            <div className="text-[9px] text-[#9ca3af] tracking-wider">LB</div>
          </div>
          <div className="flex gap-1 items-center">
            <Link
              href={`/jobs/${jobId}?edit=${vendorId}`}
              className="text-[#9ca3af] hover:text-[#0e3e7a] p-2 -m-2 transition"
              title="Edit"
            >
              <FileText size={14} />
            </Link>
            <MoveVendorMenu vendorId={vendorId} otherTrucks={otherTrucks} />
            <form action={deleteVendorAction} className="inline">
              <input type="hidden" name="vendorId" value={vendorId} />
              <input type="hidden" name="jobId" value={jobId} />
              <button
                type="submit"
                className="text-[#9ca3af] hover:text-[#dc2626] p-2 -m-2 transition"
                title="Remove"
              >
                <Trash2 size={14} />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
