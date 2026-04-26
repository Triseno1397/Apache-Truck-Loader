"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  Check,
  Image as ImageIcon,
  Loader2,
  Package,
  Ruler,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import {
  computeVendorPacking,
  computeVendorWeight,
  type TruckCrossSection,
  type VendorInput,
} from "@/lib/packing";
import {
  INPUT_METHOD_LABELS,
  type CasePreset,
  type InputMethod,
} from "@/lib/vendor-input";
import {
  deleteVendorAction,
  updateVendorAction,
} from "@/app/(app)/jobs/[id]/actions";

type Props = {
  jobId: string;
  truck: TruckCrossSection;
  cases: CasePreset[];
  initial: {
    vendorId: string;
    name: string;
    inputMethod: InputMethod;
    inputData: Record<string, unknown>;
    stackable: boolean | null;
    weightOverride: number | null;
    notes: string | null;
  };
};

type Status = "idle" | "saving" | "saved" | "error";
type DimensionUnit = "in" | "ft";

const METHODS: Array<{ id: InputMethod; icon: typeof Package; desc: string }> =
  [
    { id: "linear", icon: Ruler, desc: "Vendor gave a direct linear ft #" },
    { id: "dimensions", icon: Box, desc: "L x W x H" },
    { id: "pieces", icon: Package, desc: "Pelican, SKB, road case, etc." },
    { id: "cubic", icon: Box, desc: "Vendor quoted cubic feet" },
    { id: "footprint", icon: Box, desc: "Staging floor area sq ft" },
    { id: "pallets", icon: Package, desc: 'Standard 48" pallets' },
    { id: "image", icon: ImageIcon, desc: "Photo + manual estimate" },
  ];

const SHORT_HEIGHT_THRESHOLD_IN = 18;
const AUTO_SAVE_DEBOUNCE_MS = 600;

