"use client";

// Two-step cascading case picker. Replaces the native <select> + <optgroup>
// in the vendor form. The user clicks a button labeled with the current
// selection (or a placeholder), which opens a panel listing the six
// categories. Tapping a category swaps the panel to a list of every case
// in that family. Tapping a case selects it and closes the panel.
//
// Mobile is a first-class target (see CLAUDE.md). The panel renders as a
// bottom sheet on narrow screens and an anchored popover on wider ones.

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  CASE_CATEGORY_LABELS,
  CASE_CATEGORY_ORDER,
  type CaseCategory,
  type CasePreset,
} from "@/lib/vendor-input";
import { formatDims } from "@/lib/units";

type Props = {
  cases: CasePreset[];
  value: string;
  onChange: (caseId: string) => void;
};

type Step =
  | { kind: "categories" }
  | { kind: "cases"; category: CaseCategory | "__other__" };

export default function CasePicker({ cases, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>({ kind: "categories" });
  const rootRef = useRef<HTMLDivElement>(null);

  // Group cases once per render; each bucket only includes its category.
  const grouped = useMemo(() => {
    const buckets = new Map<CaseCategory | "__other__", CasePreset[]>();
    for (const c of cases) {
      const key: CaseCategory | "__other__" = c.category ?? "__other__";
      const list = buckets.get(key);
      if (list) list.push(c);
      else buckets.set(key, [c]);
    }
    const out: Array<{
      key: CaseCategory | "__other__";
      label: string;
      items: CasePreset[];
    }> = [];
    for (const cat of CASE_CATEGORY_ORDER) {
      const items = buckets.get(cat);
      if (items && items.length > 0) {
        out.push({ key: cat, label: CASE_CATEGORY_LABELS[cat], items });
      }
    }
    const other = buckets.get("__other__");
    if (other && other.length > 0) {
      out.push({ key: "__other__", label: "Other", items: other });
    }
    return out;
  }, [cases]);

  const selected = useMemo(
    () => cases.find((c) => c.id === value) ?? null,
    [cases, value],
  );

  // Reset to category list every time the panel opens. Outside-click +
  // Esc both dismiss.
  useEffect(() => {
    if (!open) return;
    setStep({ kind: "categories" });

    function onClickAway(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickAway);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickAway);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const activeCategoryGroup =
    step.kind === "cases"
      ? grouped.find((g) => g.key === step.category) ?? null
      : null;

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`w-full flex items-center justify-between gap-2 bg-white border rounded px-3 py-2 text-sm transition min-h-[44px] focus:outline-none focus:border-[#0e3e7a] ${
          open
            ? "border-[#0e3e7a]"
            : "border-[#d1d5db] hover:border-[#9ca3af]"
        }`}
      >
        <span
          className={`truncate ${selected ? "text-[#272727]" : "text-[#9ca3af]"}`}
        >
          {selected ? (
            <>
              <span className="font-medium">{selected.label}</span>
              <span className="text-[#9ca3af] mono tabular-nums ml-2">
                {formatDims(
                  selected.depthIn,
                  selected.widthIn,
                  selected.heightIn,
                )}
              </span>
            </>
          ) : (
            "Select case type..."
          )}
        </span>
        <ChevronRight
          size={14}
          className={`shrink-0 text-[#9ca3af] transition-transform ${open ? "rotate-90" : ""}`}
        />
      </button>

      {open && (
        <>
          {/* Mobile backdrop — sits behind the bottom sheet on narrow screens.
              Hidden on >=sm where the panel is an anchored popover. */}
          <div
            className="sm:hidden fixed inset-0 bg-black/30 z-40"
            onClick={() => setOpen(false)}
            aria-hidden
          />

          <div
            className={[
              // mobile: bottom sheet
              "fixed inset-x-0 bottom-0 z-50 bg-white border-t border-[#d1d5db]",
              "max-h-[80vh] flex flex-col",
              // desktop: anchored popover under the trigger
              "sm:absolute sm:inset-x-auto sm:bottom-auto sm:top-full sm:left-0",
              "sm:mt-1 sm:w-full sm:max-h-[24rem] sm:border sm:rounded-md sm:border-[#d1d5db]",
            ].join(" ")}
            role="dialog"
            aria-label="Choose case type"
          >
            {/* Header — back arrow when on the cases step, close on the
                category step. */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-[#e6e8eb] bg-[#f8f9fa] sm:bg-white">
              {step.kind === "cases" ? (
                <button
                  type="button"
                  onClick={() => setStep({ kind: "categories" })}
                  className="flex items-center gap-1 text-[11px] tracking-wider uppercase text-[#0e3e7a] hover:text-[#02aed6] transition min-h-[40px] sm:min-h-0 px-1"
                >
                  <ChevronLeft size={14} />
                  Back
                </button>
              ) : (
                <span className="text-[11px] tracking-[0.2em] uppercase text-[#9ca3af]">
                  Case category
                </span>
              )}
              <span className="ml-auto text-[12px] font-medium text-[#272727] truncate">
                {step.kind === "cases" && activeCategoryGroup
                  ? activeCategoryGroup.label
                  : ""}
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="ml-2 text-[#9ca3af] hover:text-[#272727] transition p-1 min-h-[32px]"
                aria-label="Close"
              >
                <X size={14} />
              </button>
            </div>

            {/* Scrollable list */}
            <div className="overflow-y-auto flex-1">
              {step.kind === "categories" && (
                <ul role="menu">
                  {grouped.map((g) => (
                    <li key={g.key}>
                      <button
                        type="button"
                        onClick={() =>
                          setStep({ kind: "cases", category: g.key })
                        }
                        className="w-full flex items-center justify-between gap-2 px-3 py-3 text-left text-sm border-b border-[#e6e8eb] hover:bg-[#f8f9fa] transition min-h-[48px]"
                      >
                        <span className="font-medium text-[#272727]">
                          {g.label}
                        </span>
                        <span className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] tracking-wider uppercase text-[#9ca3af] mono tabular-nums">
                            {g.items.length}
                          </span>
                          <ChevronRight size={14} className="text-[#9ca3af]" />
                        </span>
                      </button>
                    </li>
                  ))}
                  {grouped.length === 0 && (
                    <li className="px-3 py-6 text-center text-xs text-[#9ca3af]">
                      No cases yet.
                    </li>
                  )}
                </ul>
              )}

              {step.kind === "cases" && activeCategoryGroup && (
                <ul role="listbox">
                  {activeCategoryGroup.items.map((c) => {
                    const isActive = c.id === value;
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={isActive}
                          onClick={() => {
                            onChange(c.id);
                            setOpen(false);
                          }}
                          className={`w-full flex items-center justify-between gap-3 px-3 py-3 text-left text-sm border-b border-[#e6e8eb] transition min-h-[48px] ${
                            isActive
                              ? "bg-[#0e3e7a]/10 text-[#0e3e7a]"
                              : "hover:bg-[#f8f9fa] text-[#272727]"
                          }`}
                        >
                          <span className="font-medium truncate">
                            {c.label}
                          </span>
                          <span className="text-[#5a6370] mono tabular-nums shrink-0 text-xs">
                            {formatDims(c.depthIn, c.widthIn, c.heightIn)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
