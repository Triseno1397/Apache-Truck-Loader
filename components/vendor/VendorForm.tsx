"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Box,
  Image as ImageIcon,
  Layers,
  Package,
  Ruler,
  X,
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
import { saveVendorAction } from "@/app/(app)/jobs/[id]/actions";

type Props = {
  jobId: string;
  truck: TruckCrossSection;
  cases: CasePreset[];
  // present in edit mode
  initial?: {
    vendorId: string;
    name: string;
    inputMethod: InputMethod;
    inputData: Record<string, unknown>;
    stackable: boolean | null;
    weightOverride: number | null;
    notes: string | null;
  };
};

const METHODS: Array<{ id: InputMethod; icon: typeof Package; desc: string }> =
  [
    { id: "linear", icon: Ruler, desc: "Vendor gave a direct linear ft #" },
    { id: "dimensions", icon: Box, desc: "L x W x H in inches" },
    { id: "pieces", icon: Package, desc: "Pelican, SKB, road case, etc." },
    { id: "cubic", icon: Box, desc: "Vendor quoted cubic feet" },
    { id: "footprint", icon: Box, desc: "Staging floor area sq ft" },
    { id: "pallets", icon: Package, desc: "Standard 48\" pallets" },
    { id: "image", icon: ImageIcon, desc: "Photo + manual estimate (Phase 2 AI)" },
  ];

const SHORT_HEIGHT_THRESHOLD = 18; // matches lib/packing.ts default

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

