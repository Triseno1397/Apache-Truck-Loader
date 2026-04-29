"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  RotateCcw,
} from "lucide-react";
import {
  createSnapshotAction,
  restoreSnapshotAction,
} from "@/app/(app)/jobs/[id]/actions";

export type SnapshotSummary = {
  id: string;
  label: string | null;
  createdAt: string;
  truckCount: number;
  vendorCount: number;
};

type Props = {
  jobId: string;
  snapshots: SnapshotSummary[];
};

// Tiny relative-time formatter ("3h ago", "2d ago"). For snapshots
// older than 30 days, falls back to a date string.
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

function fullTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function SnapshotsPanel({ jobId, snapshots }: Props) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [savingForm, setSavingForm] = useState(false);
  const [label, setLabel] = useState("");
  const [saving, startSaving] = useTransition();
  const [savedFlash, setSavedFlash] = useState(false);
  const [restoring, startRestore] = useTransition();
  const [restoringId, setRestoringId] = useState<string | null>(null);

  function commitSave() {
    const trimmed = label.trim();
    startSaving(async () => {
      const result = await createSnapshotAction({
        jobId,
        label: trimmed === "" ? null : trimmed,
      });
      if (result.ok) {
        setLabel("");
        setSavingForm(false);
        setSavedFlash(true);
        setExpanded(true);
        setTimeout(() => setSavedFlash(false), 1500);
        router.refresh();
      } else {
        alert(`Couldn't save snapshot: ${result.error}`);
      }
    });
  }

  function handleRestore(snapshotId: string) {
    if (
      !confirm(
        "Restore this snapshot? The current state will be auto-saved as a new snapshot first so you can return to it.",
      )
    ) {
      return;
    }
    setRestoringId(snapshotId);
    startRestore(async () => {
      const result = await restoreSnapshotAction({ snapshotId, jobId });
      setRestoringId(null);
      if (!result.ok) {
        alert(`Couldn't restore snapshot: ${result.error}`);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="border border-[#e6e8eb] bg-[#f8f9fa] rounded-md mb-4 overflow-hidden">
      {/* Header strip - click to expand the list */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-[#eff1f4] transition text-left"
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown size={14} className="text-[#9ca3af]" />
          ) : (
            <ChevronRight size={14} className="text-[#9ca3af]" />
          )}
          <Camera size={14} className="text-[#0e3e7a]" />
          <span className="text-xs font-semibold tracking-tight text-[#0e3e7a]">
            Snapshots
          </span>
          <span className="text-[10px] text-[#9ca3af] mono tracking-wider">
            {snapshots.length.toString().padStart(2, "0")} SAVED
          </span>
        </div>
        <div className="flex items-center gap-2">
          {saving && (
            <span className="text-[10px] text-[#9ca3af] mono tracking-wider flex items-center gap-1">
              <Loader2 size={10} className="animate-spin" />
              SAVING
            </span>
          )}
          {!saving && savedFlash && (
            <span className="text-[10px] text-[#16a34a] mono tracking-wider flex items-center gap-1">
              <Check size={10} />
              SAVED
            </span>
          )}
          <span
            role="button"
            onClick={(e) => {
              e.stopPropagation();
              setSavingForm((v) => !v);
              setExpanded(true);
            }}
            className="text-[11px] text-[#0e3e7a] hover:text-[#02aed6] transition-colors duration-150 tracking-wider uppercase font-semibold flex items-center gap-1.5 px-2 py-1 rounded hover:bg-[#0e3e7a]/[0.08] active:translate-y-[0.5px]"
          >
            <Camera size={11} />
            Save snapshot
          </span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-[#e6e8eb]">
          {/* Save form (collapsible) */}
          {savingForm && (
            <div className="px-4 py-3 bg-white border-b border-[#e6e8eb] flex items-center gap-2">
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitSave();
                  }
                  if (e.key === "Escape") {
                    setSavingForm(false);
                    setLabel("");
                  }
                }}
                autoFocus
                placeholder='Optional label (e.g. "Final plan", "After Keslow update")'
                className="flex-1 bg-white border border-[#d1d5db] rounded px-3 py-2 text-sm focus:outline-none focus:border-[#0e3e7a] transition"
                disabled={saving}
              />
              <button
                type="button"
                onClick={commitSave}
                disabled={saving}
                className="text-xs bg-[#0e3e7a] text-white font-semibold px-3 py-2 rounded hover:bg-[#02aed6] transition-colors duration-150 min-h-[40px] active:translate-y-[0.5px] disabled:opacity-50 disabled:cursor-wait"
              >
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSavingForm(false);
                  setLabel("");
                }}
                disabled={saving}
                className="text-[11px] text-[#9ca3af] hover:text-[#5a6370] transition tracking-wider uppercase px-2"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Snapshot list */}
          {snapshots.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-[#9ca3af]">
              No snapshots yet. Save one to lock in the current plan as a checkpoint you can return to.
            </div>
          ) : (
            <ul className="divide-y divide-[#e6e8eb]">
              {snapshots.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 bg-white hover:bg-[#f8f9fa] transition"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-[#272727] truncate">
                      {s.label ?? fullTimestamp(s.createdAt)}
                    </div>
                    <div className="text-[10px] text-[#9ca3af] mono tracking-wide flex flex-wrap gap-x-3 mt-0.5">
                      <span title={fullTimestamp(s.createdAt)}>
                        {relativeTime(s.createdAt)}
                      </span>
                      <span>
                        {s.truckCount} TRUCK{s.truckCount === 1 ? "" : "S"}
                      </span>
                      <span>
                        {s.vendorCount} VENDOR{s.vendorCount === 1 ? "" : "S"}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRestore(s.id)}
                    disabled={restoring}
                    className="text-[11px] text-[#5a6370] hover:text-[#0e3e7a] transition-colors duration-150 tracking-wider uppercase font-semibold flex items-center gap-1.5 px-2 py-1 rounded hover:bg-[#0e3e7a]/[0.06] active:translate-y-[0.5px] disabled:opacity-50 disabled:cursor-wait"
                    title="Rewind the live job to this snapshot"
                  >
                    {restoringId === s.id ? (
                      <Loader2 size={11} className="animate-spin" />
                    ) : (
                      <RotateCcw size={11} />
                    )}
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
