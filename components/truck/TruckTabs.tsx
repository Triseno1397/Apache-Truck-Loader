"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Plus, Trash2, Truck } from "lucide-react";
import { TRUCK_PRESETS, type TruckPresetId } from "@/lib/trucks";
import {
  addJobTruckAction,
  deleteJobTruckAction,
  updateJobTruckAction,
} from "@/app/(app)/jobs/[id]/actions";

type JobTruckType = TruckPresetId | "custom";

export type TruckTab = {
  id: string;
  truckType: JobTruckType;
  label: string | null;
  bufferPct: number;
  vendorCount: number;
  fillPct: number; // 0..1+
  overCapacity: boolean;
};

type Props = {
  jobId: string;
  trucks: TruckTab[];
  activeTruckId: string;
};

export default function TruckTabs({ jobId, trucks, activeTruckId }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [adding, startAdding] = useTransition();

  function setActive(truckId: string) {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("truck", truckId);
    sp.delete("edit"); // close any open vendor editor when switching trucks
    router.replace(`/jobs/${jobId}?${sp.toString()}`, { scroll: false });
  }

  function handleAdd() {
    startAdding(async () => {
      const result = await addJobTruckAction(jobId);
      if (result.ok) {
        const sp = new URLSearchParams(searchParams.toString());
        sp.set("truck", result.truckId);
        sp.delete("edit");
        router.replace(`/jobs/${jobId}?${sp.toString()}`, { scroll: false });
        router.refresh();
      } else {
        alert(`Couldn't add truck: ${result.error}`);
      }
    });
  }

  return (
    <div className="mb-3">
      <div className="flex items-stretch gap-1 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-1">
        {trucks.map((t, i) => (
          <TabButton
            key={t.id}
            truck={t}
            index={i}
            active={t.id === activeTruckId}
            onClick={() => setActive(t.id)}
          />
        ))}
        <button
          type="button"
          onClick={handleAdd}
          disabled={adding}
          className="flex-shrink-0 flex items-center gap-1.5 text-xs px-3 py-2 border border-dashed border-[#d1d5db] rounded text-[#5a6370] hover:border-[#0e3e7a] hover:text-[#0e3e7a] transition min-h-[44px] disabled:opacity-50"
          title="Add another truck to this job"
        >
          {adding ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Plus size={12} />
          )}
          <span className="tracking-wider uppercase font-medium">
            Add truck
          </span>
        </button>
      </div>
    </div>
  );
}