export default function VendorForm({ jobId, truck, cases, initial }: Props) {
  const isEdit = !!initial;
  const [name, setName] = useState(initial?.name ?? "");
  const [inputMethod, setInputMethod] = useState<InputMethod>(
    initial?.inputMethod ?? "linear",
  );

  // Each method has its own slice of state. Storing as strings keeps the
  // input UX correct (empty = empty, no leading zero on number inputs).
  const initialData = (initial?.inputData ?? {}) as Record<string, unknown>;
  const s = (k: string) => {
    const v = initialData[k];
    return v === undefined || v === null ? "" : String(v);
  };

  const [linearFt, setLinearFt] = useState(s("linearFt"));
  const [cubicFt, setCubicFt] = useState(s("cubicFt"));
  const [squareFt, setSquareFt] = useState(s("squareFt"));
  const [depthIn, setDepthIn] = useState(s("depthIn"));
  const [widthIn, setWidthIn] = useState(s("widthIn"));
  const [heightIn, setHeightIn] = useState(s("heightIn"));
  const [quantity, setQuantity] = useState(s("quantity"));
  const [caseId, setCaseId] = useState(s("caseId"));
  const [estimatedLinearFt, setEstimatedLinearFt] = useState(
    s("estimatedLinearFt"),
  );

  // tri-state stackable: "default" (use method default) | "true" | "false"
  const [stackable, setStackable] = useState<"default" | "true" | "false">(
    initial?.stackable === null || initial?.stackable === undefined
      ? "default"
      : initial.stackable
        ? "true"
        : "false",
  );

  const [weightOverride, setWeightOverride] = useState(
    initial?.weightOverride !== null && initial?.weightOverride !== undefined
      ? String(initial.weightOverride)
      : "",
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const selectedCase = useMemo(
    () => cases.find((c) => c.id === caseId) ?? null,
    [cases, caseId],
  );

  // Build the runtime VendorInput from current state for the live preview.
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
        if (!qty || !num(depthIn) || !num(widthIn)) return null;
        return {
          method: "dimensions",
          depthIn: num(depthIn),
          widthIn: num(widthIn),
          heightIn: num(heightIn),
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

  // Effective stackable for the toggle display (so user sees what's active)
  const effectiveStackable = (() => {
    if (stackable !== "default") return stackable === "true";
    if (inputMethod === "pieces") return selectedCase?.stackable ?? false;
    if (inputMethod === "dimensions") {
      const h = num(heightIn);
      return h > 0 && h < SHORT_HEIGHT_THRESHOLD;
    }
    return false; // pallets default off
  })();

  return (
    <form
      action={saveVendorAction}
      className="bg-[#f8f9fa] border border-[#d1d5db] rounded-md p-4 sm:p-5 mb-3"
    >
      <input type="hidden" name="jobId" value={jobId} />
      {isEdit && (
        <input type="hidden" name="vendorId" value={initial!.vendorId} />
      )}
      <input type="hidden" name="input_method" value={inputMethod} />
      <input
        type="hidden"
        name="stackable"
        value={
          stackable === "default"
            ? "default"
            : stackable === "true"
              ? "true"
              : "false"
        }
      />

      <div className="flex items-center justify-between mb-4">
        <div className="text-[11px] tracking-[0.2em] text-[#5a6370] uppercase font-medium">
          {isEdit ? "Edit Vendor" : "New Vendor"}
        </div>
        <Link
          href={`/jobs/${jobId}`}
          className="text-[#9ca3af] hover:text-[#272727] transition p-1 -m-1"
        >
          <X size={16} />
        </Link>
      </div>

      {/* Vendor name */}
      <div className="mb-4">
        <label className="text-[10px] tracking-[0.15em] text-[#9ca3af] uppercase block mb-1.5">
          Vendor
        </label>
        <input
          type="text"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Keslow Camera, Delicate Productions"
          required
          autoFocus={!isEdit}
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
            name="linearFt"
            step="0.1"
            value={linearFt}
            onChange={setLinearFt}
            placeholder="e.g. 12.5"
          />
        )}

        {inputMethod === "cubic" && (
          <NumberField
            label="Cubic feet"
            name="cubicFt"
            step="0.1"
            value={cubicFt}
            onChange={setCubicFt}
            placeholder="e.g. 120"
          />
        )}

        {inputMethod === "footprint" && (
          <>
            <NumberField
              label="Floor footprint (sq ft)"
              name="squareFt"
              step="0.1"
              value={squareFt}
              onChange={setSquareFt}
              placeholder="e.g. 48"
            />
            <div className="text-[10px] text-[#9ca3af] mt-1">
              Assumes full 8ft truck width
            </div>
          </>
        )}

        {inputMethod === "dimensions" && (
          <div>
            <label className="text-[10px] tracking-[0.15em] text-[#9ca3af] uppercase block mb-1.5">
              Dimensions (inches)
            </label>
            <div className="grid grid-cols-4 gap-2">
              <PlainNumber name="depthIn" placeholder="L" value={depthIn} onChange={setDepthIn} />
              <PlainNumber name="widthIn" placeholder="W" value={widthIn} onChange={setWidthIn} />
              <PlainNumber name="heightIn" placeholder="H" value={heightIn} onChange={setHeightIn} />
              <PlainNumber name="quantity" placeholder="Qty" value={quantity} onChange={setQuantity} step="1" />
            </div>
          </div>
        )}

        {inputMethod === "pieces" && (
          <div className="space-y-3">
            <div>
              <label className="text-[10px] tracking-[0.15em] text-[#9ca3af] uppercase block mb-1.5">
                Case type
              </label>
              <select
                name="caseId"
                value={caseId}
                onChange={(e) => setCaseId(e.target.value)}
                className="w-full bg-white border border-[#d1d5db] rounded px-3 py-2 text-sm focus:outline-none focus:border-[#0e3e7a]"
              >
                <option value="">Select case type...</option>
                {cases.map((c) => {
                  const perRow = Math.max(
                    1,
                    Math.floor(truck.widthIn / c.widthIn),
                  );
                  const layers = c.stackable
                    ? Math.max(
                        1,
                        Math.min(
                          Math.floor(truck.heightIn / c.heightIn),
                          c.maxStack,
                        ),
                      )
                    : 1;
                  const stackBit = layers > 1 ? ` x ${layers} high` : "";
                  return (
                    <option key={c.id} value={c.id}>
                      {c.label} - {c.weightLb} lb - {perRow} across{stackBit}
                    </option>
                  );
                })}
              </select>
            </div>
            <NumberField
              label="Quantity"
              name="quantity"
              step="1"
              value={quantity}
              onChange={setQuantity}
              placeholder="e.g. 8"
            />
          </div>
        )}

        {inputMethod === "pallets" && (
          <>
            <NumberField
              label="Number of pallets"
              name="quantity"
              step="1"
              value={quantity}
              onChange={setQuantity}
              placeholder="e.g. 3"
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
              name="estimatedLinearFt"
              step="0.1"
              value={estimatedLinearFt}
              onChange={setEstimatedLinearFt}
              placeholder="e.g. 15"
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
          <div className="text-[10px] text-[#9ca3af] mt-1.5 leading-relaxed">
            Default = use the recommended setting for this method
            {effectiveStackable && stackable === "default" ? (
              <>
                {" "}
                <span className="text-[#0e3e7a] mono">
                  (currently STACKED x {preview.layers})
                </span>
              </>
            ) : null}
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
          name="weight_lb_override"
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
          name="notes"
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

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!name.trim()}
          className="flex-1 bg-[#0e3e7a] text-white font-semibold text-sm px-4 py-2.5 rounded hover:bg-[#02aed6] transition disabled:opacity-30 disabled:cursor-not-allowed min-h-[44px]"
        >
          {isEdit ? "Update" : "Add vendor"}
        </button>
        <Link
          href={`/jobs/${jobId}`}
          className="px-4 py-2.5 bg-white border border-[#d1d5db] text-[#5a6370] rounded text-sm hover:border-[#9ca3af] hover:text-[#272727] transition flex items-center min-h-[44px]"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

// Small inline subcomponents to keep the JSX readable

function NumberField({
  label,
  name,
  step,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  name: string;
  step?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="text-[10px] tracking-[0.15em] text-[#9ca3af] uppercase block mb-1.5">
        {label}
      </label>
      <PlainNumber
        name={name}
        step={step}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
      />
    </div>
  );
}

function PlainNumber({
  name,
  step,
  value,
  onChange,
  placeholder,
}: {
  name: string;
  step?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="number"
      name={name}
      step={step ?? "any"}
      inputMode="decimal"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-white border border-[#d1d5db] rounded px-3 py-2 text-sm focus:outline-none focus:border-[#0e3e7a] mono tabular-nums"
    />
  );
}
