"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  Image as ImageIcon,
  Layers,
  Loader2,
  Package,
  Pencil,
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
  const router = useRouter();
  // Optimistic delete: hide the row immediately on click so the page
  // feels instant even though the server roundtrip + router.refresh()
  // can take 300-600ms. If the delete fails we surface the row again
  // and alert the user - matches the rest of the app's "act first,
  // recover on error" pattern.
  const [hidden, setHidden] = useState(false);
  const [deleting, startDelete] = useTransition();

  function handleDelete() {
    setHidden(true);
    startDelete(async () => {
      const result = await deleteVendorAction({ vendorId, jobId });
      if (!result.ok) {
        setHidden(false);
        alert(`Couldn't delete vendor: ${result.error}`);
        return;
      }
      router.refresh();
    });
  }

  if (hidden) return null;
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

  // The whole row is now clickable - opens the editor for this vendor.
  // Action buttons inside (move, delete) call e.stopPropagation() so
  // clicking them doesn't also navigate to the editor. Wrapping the
  // row in <Link> would force <a><button></button></a> which is
  // invalid HTML, so we use onClick on the wrapper div with the
  // standard role/tabIndex/keyboard pattern instead.
  function openEditor() {
    const sp = new URLSearchParams(window.location.search);
    sp.set("edit", vendorId);
    router.replace(`/jobs/${jobId}?${sp.toString()}`, { scroll: false });
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={openEditor}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openEditor();
        }
      }}
      className="bg-[#f8f9fa] border border-[#e6e8eb] rounded-md p-3 hover:border-[#0e3e7a] hover:bg-[#0e3e7a]/[0.04] transition-colors duration-150 group cursor-pointer focus:outline-none focus-visible:border-[#0e3e7a] focus-visible:bg-[#0e3e7a]/[0.04] active:translate-y-[0.5px]"
      title="Click to edit"
    >
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
          {/* Action buttons stop propagation so clicking them doesn't
              also fire the row-level openEditor handler. The visible
              "click row to edit" affordance is the cursor + the
              hover state on the whole row plus the small pencil hint. */}
          <div
            className="flex gap-1 items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <Pencil
              size={12}
              className="text-[#9ca3af] group-hover:text-[#0e3e7a] transition-colors duration-150"
              aria-hidden
            />
            <MoveVendorMenu vendorId={vendorId} otherTrucks={otherTrucks} />
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="text-[#9ca3af] hover:text-[#dc2626] p-2 -m-2 transition-colors duration-150 active:translate-y-[0.5px] disabled:opacity-50"
              title="Remove"
            >
              {deleting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Trash2 size={14} />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