function TabButton({
  truck,
  index,
  active,
  onClick,
}: {
  truck: TruckTab;
  index: number;
  active: boolean;
  onClick: () => void;
}) {
  const preset =
    truck.truckType === "custom" ? null : TRUCK_PRESETS[truck.truckType];
  const displayName = truck.label?.trim() || `Truck ${index + 1}`;
  const fillPctText = `${Math.min(999, Math.round(truck.fillPct * 100))}%`;
  const fillColor = truck.overCapacity
    ? "#dc2626"
    : truck.fillPct > 0.95
      ? "#ff7302"
      : truck.fillPct > 0.75
        ? "#ffa902"
        : "#0e3e7a";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-shrink-0 text-left px-3 py-2 rounded border transition min-h-[44px] min-w-[140px] ${
        active
          ? "bg-[#0e3e7a]/[0.06] border-[#0e3e7a] text-[#0e3e7a]"
          : "bg-[#f8f9fa] border-[#e6e8eb] text-[#5a6370] hover:border-[#d1d5db] hover:text-[#272727]"
      }`}
    >
      <div className="flex items-center gap-1.5 mb-0.5">
        <Truck size={11} className={active ? "text-[#0e3e7a]" : "text-[#9ca3af]"} />
        <span className="text-xs font-semibold truncate max-w-[120px]">
          {displayName}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 text-[10px] mono tracking-wider">
        <span className="text-[#9ca3af] uppercase">
          {preset?.shortLabel ?? "CUSTOM"}
        </span>
        <span style={{ color: fillColor }} className="font-semibold tabular-nums">
          {fillPctText}
        </span>
      </div>
    </button>
  );
}

// ----- Settings bar for the ACTIVE truck ---------------------------------
//
// Sits below the tab strip. Lets the user:
//   - rename the truck (label)
//   - switch truck type (26ft / 53ft / custom)
//   - tune buffer_pct
//   - delete the truck (cascades to its vendors; blocked if it's the only one)

export function TruckSettingsBar({
  jobId,
  truck,
  vendorCount,
  totalTruckCount,
}: {
  jobId: string;
  truck: TruckTab;
  vendorCount: number;
  totalTruckCount: number;
}) {
  const router = useRouter();
  const [label, setLabel] = useState(truck.label ?? "");
  const [bufferPct, setBufferPct] = useState(truck.bufferPct);
  const [saving, startSaving] = useTransition();
  const [savedFlash, setSavedFlash] = useState(false);

  function commit(patch: Parameters<typeof updateJobTruckAction>[1]) {
    startSaving(async () => {
      const result = await updateJobTruckAction(truck.id, patch);
      if (result.ok) {
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 1200);
        router.refresh();
      } else {
        alert(`Couldn't save: ${result.error}`);
      }
    });
  }

  function commitTruckType(next: JobTruckType) {
    if (next === truck.truckType) return;
    commit({ truck_type: next });
  }

  function commitLabel() {
    const trimmed = label.trim();
    const next = trimmed === "" ? null : trimmed;
    if ((truck.label ?? "") === (next ?? "")) return;
    commit({ label: next });
  }

  function commitBuffer(next: number) {
    if (next === bufferPct) return;
    setBufferPct(next);
    commit({ buffer_pct: next });
  }

  function handleDeleteSubmit(e: React.FormEvent<HTMLFormElement>) {
    const msg =
      vendorCount > 0
        ? `Delete this truck? Its ${vendorCount} vendor${vendorCount === 1 ? "" : "s"} will be removed too. This is permanent.`
        : "Delete this truck?";
    if (!confirm(msg)) {
      e.preventDefault();
    }
  }

  const canDelete = totalTruckCount > 1;

  return (
    <div className="border border-[#e6e8eb] bg-[#f8f9fa] rounded-md p-3 sm:p-4 mb-3">
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-[10px] tracking-[0.2em] text-[#9ca3af] uppercase">
          Truck Settings
        </div>
        <div className="text-[10px] mono tracking-wider">
          {saving && (
            <span className="text-[#9ca3af] flex items-center gap-1">
              <Loader2 size={10} className="animate-spin" />
              SAVING
            </span>
          )}
          {!saving && savedFlash && (
            <span className="text-[#16a34a]">SAVED</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="text-[10px] tracking-[0.15em] text-[#9ca3af] uppercase block mb-1.5">
            Name
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={commitLabel}
            placeholder="e.g. Stage gear, Truck A"
            className="w-full bg-white border border-[#d1d5db] rounded px-2.5 py-1.5 text-sm focus:outline-none focus:border-[#0e3e7a] transition"
          />
        </div>

        <div>
          <label className="text-[10px] tracking-[0.15em] text-[#9ca3af] uppercase block mb-1.5">
            Truck type
          </label>
          <div className="flex bg-white border border-[#d1d5db] rounded overflow-hidden w-full">
            {(Object.entries(TRUCK_PRESETS) as Array<[TruckPresetId, (typeof TRUCK_PRESETS)[TruckPresetId]]>).map(
              ([id, t]) => {
                const active = truck.truckType === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => commitTruckType(id)}
                    className={`flex-1 px-2 py-1.5 text-xs font-medium transition min-h-[40px] ${
                      active
                        ? "bg-[#0e3e7a] text-white"
                        : "text-[#5a6370] hover:text-[#272727]"
                    }`}
                  >
                    {t.shortLabel}
                  </button>
                );
              },
            )}
          </div>
        </div>

        <div>
          <label className="text-[10px] tracking-[0.15em] text-[#9ca3af] uppercase block mb-1.5 flex items-center justify-between">
            <span>Buffer</span>
            <span className="mono normal-case tracking-wider text-[#5a6370]">
              {bufferPct}%
            </span>
          </label>
          <input
            type="range"
            min="0"
            max="30"
            step="1"
            value={bufferPct}
            onChange={(e) => setBufferPct(parseInt(e.target.value, 10))}
            onMouseUp={(e) =>
              commitBuffer(parseInt((e.target as HTMLInputElement).value, 10))
            }
            onTouchEnd={(e) =>
              commitBuffer(parseInt((e.target as HTMLInputElement).value, 10))
            }
            onKeyUp={(e) =>
              commitBuffer(parseInt((e.target as HTMLInputElement).value, 10))
            }
            className="w-full accent-[#0e3e7a] h-9"
          />
          <div className="text-[9px] text-[#9ca3af] tracking-wider uppercase mt-0.5">
            Reserved space for cables / tie-downs
          </div>
        </div>
      </div>

      {canDelete && (
        <div className="mt-3 pt-3 border-t border-[#e6e8eb] flex justify-end">
          <form action={deleteJobTruckAction} onSubmit={handleDeleteSubmit}>
            <input type="hidden" name="jobTruckId" value={truck.id} />
            <input type="hidden" name="jobId" value={jobId} />
            <button
              type="submit"
              className="text-[11px] text-[#9ca3af] hover:text-[#dc2626] transition tracking-wider uppercase flex items-center gap-1.5"
            >
              <Trash2 size={11} />
              Remove this truck
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
