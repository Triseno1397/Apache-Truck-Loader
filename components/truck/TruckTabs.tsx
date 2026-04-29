"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Plus, RotateCcw, Trash2, Truck } from "lucide-react";
import { TRUCK_PRESETS, type TruckPresetId } from "@/lib/trucks";
import {
  addJobTruckAction,
  clearTruckPlacementsAction,
  deleteJobTruckAction,
  updateJobTruckAction,
} from "@/app/(app)/jobs/[id]/actions";

type JobTruckType = TruckPresetId | "custom";

export type TruckTab = {
  id: string;
  truckType: JobTruckType;
  // Set when truckType === 'custom'; identifies which custom_trucks
  // row drives this tab's dimensions. Null for preset trucks.
  customTruckId: string | null;
  label: string | null;
  vendorCount: number;
  fillPct: number; // 0..1+
  overCapacity: boolean;
};

// Listed in the truck-type picker's Custom dropdown. Just enough to
// label and identify - the actual dimensions are resolved server-side.
export type CustomTruckOption = {
  id: string;
  label: string;
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
  // Optimistic highlight: when the user clicks a tab, mark it active in
  // local state right away. The URL update + server re-render takes a
  // beat - without this the click feels laggy because the highlight
  // doesn't move until the route resolves.
  const [pendingTruckId, setPendingTruckId] = useState<string | null>(null);
  const visibleActiveId = pendingTruckId ?? activeTruckId;
  // Reset the optimistic id once the real prop catches up.
  if (pendingTruckId !== null && pendingTruckId === activeTruckId) {
    // setState in render is fine here - React de-dupes and the next
    // render won't loop.
    setPendingTruckId(null);
  }

  function setActive(truckId: string) {
    if (truckId === visibleActiveId) return;
    setPendingTruckId(truckId);
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("truck", truckId);
    sp.delete("edit"); // close any open vendor editor when switching trucks
    // Belt-and-suspenders scroll preservation: { scroll: false } already
    // tells Next not to scroll on the navigation, but the server re-render
    // that follows can change content height and the browser may snap the
    // viewport. Capture scrollY and restore on the next paint so the user
    // stays put.
    const savedY = window.scrollY;
    router.replace(`/jobs/${jobId}?${sp.toString()}`, { scroll: false });
    requestAnimationFrame(() => {
      if (window.scrollY !== savedY) window.scrollTo(0, savedY);
    });
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
            active={t.id === visibleActiveId}
            onClick={() => setActive(t.id)}
          />
        ))}
        <button
          type="button"
          onClick={handleAdd}
          disabled={adding}
          className="flex-shrink-0 flex items-center gap-1.5 text-xs px-3 py-2 border border-dashed border-[#d1d5db] rounded text-[#5a6370] hover:border-[#0e3e7a] hover:bg-[#0e3e7a]/[0.04] hover:text-[#0e3e7a] transition-colors duration-150 min-h-[44px] active:translate-y-[0.5px] disabled:opacity-50 disabled:cursor-wait"
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
      className={`flex-shrink-0 text-left px-3 py-2 rounded border transition-colors duration-150 min-h-[44px] min-w-[140px] active:translate-y-[0.5px] ${
        active
          ? "bg-[#0e3e7a]/[0.06] border-[#0e3e7a] text-[#0e3e7a]"
          : "bg-[#f8f9fa] border-[#e6e8eb] text-[#5a6370] hover:border-[#d1d5db] hover:bg-[#eff1f4] hover:text-[#272727]"
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
  hasManualPlacements,
  customTrucks,
}: {
  jobId: string;
  truck: TruckTab;
  vendorCount: number;
  totalTruckCount: number;
  // Drives the "Reset placements" affordance. Hidden when no item on
  // this truck has been manually anchored - keeps the chrome clean for
  // pure auto-pack flows.
  hasManualPlacements: boolean;
  // All custom_trucks rows the operator has defined. Used to render the
  // "Custom" picker; if empty, the Custom button becomes a deep link to
  // /settings/trucks instead of doing anything destructive.
  customTrucks: ReadonlyArray<CustomTruckOption>;
}) {
  const router = useRouter();
  const [label, setLabel] = useState(truck.label ?? "");
  const [saving, startSaving] = useTransition();
  const [savedFlash, setSavedFlash] = useState(false);

  function commit(patch: Parameters<typeof updateJobTruckAction>[1]) {
    const savedY = window.scrollY;
    startSaving(async () => {
      const result = await updateJobTruckAction(truck.id, patch);
      if (result.ok) {
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 1200);
        router.refresh();
        // router.refresh() re-streams the server tree; if any of the
        // re-rendered subtrees changes height the browser can snap the
        // viewport. Restore scroll on next paint and one more tick later
        // since the RSC stream can finish slightly after the first frame.
        requestAnimationFrame(() => {
          if (window.scrollY !== savedY) window.scrollTo(0, savedY);
        });
      } else {
        alert(`Couldn't save: ${result.error}`);
      }
    });
  }

  function commitTruckType(next: JobTruckType) {
    if (next === truck.truckType) return;
    if (next === "custom") {
      // Need a custom_truck_id when flipping to custom. Default to the
      // first available; if none exist the UI takes a different code
      // path (link to settings) and never calls this with "custom".
      const first = customTrucks[0];
      if (!first) return;
      commit({ truck_type: "custom", custom_truck_id: first.id });
      return;
    }
    commit({ truck_type: next });
  }

  function commitCustomTruckId(nextId: string) {
    if (nextId === truck.customTruckId) return;
    commit({ truck_type: "custom", custom_truck_id: nextId });
  }

  function commitLabel() {
    const trimmed = label.trim();
    const next = trimmed === "" ? null : trimmed;
    if ((truck.label ?? "") === (next ?? "")) return;
    commit({ label: next });
  }

  const [destructiveBusy, startDestructive] = useTransition();

  function handleDelete() {
    const msg =
      vendorCount > 0
        ? `Delete this truck? Its ${vendorCount} vendor${vendorCount === 1 ? "" : "s"} will be removed too. This is permanent.`
        : "Delete this truck?";
    if (!confirm(msg)) return;
    startDestructive(async () => {
      const result = await deleteJobTruckAction({
        jobTruckId: truck.id,
        jobId,
      });
      if (!result.ok) {
        alert(`Couldn't remove truck: ${result.error}`);
        return;
      }
      // Drop the ?truck= query param so the server picks the next
      // first-by-sort_order truck on re-render. Same as the old
      // redirect, but without the navigation-induced scroll-to-top.
      const sp = new URLSearchParams(window.location.search);
      sp.delete("truck");
      sp.delete("edit");
      const qs = sp.toString();
      router.replace(`/jobs/${jobId}${qs ? `?${qs}` : ""}`, { scroll: false });
      router.refresh();
    });
  }

  function handleResetPlacements() {
    if (
      !confirm(
        "Clear every dragged-into-place item on this truck and let the auto-packer take over?",
      )
    ) {
      return;
    }
    startDestructive(async () => {
      const result = await clearTruckPlacementsAction({
        jobTruckId: truck.id,
        jobId,
      });
      if (!result.ok) {
        alert(`Couldn't reset placements: ${result.error}`);
        return;
      }
      router.refresh();
    });
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                    className={`flex-1 px-2 py-1.5 text-xs font-medium transition-colors duration-150 min-h-[40px] active:translate-y-[0.5px] ${
                      active
                        ? "bg-[#0e3e7a] text-white"
                        : "text-[#5a6370] hover:bg-[#eff1f4] hover:text-[#272727]"
                    }`}
                  >
                    {t.shortLabel}
                  </button>
                );
              },
            )}
            <CustomTypeButton
              active={truck.truckType === "custom"}
              hasOptions={customTrucks.length > 0}
              onActivate={() => commitTruckType("custom")}
            />
          </div>
          {truck.truckType === "custom" && (
            <CustomTruckPicker
              customs={customTrucks}
              currentId={truck.customTruckId}
              onChange={commitCustomTruckId}
            />
          )}
        </div>
      </div>

      {(canDelete || hasManualPlacements) && (
        <div className="mt-3 pt-3 border-t border-[#e6e8eb] flex justify-between items-center gap-3">
          {hasManualPlacements ? (
            <button
              type="button"
              onClick={handleResetPlacements}
              disabled={destructiveBusy}
              className="text-[11px] text-[#5a6370] hover:text-[#0e3e7a] transition-colors duration-150 tracking-wider uppercase flex items-center gap-1.5 active:translate-y-[0.5px] disabled:opacity-50 disabled:cursor-wait"
              title="Discard every drag-anchored position on this truck"
            >
              <RotateCcw size={11} />
              Reset placements
            </button>
          ) : (
            <span />
          )}
          {canDelete && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={destructiveBusy}
              className="text-[11px] text-[#9ca3af] hover:text-[#dc2626] transition-colors duration-150 tracking-wider uppercase flex items-center gap-1.5 active:translate-y-[0.5px] disabled:opacity-50 disabled:cursor-wait"
            >
              <Trash2 size={11} />
              Remove this truck
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Right-most slot in the truck-type segmented control. When the operator
// hasn't defined any custom_trucks rows yet, this becomes a deep link
// to /settings/trucks instead of doing a no-op commit.
function CustomTypeButton({
  active,
  hasOptions,
  onActivate,
}: {
  active: boolean;
  hasOptions: boolean;
  onActivate: () => void;
}) {
  const className = `flex-1 px-2 py-1.5 text-xs font-medium transition-colors duration-150 min-h-[40px] active:translate-y-[0.5px] ${
    active
      ? "bg-[#0e3e7a] text-white"
      : "text-[#5a6370] hover:bg-[#eff1f4] hover:text-[#272727]"
  }`;

  if (!hasOptions && !active) {
    return (
      <Link
        href="/settings/trucks"
        title="Define a custom truck in Settings"
        className={`${className} flex items-center justify-center gap-1`}
      >
        Custom
        <span className="text-[#9ca3af]">+</span>
      </Link>
    );
  }
  return (
    <button type="button" onClick={onActivate} className={className}>
      Custom
    </button>
  );
}

function CustomTruckPicker({
  customs,
  currentId,
  onChange,
}: {
  customs: ReadonlyArray<CustomTruckOption>;
  currentId: string | null;
  onChange: (nextId: string) => void;
}) {
  if (customs.length === 0) {
    return (
      <div className="mt-1.5 text-[11px] text-[#5a6370]">
        No custom trucks defined.{" "}
        <Link
          href="/settings/trucks"
          className="text-[#0e3e7a] hover:text-[#02aed6] underline transition-colors duration-150"
        >
          Add one
        </Link>{" "}
        to use this option.
      </div>
    );
  }
  return (
    <select
      value={currentId ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className="mt-1.5 w-full bg-white border border-[#d1d5db] rounded px-2.5 py-1.5 text-sm focus:outline-none focus:border-[#0e3e7a] transition-colors duration-150"
    >
      {/* Show a placeholder option only if currentId is somehow not in
          the customs list - usually currentId is one of the customs. */}
      {currentId && !customs.some((c) => c.id === currentId) && (
        <option value="" disabled>
          (unknown truck)
        </option>
      )}
      {customs.map((c) => (
        <option key={c.id} value={c.id}>
          {c.label}
        </option>
      ))}
    </select>
  );
}
