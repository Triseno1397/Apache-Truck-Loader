"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Loader2,
  Package,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  createCustomCaseAction,
  deleteCustomCaseAction,
  updateCustomCaseAction,
} from "@/app/(app)/settings/cases/actions";
import type { CaseCategory } from "@/lib/vendor-input";

export type CaseRow = {
  id: string;
  label: string;
  depthIn: number;
  widthIn: number;
  heightIn: number;
  weightLb: number;
  stackable: boolean;
  maxStack: number;
  isGlobal: boolean;
  category: CaseCategory | null;
};

type Props = {
  orgCases: CaseRow[];
};

// All editing is inline: a row swaps to a CaseEditor when the user clicks
// Edit, and a fresh CaseEditor is appended at the bottom of the list when
// they click "Add custom case." This avoids modals (consistent with the
// rest of the editor) and keeps the user's place on the page.

export default function CaseLibraryClient({ orgCases }: Props) {
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
            Add custom case
          </button>
        )}
      </div>

      {adding && (
        <CaseEditor
          mode="create"
          initial={blankCase()}
          onCancel={() => setAdding(false)}
          onSaved={() => setAdding(false)}
        />
      )}

      {orgCases.length === 0 && !adding && (
        <div className="border border-dashed border-[#e6e8eb] rounded-md p-8 sm:p-10 text-center">
          <Package size={24} className="mx-auto mb-2 text-[#d1d5db]" />
          <div className="text-sm text-[#5a6370] mb-1">
            No custom cases yet
          </div>
          <div className="text-xs text-[#9ca3af]">
            Add the gear cases your crew owns so they auto-fill in vendor
            entries.
          </div>
        </div>
      )}

      {orgCases.length > 0 && (
        <ul className="space-y-2">
          {orgCases.map((c) =>
            editingId === c.id ? (
              <CaseEditor
                key={c.id}
                mode="edit"
                initial={c}
                onCancel={() => setEditingId(null)}
                onSaved={() => setEditingId(null)}
              />
            ) : (
              <CaseListRow
                key={c.id}
                row={c}
                onEdit={() => {
                  setEditingId(c.id);
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

function CaseListRow({
  row,
  onEdit,
}: {
  row: CaseRow;
  onEdit: () => void;
}) {
  const router = useRouter();
  // Optimistic delete - hide the row immediately, restore if the
  // server fails (matches VendorRow's pattern).
  const [hidden, setHidden] = useState(false);
  const [deleting, startDelete] = useTransition();

  function handleDelete() {
    if (
      !confirm(
        `Delete "${row.label}"? Vendors using this case will need to re-pick a case. This is permanent.`,
      )
    ) {
      return;
    }
    setHidden(true);
    startDelete(async () => {
      const result = await deleteCustomCaseAction({ id: row.id });
      if (!result.ok) {
        setHidden(false);
        alert(`Couldn't delete case: ${result.error}`);
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
            <Package size={13} className="text-[#9ca3af] flex-shrink-0" />
            {row.label}
          </div>
          <div className="text-[10px] text-[#9ca3af] mono tracking-wider mt-0.5 flex flex-wrap gap-x-3">
            <span>
              {row.depthIn}&quot; × {row.widthIn}&quot; × {row.heightIn}&quot;
            </span>
            <span>{row.weightLb} LB</span>
            <span>
              {row.stackable ? `STACKS ×${row.maxStack}` : "NO STACK"}
            </span>
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
  depthIn: string;
  widthIn: string;
  heightIn: string;
  weightLb: string;
  stackable: boolean;
  maxStack: string;
};

function blankCase(): EditorState {
  return {
    id: null,
    label: "",
    depthIn: "",
    widthIn: "",
    heightIn: "",
    weightLb: "",
    stackable: true,
    maxStack: "1",
  };
}

function CaseEditor({
  mode,
  initial,
  onCancel,
  onSaved,
}: {
  mode: EditorMode;
  initial: CaseRow | EditorState;
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
    const depthIn = parseFloat(state.depthIn);
    const widthIn = parseFloat(state.widthIn);
    const heightIn = parseFloat(state.heightIn);
    const weightLb = state.weightLb.trim() === "" ? 0 : parseFloat(state.weightLb);
    const maxStack = parseInt(state.maxStack, 10);
    if (
      !Number.isFinite(depthIn) ||
      !Number.isFinite(widthIn) ||
      !Number.isFinite(heightIn) ||
      depthIn <= 0 ||
      widthIn <= 0 ||
      heightIn <= 0
    ) {
      setError("All three dimensions must be positive numbers");
      return;
    }
    if (!Number.isFinite(weightLb) || weightLb < 0) {
      setError("Weight must be 0 or a positive number");
      return;
    }
    if (!Number.isFinite(maxStack) || maxStack < 1) {
      setError("Max stack must be 1 or higher");
      return;
    }

    const payload = {
      label,
      depthIn,
      widthIn,
      heightIn,
      weightLb,
      stackable: state.stackable,
      // If a case isn't stackable, max_stack is meaningless - clamp
      // to 1 so the row in the DB stays consistent.
      maxStack: state.stackable ? maxStack : 1,
    };

    startSave(async () => {
      const result =
        mode === "create"
          ? await createCustomCaseAction(payload)
          : await updateCustomCaseAction({ id: state.id ?? "", patch: payload });
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
          {mode === "create" ? "New custom case" : "Edit case"}
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
          placeholder='e.g. Keslow Alexa 35 camera case'
          className="w-full bg-white border border-[#d1d5db] rounded px-3 py-2 text-sm focus:outline-none focus:border-[#0e3e7a] transition-colors duration-150"
          autoFocus
        />
      </div>

      <div className="mb-3">
        <label className="text-[10px] tracking-[0.15em] text-[#9ca3af] uppercase block mb-1.5">
          Dimensions (inches)
        </label>
        <div className="grid grid-cols-3 gap-2">
          <DimInput
            placeholder="Length"
            value={state.depthIn}
            onChange={(v) => update("depthIn", v)}
          />
          <DimInput
            placeholder="Width"
            value={state.widthIn}
            onChange={(v) => update("widthIn", v)}
          />
          <DimInput
            placeholder="Height"
            value={state.heightIn}
            onChange={(v) => update("heightIn", v)}
          />
        </div>
        <div className="text-[10px] text-[#9ca3af] mt-1">
          Length runs along the truck; width is across; height is vertical.
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div>
          <label className="text-[10px] tracking-[0.15em] text-[#9ca3af] uppercase block mb-1.5">
            Weight (lb)
          </label>
          <DimInput
            placeholder="e.g. 45"
            value={state.weightLb}
            onChange={(v) => update("weightLb", v)}
          />
        </div>
        <div>
          <label className="text-[10px] tracking-[0.15em] text-[#9ca3af] uppercase block mb-1.5">
            Stackable
          </label>
          <div className="flex bg-white border border-[#d1d5db] rounded overflow-hidden">
            {([
              { v: true, label: "Yes" },
              { v: false, label: "No" },
            ] as const).map((opt) => {
              const active = state.stackable === opt.v;
              return (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => update("stackable", opt.v)}
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

      {state.stackable && (
        <div className="mb-3">
          <label className="text-[10px] tracking-[0.15em] text-[#9ca3af] uppercase block mb-1.5">
            Max stack height
          </label>
          <DimInput
            placeholder="e.g. 3"
            value={state.maxStack}
            onChange={(v) => update("maxStack", v)}
          />
          <div className="text-[10px] text-[#9ca3af] mt-1">
            Most you&rsquo;d ever stack on top of each other (1 = ground
            only).
          </div>
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
          {mode === "create" ? "Add case" : "Save"}
        </button>
      </div>
    </form>
  );
}

function DimInput({
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

function fromInitial(initial: CaseRow | EditorState): EditorState {
  if ("id" in initial && initial.id !== null && "depthIn" in initial) {
    // CaseRow
    const row = initial as CaseRow;
    return {
      id: row.id,
      label: row.label,
      depthIn: String(row.depthIn),
      widthIn: String(row.widthIn),
      heightIn: String(row.heightIn),
      weightLb: String(row.weightLb),
      stackable: row.stackable,
      maxStack: String(row.maxStack),
    };
  }
  return initial as EditorState;
}
