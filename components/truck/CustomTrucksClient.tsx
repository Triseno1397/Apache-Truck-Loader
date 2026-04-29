"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import {
  createCustomTruckAction,
  deleteCustomTruckAction,
  updateCustomTruckAction,
} from "@/app/(app)/settings/trucks/actions";
import type { CustomTruckRow } from "@/lib/trucks";

type Props = {
  customs: CustomTruckRow[];
};

// Same inline-editor pattern the cases admin uses: a row swaps to a
// CustomTruckEditor when the user clicks Edit, a fresh editor opens at
// the bottom when they click "Add custom truck."

export default function CustomTrucksClient({ customs }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        {!adding && (
          <button
            type="button"
            onClick={() => {
              setAdding(true);
              setEditingId(null);
            }}
            className="flex items-center gap-1.5 text-xs sm:text-sm bg-[#0e3e7a] text-white font-semibold px-3 py-2 rounded hover:bg-[#02aed6] transition-colors duration-150 min-h-[40px] active:translate-y-[0.5px]"
          >
            <Plus size={14} />
            Add custom truck
          </button>
        )}
      </div>

      {adding && (
        <CustomTruckEditor
          mode="create"
          initial={blankTruck()}
          onCancel={() => setAdding(false)}
          onSaved={() => setAdding(false)}
        />
      )}

      {customs.length === 0 && !adding && (
        <div className="border border-dashed border-[#e6e8eb] rounded-md p-8 sm:p-10 text-center">
          <Truck size={24} className="mx-auto mb-2 text-[#d1d5db]" />
          <div className="text-sm text-[#5a6370] mb-1">
            No custom trucks yet
          </div>
          <div className="text-xs text-[#9ca3af]">
            Add a truck whenever the crew rides something other than the two
            stock presets.
          </div>
        </div>
      )}

      {customs.length > 0 && (
        <ul className="space-y-2">
          {customs.map((t) =>
            editingId === t.id ? (
              <CustomTruckEditor
                key={t.id}
                mode="edit"
                initial={t}
                onCancel={() => setEditingId(null)}
                onSaved={() => setEditingId(null)}
              />
            ) : (
              <CustomTruckListRow
                key={t.id}
                row={t}
                onEdit={() => {
                  setEditingId(t.id);
                  setAdding(false);
                }}
              />
            ),
          )}
        </ul>
      )}
    </div>
  );
}