function num(s: string | undefined): number {
  if (s === undefined || s === "") return 0;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function intOr(s: string | undefined, fallback = 0): number {
  if (s === undefined || s === "") return fallback;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : fallback;
}

function trimNum(n: number): string {
  // 3-decimal precision, no trailing zeros
  return parseFloat(n.toFixed(3)).toString();
}

export default function VendorForm({ jobId, truck, cases, initial }: Props) {
  const router = useRouter();

  // Form state
  const [name, setName] = useState(initial.name);
  const [inputMethod, setInputMethod] = useState<InputMethod>(
    initial.inputMethod,
  );

  const initialData = (initial.inputData ?? {}) as Record<string, unknown>;
  const s = (k: string) => {
    const v = initialData[k];
    return v === undefined || v === null ? "" : String(v);
  };

  const [linearFt, setLinearFt] = useState(s("linearFt"));
  const [cubicFt, setCubicFt] = useState(s("cubicFt"));
  const [squareFt, setSquareFt] = useState(s("squareFt"));
  // Dimensions are always stored in INCHES under the hood. The dimension
  // unit toggle below converts the displayed value as the user switches.
  const [depthIn, setDepthIn] = useState(s("depthIn"));
  const [widthIn, setWidthIn] = useState(s("widthIn"));
  const [heightIn, setHeightIn] = useState(s("heightIn"));
  const [quantity, setQuantity] = useState(s("quantity"));
  const [caseId, setCaseId] = useState(s("caseId"));
  const [estimatedLinearFt, setEstimatedLinearFt] = useState(
    s("estimatedLinearFt"),
  );

  const [stackable, setStackable] = useState<"default" | "true" | "false">(
    initial.stackable === null ? "default" : initial.stackable ? "true" : "false",
  );

  const [weightOverride, setWeightOverride] = useState(
    initial.weightOverride !== null && initial.weightOverride !== undefined
      ? String(initial.weightOverride)
      : "",
  );
  const [notes, setNotes] = useState(initial.notes ?? "");

  // depthIn/widthIn/heightIn state above hold the value in WHATEVER UNIT
  // the user is currently typing in. When the unit toggle flips, switchUnit
  // converts the display strings. dimensionInches() resolves them to inches
  // at preview/save time so packing math always sees inches.
  const [dimensionUnit, setDimensionUnit] = useState<DimensionUnit>("in");

  function dimensionInches(displayValue: string): number {
    const n = num(displayValue);
    return dimensionUnit === "in" ? n : n * 12;
  }

  // Auto-save plumbing
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const isFirstRenderRef = useRef(true);
  const saveIdRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isLeaving, startLeaving] = useTransition();

  // Build the input_data payload for the current method
  function buildInputData(): Record<string, unknown> {
    switch (inputMethod) {
      case "linear":
        return { linearFt: num(linearFt) };
      case "cubic":
        return { cubicFt: num(cubicFt) };
      case "footprint":
        return { squareFt: num(squareFt) };
      case "dimensions":
        return {
          depthIn: dimensionInches(depthIn),
          widthIn: dimensionInches(widthIn),
          heightIn: dimensionInches(heightIn),
          quantity: intOr(quantity),
        };
      case "pieces":
        return { caseId, quantity: intOr(quantity) };
      case "pallets":
        return { quantity: intOr(quantity) };
      case "image":
        return { estimatedLinearFt: num(estimatedLinearFt) };
    }
  }

  function stackableToBool(v: typeof stackable): boolean | null {
    if (v === "default") return null;
    return v === "true";
  }

  function parseWeightOverride(s: string): number | null {
    if (s.trim() === "") return null;
    const n = parseFloat(s);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  async function performSave(): Promise<{ ok: boolean }> {
    saveIdRef.current++;
    const myId = saveIdRef.current;
    setStatus("saving");
    setErrorMsg("");

    const result = await updateVendorAction({
      vendorId: initial.vendorId,
      jobId,
      name: name.trim() || "Untitled vendor",
      inputMethod,
      inputData: buildInputData(),
      stackable: stackableToBool(stackable),
      weightOverride: parseWeightOverride(weightOverride),
      notes: notes.trim() || null,
    });

    if (myId !== saveIdRef.current) return { ok: result.ok };

    if (result.ok) {
      setStatus("saved");
      setTimeout(() => {
        if (myId === saveIdRef.current) setStatus("idle");
      }, 1500);
    } else {
      setStatus("error");
      setErrorMsg(result.error);
    }
    return { ok: result.ok };
  }

  // Debounced auto-save on every state change (skip the first render)
  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void performSave();
    }, AUTO_SAVE_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    name,
    inputMethod,
    linearFt,
    cubicFt,
    squareFt,
    depthIn,
    widthIn,
    heightIn,
    quantity,
    caseId,
    estimatedLinearFt,
    stackable,
    weightOverride,
    notes,
  ]);

  // "Done" button: flush any pending debounced save, then navigate
  function handleDone() {
    startLeaving(async () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      await performSave();
      router.push(`/jobs/${jobId}`);
      router.refresh();
    });
  }

  // ----- Live preview ----------------------------------------------------
  const selectedCase = useMemo(
    () => cases.find((c) => c.id === caseId) ?? null,
    [cases, caseId],
  );

  const previewInput: VendorInput | null = useMemo(() => {
    const stackOverride: boolean | undefined =
      stackable === "default" ? undefined : stackable === "true";
    switch (inputMethod) {
      case "linear":
        return { method: "linear", linearFt: num(linearFt) };
      case "cubic":
        return { method: "cubic", cubicFt: num(cubicFt) };
      case "footprint":
        return { method: "footprint", squareFt: num(squareFt) };
      case "image":
        return {
          method: "image",
          estimatedLinearFt: num(estimatedLinearFt),
        };
      case "dimensions": {
        const qty = intOr(quantity);
        const dIn = dimensionInches(depthIn);
        const wIn = dimensionInches(widthIn);
        const hIn = dimensionInches(heightIn);
        if (!qty || dIn <= 0 || wIn <= 0) return null;
        return {
          method: "dimensions",
          depthIn: dIn,
          widthIn: wIn,
          heightIn: hIn,
          quantity: qty,
          stackable: stackOverride,
        };
      }
      case "pallets": {
        const qty = intOr(quantity);
        if (!qty) return null;
        return {
          method: "pallets",
          quantity: qty,
          stackable: stackOverride,
        };
      }
      case "pieces": {
        const qty = intOr(quantity);
        if (!qty || !selectedCase) return null;
        return {
          method: "pieces",
          case: {
            depthIn: selectedCase.depthIn,
            widthIn: selectedCase.widthIn,
            heightIn: selectedCase.heightIn,
            weightLb: selectedCase.weightLb,
          },
          defaultStackable: selectedCase.stackable,
          defaultMaxStack: selectedCase.maxStack,
          quantity: qty,
          stackable: stackOverride,
        };
      }
    }
  }, [
    inputMethod,
    linearFt,
    cubicFt,
    squareFt,
    depthIn,
    widthIn,
    heightIn,
    quantity,
    estimatedLinearFt,
    selectedCase,
    stackable,
  ]);

  const preview = previewInput
    ? computeVendorPacking(previewInput, truck)
    : { linearFt: 0, layers: 1, perRow: 0, rows: 0, perCrossSection: 0 };
  const previewWeight = previewInput
    ? computeVendorWeight(
        previewInput,
        weightOverride === "" ? null : num(weightOverride),
      )
    : 0;

  const supportsStacking =
    inputMethod === "pieces" ||
    inputMethod === "dimensions" ||
    inputMethod === "pallets";

  // ----- inches/feet toggle helpers -------------------------------------
  function switchUnit(next: DimensionUnit) {
    if (next === dimensionUnit) return;
    const factor = next === "ft" ? 1 / 12 : 12;
    const convert = (raw: string): string => {
      if (raw === "") return "";
      const n = parseFloat(raw);
      if (!Number.isFinite(n)) return raw;
      return trimNum(n * factor);
    };
    setDepthIn(convert(depthIn));
    setWidthIn(convert(widthIn));
    setHeightIn(convert(heightIn));
    setDimensionUnit(next);
  }

  // Inch-resolved values for the "internally" hint shown when in ft mode.
  const depthInches = dimensionInches(depthIn);
  const widthInches = dimensionInches(widthIn);
  const heightInches = dimensionInches(heightIn);

  return (
    <div className="bg-[#f8f9fa] border border-[#d1d5db] rounded-md p-4 sm:p-5 mb-3">
      {/* Header: edit label + status pill + Done */}
      <div className="flex items-center justify-between mb-4 gap-2">
        <div className="flex items-center gap-2">
          <div className="text-[11px] tracking-[0.2em] text-[#5a6370] uppercase font-medium">
            Edit Vendor
          </div>
          <StatusPill status={status} errorMsg={errorMsg} />
        </div>
        <button
          type="button"
          onClick={handleDone}
          disabled={isLeaving}
          className="text-[11px] text-[#0e3e7a] hover:text-[#02aed6] transition tracking-wider uppercase font-semibold flex items-center gap-1.5 disabled:opacity-50"
        >
          {isLeaving ? <Loader2 size={12} className="animate-spin" /> : null}
          Done
        </button>
      </div>

      {/* Vendor name */}
      <div className="mb-4">
        <label className="text-[10px] tracking-[0.15em] text-[#9ca3af] uppercase block mb-1.5">
          Vendor
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Keslow Camera, Delicate Productions"
          className="w-full bg-white border border-[#d1d5db] rounded px-3 py-2 text-sm focus:outline-none focus:border-[#0e3e7a] transition"
        />
      </div>

      {/* Method picker */}
      <div className="mb-4">
        <label className="text-[10px] tracking-[0.15em] text-[#9ca3af] uppercase block mb-2">
          Input method
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {METHODS.map((m) => {
            const Icon = m.icon;
            const active = inputMethod === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setInputMethod(m.id)}
                className={`text-left px-2.5 py-2 rounded border text-xs transition min-h-[44px] ${
                  active
                    ? "bg-[#0e3e7a]/10 border-[#0e3e7a] text-[#0e3e7a]"
                    : "bg-white border-[#d1d5db] text-[#5a6370] hover:border-[#9ca3af] hover:text-[#272727]"
                }`}
                title={m.desc}
              >
                <div className="flex items-center gap-1.5">
                  <Icon size={12} />
                  <span className="font-medium">
                    {INPUT_METHOD_LABELS[m.id]}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Method-specific fields */}
      <div className="mb-4">
        {inputMethod === "linear" && (
          <NumberField
            label="Linear feet"
            value={linearFt}
            onChange={setLinearFt}
            placeholder="e.g. 12.5"
            step="0.1"
          />
        )}

        {inputMethod === "cubic" && (
          <NumberField
            label="Cubic feet"
            value={cubicFt}
            onChange={setCubicFt}
            placeholder="e.g. 120"
            step="0.1"
          />
        )}

        {inputMethod === "footprint" && (
          <>
            <NumberField
              label="Floor footprint (sq ft)"
              value={squareFt}
              onChange={setSquareFt}
              placeholder="e.g. 48"
              step="0.1"
            />
            <div className="text-[10px] text-[#9ca3af] mt-1">
              Assumes full 8ft truck width
            </div>
          </>
        )}

        {inputMethod === "dimensions" && (
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <label className="text-[10px] tracking-[0.15em] text-[#9ca3af] uppercase">
                Dimensions
              </label>
              <UnitToggle value={dimensionUnit} onChange={switchUnit} />
            </div>
            <div className="grid grid-cols-4 gap-2">
              <PlainNumber
                placeholder="L"
                value={depthIn}
                onChange={setDepthIn}
                suffix={dimensionUnit}
              />
              <PlainNumber
                placeholder="W"
                value={widthIn}
                onChange={setWidthIn}
                suffix={dimensionUnit}
              />
              <PlainNumber
                placeholder="H"
                value={heightIn}
                onChange={setHeightIn}
                suffix={dimensionUnit}
              />
              <PlainNumber
                placeholder="Qty"
                value={quantity}
                onChange={setQuantity}
                step="1"
              />
            </div>
            {dimensionUnit === "ft" && (depthInches > 0 || widthInches > 0 || heightInches > 0) && (
              <div className="text-[10px] text-[#9ca3af] mt-1 mono">
                {depthInches.toFixed(0)}" x {widthInches.toFixed(0)}" x{" "}
                {heightInches.toFixed(0)}" internally
              </div>
            )}
          </div>
        )}

        {inputMethod === "pieces" && (
          <div className="space-y-3">
            <div>
              <label className="text-[10px] tracking-[0.15em] text-[#9ca3af] uppercase block mb-1.5">
                Case type
              </label>
              <select
                value={caseId}
                onChange={(e) => setCaseId(e.target.value)}
                className="w-full bg-white border border-[#d1d5db] rounded px-3 py-2 text-sm focus:outline-none focus:border-[#0e3e7a]"
              >
                <option value="">Select case type...</option>
                {cases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label} &nbsp;·&nbsp; {c.depthIn}" x {c.widthIn}" x{" "}
                    {c.heightIn}" &nbsp;·&nbsp; {c.weightLb} lb
                  </option>
                ))}
              </select>
            </div>
            <NumberField
              label="Quantity"
              value={quantity}
              onChange={setQuantity}
              placeholder="e.g. 8"
              step="1"
            />
          </div>
        )}

        {inputMethod === "pallets" && (
          <>
            <NumberField
              label="Number of pallets"
              value={quantity}
              onChange={setQuantity}
              placeholder="e.g. 3"
              step="1"
            />
            <div className="text-[10px] text-[#9ca3af] mt-1">
              48"x40" pallets pair side-by-side (2 per 4ft row)
            </div>
          </>
        )}

        {inputMethod === "image" && (
          <>
            <div className="border border-dashed border-[#d1d5db] rounded p-4 text-center mb-3">
              <ImageIcon size={20} className="mx-auto mb-2 text-[#9ca3af]" />
              <div className="text-xs text-[#5a6370] mb-1">
                Image recognition: Phase 2
              </div>
              <div className="text-[10px] text-[#9ca3af] leading-relaxed">
                Future version will ID cases from a photo. For now, type your
                best estimate.
              </div>
            </div>
            <NumberField
              label="Estimated linear feet"
              value={estimatedLinearFt}
              onChange={setEstimatedLinearFt}
              placeholder="e.g. 15"
              step="0.1"
            />
          </>
        )}
      </div>

      {/* Stackable toggle */}
      {supportsStacking && (
        <div className="mb-4">
          <label className="text-[10px] tracking-[0.15em] text-[#9ca3af] uppercase block mb-1.5">
            Stacking
          </label>
          <div className="flex bg-white border border-[#d1d5db] rounded overflow-hidden">
            {(
              [
                { v: "default", label: "Default" },
                { v: "true", label: "Stack to ceiling" },
                { v: "false", label: "Floor only" },
              ] as const
            ).map((opt) => {
              const active = stackable === opt.v;
              return (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setStackable(opt.v)}
                  className={`flex-1 px-2.5 py-2 text-xs font-medium transition min-h-[40px] ${
                    active
                      ? "bg-[#0e3e7a] text-white"
                      : "text-[#5a6370] hover:text-[#272727]"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Weight override */}
      <div className="mb-4">
        <label className="text-[10px] tracking-[0.15em] text-[#9ca3af] uppercase block mb-1.5">
          Weight (lb){" "}
          {inputMethod === "pieces" && (
            <span className="text-[#0e3e7a] normal-case tracking-normal">
              auto from preset unless overridden
            </span>
          )}
        </label>
        <input
          type="number"
          value={weightOverride}
          onChange={(e) => setWeightOverride(e.target.value)}
          placeholder={
            inputMethod === "pieces"
              ? `auto: ${previewWeight.toFixed(0)} lb`
              : "e.g. 500"
          }
          step="any"
          className="w-full bg-white border border-[#d1d5db] rounded px-3 py-2 text-sm focus:outline-none focus:border-[#0e3e7a]"
        />
      </div>

      {/* Notes */}
      <div className="mb-4">
        <label className="text-[10px] tracking-[0.15em] text-[#9ca3af] uppercase block mb-1.5">
          Notes (optional)
        </label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Fragile, load last, etc."
          className="w-full bg-white border border-[#d1d5db] rounded px-3 py-2 text-sm focus:outline-none focus:border-[#0e3e7a]"
        />
      </div>

      {/* Live preview */}
      <div className="bg-white border border-[#e6e8eb] rounded p-3 mb-4">
        <div className="text-[10px] tracking-[0.15em] text-[#9ca3af] uppercase mb-2">
          Converted total
        </div>
        <div className="flex items-center gap-6 flex-wrap">
          <div>
            <div className="font-mono text-[#0e3e7a] text-lg font-semibold tabular-nums">
              {preview.linearFt.toFixed(1)}
            </div>
            <div className="text-[10px] text-[#5a6370] tracking-wide">
              LINEAR FT
            </div>
          </div>
          <div>
            <div className="font-mono text-[#272727] text-lg font-semibold tabular-nums">
              {previewWeight.toFixed(0)}
            </div>
            <div className="text-[10px] text-[#5a6370] tracking-wide">LB</div>
          </div>
          {preview.rows > 0 && preview.perRow > 0 && (
            <div className="ml-auto text-right">
              <div className="font-mono text-[#5a6370] text-xs">
                {preview.perRow} across
                {preview.layers > 1 ? ` x ${preview.layers} high` : ""} x{" "}
                {preview.rows} row{preview.rows > 1 ? "s" : ""}
              </div>
              <div className="text-[10px] text-[#9ca3af] tracking-wide">
                PACKED
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer: delete vendor */}
      <div className="pt-3 border-t border-[#e6e8eb] flex items-center justify-between gap-2">
        <form action={deleteVendorAction}>
          <input type="hidden" name="vendorId" value={initial.vendorId} />
          <input type="hidden" name="jobId" value={jobId} />
          <button
            type="submit"
            className="text-[11px] text-[#9ca3af] hover:text-[#dc2626] transition tracking-wider uppercase flex items-center gap-1.5"
          >
            <Trash2 size={11} />
            Delete vendor
          </button>
        </form>
        <div className="text-[10px] text-[#9ca3af] mono tracking-wider">
          AUTO-SAVED
        </div>
      </div>
    </div>
  );
}

// ----- Sub-components ----------------------------------------------------

function StatusPill({ status, errorMsg }: { status: Status; errorMsg: string }) {
  if (status === "saving") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-[#9ca3af] mono tracking-wider">
        <Loader2 size={10} className="animate-spin" />
        SAVING
      </span>
    );
  }
  if (status === "saved") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-[#16a34a] mono tracking-wider">
        <Check size={10} />
        SAVED
      </span>
    );
  }
  if (status === "error") {
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] text-[#dc2626] mono tracking-wider"
        title={errorMsg}
      >
        <TriangleAlert size={10} />
        SAVE FAILED
      </span>
    );
  }
  return null;
}

function UnitToggle({
  value,
  onChange,
}: {
  value: DimensionUnit;
  onChange: (v: DimensionUnit) => void;
}) {
  return (
    <div className="flex bg-white border border-[#d1d5db] rounded overflow-hidden text-[10px] tracking-wider uppercase">
      {(["in", "ft"] as const).map((u) => {
        const active = value === u;
        return (
          <button
            key={u}
            type="button"
            onClick={() => onChange(u)}
            className={`px-2 py-1 transition ${
              active
                ? "bg-[#0e3e7a] text-white"
                : "text-[#5a6370] hover:text-[#272727]"
            }`}
          >
            {u}
          </button>
        );
      })}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  placeholder,
  step,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  step?: string;
}) {
  return (
    <div>
      <label className="text-[10px] tracking-[0.15em] text-[#9ca3af] uppercase block mb-1.5">
        {label}
      </label>
      <PlainNumber
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        step={step}
      />
    </div>
  );
}

function PlainNumber({
  value,
  onChange,
  placeholder,
  step,
  suffix,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  step?: string;
  suffix?: string;
}) {
  return (
    <div className="relative">
      <input
        type="number"
        step={step ?? "any"}
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full bg-white border border-[#d1d5db] rounded px-3 py-2 text-sm focus:outline-none focus:border-[#0e3e7a] mono tabular-nums ${suffix ? "pr-7" : ""}`}
      />
      {suffix && (
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[#9ca3af] mono uppercase tracking-wider pointer-events-none">
          {suffix}
        </span>
      )}
    </div>
  );
}

