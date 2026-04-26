"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { TRUCK_PRESETS, type TruckPresetId } from "@/lib/trucks";
import {
  deleteJobAction,
  updateJobAction,
} from "@/app/(app)/jobs/[id]/actions";

type JobTruckType = TruckPresetId | "custom";
type JobStatus = "draft" | "confirmed" | "loaded" | "archived";

type Props = {
  jobId: string;
  initialName: string;
  initialClient: string | null;
  initialEventDate: string | null;
  initialTruckType: JobTruckType;
  initialStatus: JobStatus;
};

const STATUSES: JobStatus[] = ["draft", "confirmed", "loaded", "archived"];

export default function JobHeader({
  jobId,
  initialName,
  initialClient,
  initialEventDate,
  initialTruckType,
  initialStatus,
}: Props) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [client, setClient] = useState(initialClient ?? "");
  const [eventDate, setEventDate] = useState(initialEventDate ?? "");
  const [truckType, setTruckType] = useState<JobTruckType>(initialTruckType);
  const [status, setStatus] = useState<JobStatus>(initialStatus);
  const [saving, startSaving] = useTransition();
  const [savedFlash, setSavedFlash] = useState(false);

  function commit(patch: Parameters<typeof updateJobAction>[1]) {
    startSaving(async () => {
      const result = await updateJobAction(jobId, patch);
      if (result.ok) {
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 1200);
        router.refresh();
      }
    });
  }

  function commitTruck(next: JobTruckType) {
    if (next === truckType) return;
    setTruckType(next);
    commit({ truck_type: next });
  }

  function commitStatus(next: JobStatus) {
    if (next === status) return;
    setStatus(next);
    commit({ status: next });
  }

  function commitName() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === initialName) return;
    commit({ name: trimmed });
  }

  function commitClient() {
    const trimmed = client.trim();
    const next = trimmed === "" ? null : trimmed;
    if ((initialClient ?? "") === (next ?? "")) return;
    commit({ client: next });
  }

  function commitEventDate() {
    const next = eventDate || null;
    if ((initialEventDate ?? "") === (next ?? "")) return;
    commit({ event_date: next });
  }

  function handleDelete(e: React.FormEvent<HTMLFormElement>) {
    if (
      !confirm(
        "Delete this job and all its vendors? This is permanent.",
      )
    ) {
      e.preventDefault();
    }
  }

  return (
    <div className="border border-[#e6e8eb] bg-[#f8f9fa] rounded-md p-4 sm:p-5 mb-4">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
          }}
          placeholder="Untitled job"
          className="flex-1 min-w-0 bg-transparent text-base sm:text-lg font-semibold tracking-tight text-[#272727] focus:outline-none border-b border-transparent hover:border-[#d1d5db] focus:border-[#0e3e7a] transition py-0.5"
        />
        <div className="flex items-center gap-2 flex-shrink-0">
          {saving && (
            <span className="text-[10px] text-[#9ca3af] mono tracking-wider flex items-center gap-1">
              <Loader2 size={10} className="animate-spin" />
              SAVING
            </span>
          )}
          {!saving && savedFlash && (
            <span className="text-[10px] text-[#16a34a] mono tracking-wider">
              SAVED
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
        <div>
          <label className="text-[10px] tracking-[0.2em] text-[#9ca3af] uppercase block mb-1">
            Client
          </label>
          <input
            type="text"
            value={client}
            onChange={(e) => setClient(e.target.value)}
            onBlur={commitClient}
            placeholder="-"
            className="w-full bg-white border border-[#d1d5db] rounded px-2.5 py-1.5 text-sm focus:outline-none focus:border-[#0e3e7a] transition"
          />
        </div>
        <div>
          <label className="text-[10px] tracking-[0.2em] text-[#9ca3af] uppercase block mb-1">
            Event Date
          </label>
          <input
            type="date"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            onBlur={commitEventDate}
            className="w-full bg-white border border-[#d1d5db] rounded px-2.5 py-1.5 text-sm focus:outline-none focus:border-[#0e3e7a] transition mono"
          />
        </div>
        <div>
          <label className="text-[10px] tracking-[0.2em] text-[#9ca3af] uppercase block mb-1">
            Status
          </label>
          <select
            value={status}
            onChange={(e) => commitStatus(e.target.value as JobStatus)}
            className="w-full bg-white border border-[#d1d5db] rounded px-2.5 py-1.5 text-sm focus:outline-none focus:border-[#0e3e7a] transition mono uppercase"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="text-[10px] tracking-[0.2em] text-[#9ca3af] uppercase block mb-1.5">
          Truck
        </label>
        <div className="flex bg-white border border-[#d1d5db] rounded overflow-hidden w-full sm:w-auto">
          {(Object.entries(TRUCK_PRESETS) as Array<[TruckPresetId, (typeof TRUCK_PRESETS)[TruckPresetId]]>).map(
            ([id, t]) => {
              const active = truckType === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => commitTruck(id)}
                  className={`flex-1 px-3 py-2 text-xs font-medium transition min-h-[40px] ${
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

      <div className="mt-4 pt-3 border-t border-[#e6e8eb] flex justify-end">
        <form action={deleteJobAction} onSubmit={handleDelete}>
          <input type="hidden" name="jobId" value={jobId} />
          <button
            type="submit"
            className="text-[11px] text-[#9ca3af] hover:text-[#dc2626] transition tracking-wider uppercase flex items-center gap-1.5"
          >
            <Trash2 size={11} />
            Delete job
          </button>
        </form>
      </div>
    </div>
  );
}