function CustomTruckListRow({
  row,
  onEdit,
}: {
  row: CustomTruckRow;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [hidden, setHidden] = useState(false);
  const [deleting, startDelete] = useTransition();

  function handleDelete() {
    if (
      !confirm(
        `Delete "${row.label}"? This is permanent.`,
      )
    ) {
      return;
    }
    setHidden(true);
    startDelete(async () => {
      const result = await deleteCustomTruckAction({ id: row.id });
      if (!result.ok) {
        setHidden(false);
        // Reference-count failures are expected ("3 job trucks use this
        // truck"), so surface the server's exact message.
        alert(result.error);
        return;
      }
      router.refresh();
    });
  }

  if (hidden) return null;

  return (
    <li className="bg-[#f8f9fa] border border-[#e6e8eb] rounded-md p-3 hover:border-[#d1d5db] hover:bg-[#eff1f4] transition-colors duration-150">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm text-[#272727] font-medium truncate flex items-center gap-1.5">
            <Truck size={13} className="text-[#9ca3af] flex-shrink-0" />
            {row.label}
          </div>
          <div className="text-[10px] text-[#9ca3af] mono tracking-wider mt-0.5 flex flex-wrap gap-x-3">
            <span>
              {row.interiorLengthFt}&apos; × {row.interiorWidthFt}&apos; ×{" "}
              {row.interiorHeightFt}&apos;
            </span>
            <span>{row.cubicFeet.toLocaleString()} CU FT</span>
            <span>{row.cargoWeightLb.toLocaleString()} LB MAX</span>
            {row.hasLiftgate && row.liftgateLb !== null && (
              <span>{row.liftgateLb} LB LIFTGATE</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={onEdit}
            className="text-[#9ca3af] hover:text-[#0e3e7a] p-2 -m-2 transition-colors duration-150 active:translate-y-[0.5px]"
            title="Edit"
          >
            <Pencil size={14} />
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="text-[#9ca3af] hover:text-[#dc2626] p-2 -m-2 transition-colors duration-150 active:translate-y-[0.5px] disabled:opacity-50"
            title="Delete"
          >
            {deleting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Trash2 size={14} />
            )}
          </button>
        </div>
      </div>
    </li>
  );
}

// ----- Editor (shared between create + edit) -----------------------------

type EditorMode = "create" | "edit";

type EditorState = {
  id: string | null;
  label: string;
  lengthFt: string;
  widthFt: string;
  heightFt: string;
  cargoWeightLb: string;
  hasLiftgate: boolean;
  liftgateLb: string;
};

function blankTruck(): EditorState {
  return {
    id: null,
    label: "",
    lengthFt: "",
    widthFt: "",
    heightFt: "",
    cargoWeightLb: "",
    hasLiftgate: false,
    liftgateLb: "",
  };
}

function fromInitial(initial: CustomTruckRow | EditorState): EditorState {
  if ("interiorLengthFt" in initial) {
    return {
      id: initial.id,
      label: initial.label,
      lengthFt: String(initial.interiorLengthFt),
      widthFt: String(initial.interiorWidthFt),
      heightFt: String(initial.interiorHeightFt),
      cargoWeightLb: String(initial.cargoWeightLb),
      hasLiftgate: initial.hasLiftgate,
      liftgateLb:
        initial.liftgateLb === null ? "" : String(initial.liftgateLb),
    };
  }
  return initial;
}

function CustomTruckEditor({
  mode,
  initial,
  onCancel,
  onSaved,
}: {
  mode: EditorMode;
  initial: CustomTruckRow | EditorState;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const [state, setState] = useState<EditorState>(() => fromInitial(initial));
  const [saving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof EditorState>(key: K, value: EditorState[K]) {
    setState((s) => ({ ...s, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const label = state.label.trim();
    if (!label) {
      setError("Name is required");
      return;
    }
    const lengthFt = parseFloat(state.lengthFt);
    const widthFt = parseFloat(state.widthFt);
    const heightFt = parseFloat(state.heightFt);
    const cargoWeightLb = parseFloat(state.cargoWeightLb);
    if (
      !Number.isFinite(lengthFt) ||
      !Number.isFinite(widthFt) ||
      !Number.isFinite(heightFt) ||
      lengthFt <= 0 ||
      widthFt <= 0 ||
      heightFt <= 0
    ) {
      setError("All three interior dimensions must be positive numbers");
      return;
    }
    if (!Number.isFinite(cargoWeightLb) || cargoWeightLb <= 0) {
      setError("Cargo weight capacity must be a positive number");
      return;
    }
    let liftgateLb: number | null = null;
    if (state.hasLiftgate) {
      if (state.liftgateLb.trim() === "") {
        setError("Liftgate weight is required when liftgate is enabled");
        return;
      }
      const parsed = parseFloat(state.liftgateLb);
      if (!Number.isFinite(parsed) || parsed < 0) {
        setError("Liftgate weight must be 0 or a positive number");
        return;
      }
      liftgateLb = parsed;
    }

    const payload = {
      label,
      interiorLengthFt: lengthFt,
      interiorWidthFt: widthFt,
      interiorHeightFt: heightFt,
      cargoWeightLb,
      hasLiftgate: state.hasLiftgate,
      liftgateLb,
    };

    startSave(async () => {
      const result =
        mode === "create"
          ? await createCustomTruckAction(payload)
          : await updateCustomTruckAction({
              id: state.id ?? "",
              patch: payload,
            });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
      onSaved();
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-[#f8f9fa] border border-[#0e3e7a]/30 rounded-md p-4 sm:p-5"
    >
      <div className="flex items-center justify-between mb-4 gap-2">
        <div className="text-[11px] tracking-[0.2em] text-[#5a6370] uppercase font-medium">
          {mode === "create" ? "New custom truck" : "Edit truck"}
        </div>
        {error && (
          <div className="text-[10px] text-[#dc2626] mono tracking-wider truncate">
            {error}
          </div>
        )}
      </div>

      <div className="mb-3">
        <label className="text-[10px] tracking-[0.15em] text-[#9ca3af] uppercase block mb-1.5">
          Name
        </label>
        <input
          type="text"
          value={state.label}
          onChange={(e) => update("label", e.target.value)}
          placeholder="e.g. 16ft box truck, Penske flatbed"
          className="w-full bg-white border border-[#d1d5db] rounded px-3 py-2 text-sm focus:outline-none focus:border-[#0e3e7a] transition-colors duration-150"
          autoFocus
        />
      </div>

      <div className="mb-3">
        <label className="text-[10px] tracking-[0.15em] text-[#9ca3af] uppercase block mb-1.5">
          Interior dimensions (feet)
        </label>
        <div className="grid grid-cols-3 gap-2">
          <NumInput
            placeholder="Length"
            value={state.lengthFt}
            onChange={(v) => update("lengthFt", v)}
          />
          <NumInput
            placeholder="Width"
            value={state.widthFt}
            onChange={(v) => update("widthFt", v)}
          />
          <NumInput
            placeholder="Height"
            value={state.heightFt}
            onChange={(v) => update("heightFt", v)}
          />
        </div>
        <div className="text-[10px] text-[#9ca3af] mt-1">
          Length runs front-to-back. Width and height are usable interior
          (subtract wall thickness if you measured exterior).
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div>
          <label className="text-[10px] tracking-[0.15em] text-[#9ca3af] uppercase block mb-1.5">
            Cargo weight capacity (lb)
          </label>
          <NumInput
            placeholder="e.g. 8000"
            value={state.cargoWeightLb}
            onChange={(v) => update("cargoWeightLb", v)}
          />
        </div>
        <div>
          <label className="text-[10px] tracking-[0.15em] text-[#9ca3af] uppercase block mb-1.5">
            Liftgate
          </label>
          <div className="flex bg-white border border-[#d1d5db] rounded overflow-hidden">
            {([
              { v: false, label: "None" },
              { v: true, label: "Yes" },
            ] as const).map((opt) => {
              const active = state.hasLiftgate === opt.v;
              return (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => update("hasLiftgate", opt.v)}
                  className={`flex-1 px-2.5 py-2 text-xs font-medium transition-colors duration-150 min-h-[40px] active:translate-y-[0.5px] ${
                    active
                      ? "bg-[#0e3e7a] text-white"
                      : "text-[#5a6370] hover:bg-[#eff1f4] hover:text-[#272727]"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {state.hasLiftgate && (
        <div className="mb-3">
          <label className="text-[10px] tracking-[0.15em] text-[#9ca3af] uppercase block mb-1.5">
            Liftgate weight capacity (lb)
          </label>
          <NumInput
            placeholder="e.g. 3000"
            value={state.liftgateLb}
            onChange={(v) => update("liftgateLb", v)}
          />
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#e6e8eb] mt-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="text-[11px] text-[#9ca3af] hover:text-[#5a6370] transition-colors duration-150 tracking-wider uppercase flex items-center gap-1.5 px-2 py-1 active:translate-y-[0.5px] disabled:opacity-50"
        >
          <X size={11} />
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="text-xs bg-[#0e3e7a] text-white font-semibold px-3 py-2 rounded hover:bg-[#02aed6] transition-colors duration-150 min-h-[40px] flex items-center gap-1.5 active:translate-y-[0.5px] disabled:opacity-50 disabled:cursor-wait"
        >
          {saving ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Check size={12} />
          )}
          {mode === "create" ? "Add truck" : "Save"}
        </button>
      </div>
    </form>
  );
}

function NumInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="number"
      step="any"
      inputMode="decimal"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-white border border-[#d1d5db] rounded px-3 py-2 text-sm focus:outline-none focus:border-[#0e3e7a] transition-colors duration-150 mono tabular-nums"
    />
  );
}
