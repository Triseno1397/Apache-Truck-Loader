// Boundary layer between the DB (vendors.input_data jsonb) and the
// pure runtime VendorInput type that lib/packing.ts consumes.
//
// - Zod schemas validate the jsonb payload per input method.
// - `hydrateVendorInput` turns a DB row into a runtime VendorInput
//   (looking up case dimensions for the 'pieces' method).
// - `parseInputDataFromForm` turns FormData into the right jsonb
//   shape, ready to write back.

import { z } from "zod";
import type { CaseDimensions, VendorInput } from "@/lib/packing";

export type InputMethod =
  | "linear"
  | "dimensions"
  | "pieces"
  | "cubic"
  | "footprint"
  | "pallets"
  | "image";

export const INPUT_METHOD_LABELS: Record<InputMethod, string> = {
  linear: "Linear feet",
  dimensions: "Dimensions",
  pieces: "Pieces + case",
  cubic: "Cubic feet",
  footprint: "Footprint",
  pallets: "Pallets",
  image: "Image",
};

// ----- DB jsonb schemas (per method) -------------------------------------

export const InputDataLinearSchema = z.object({
  linearFt: z.number().nonnegative(),
});
export const InputDataCubicSchema = z.object({
  cubicFt: z.number().nonnegative(),
});
export const InputDataFootprintSchema = z.object({
  squareFt: z.number().nonnegative(),
});
// All number fields allow 0 - vendors can save partial data and fill the
// rest in later. The packing math returns 0 lin ft / 0 lb cleanly when
// quantities or dimensions are missing, which the UI shows as "0 LIN FT
// / 0 LB" - a clear visual signal to come back and finish the row.
export const InputDataDimensionsSchema = z.object({
  depthIn: z.number().nonnegative(),
  widthIn: z.number().nonnegative(),
  heightIn: z.number().nonnegative(),
  quantity: z.number().int().nonnegative(),
});
export const InputDataPiecesSchema = z.object({
  caseId: z.string(), // empty allowed; "no case picked yet" = incomplete row
  quantity: z.number().int().nonnegative(),
});
export const InputDataPalletsSchema = z.object({
  quantity: z.number().int().nonnegative(),
});
export const InputDataImageSchema = z.object({
  estimatedLinearFt: z.number().nonnegative(),
  imageUrl: z.string().url().nullable().optional(),
});

// Discriminated union of all jsonb shapes (for typed DB reads).
export type InputDataByMethod =
  | { method: "linear"; data: z.infer<typeof InputDataLinearSchema> }
  | { method: "cubic"; data: z.infer<typeof InputDataCubicSchema> }
  | { method: "footprint"; data: z.infer<typeof InputDataFootprintSchema> }
  | { method: "dimensions"; data: z.infer<typeof InputDataDimensionsSchema> }
  | { method: "pieces"; data: z.infer<typeof InputDataPiecesSchema> }
  | { method: "pallets"; data: z.infer<typeof InputDataPalletsSchema> }
  | { method: "image"; data: z.infer<typeof InputDataImageSchema> };

// Parse a raw jsonb payload as the right shape for the given method.
// Returns null if validation fails (caller decides what to do).
export function parseInputData(
  method: InputMethod,
  raw: unknown,
): InputDataByMethod | null {
  try {
    switch (method) {
      case "linear":
        return { method, data: InputDataLinearSchema.parse(raw) };
      case "cubic":
        return { method, data: InputDataCubicSchema.parse(raw) };
      case "footprint":
        return { method, data: InputDataFootprintSchema.parse(raw) };
      case "dimensions":
        return { method, data: InputDataDimensionsSchema.parse(raw) };
      case "pieces":
        return { method, data: InputDataPiecesSchema.parse(raw) };
      case "pallets":
        return { method, data: InputDataPalletsSchema.parse(raw) };
      case "image":
        return { method, data: InputDataImageSchema.parse(raw) };
    }
  } catch {
    return null;
  }
}

// ----- Hydration: DB row -> runtime VendorInput --------------------------

export type CaseCategory =
  | "flat_screen"
  | "trunk_utility"
  | "audio_video"
  | "work_box"
  | "rack";

// Display order in the case-picker dropdown.
export const CASE_CATEGORY_ORDER: readonly CaseCategory[] = [
  "flat_screen",
  "trunk_utility",
  "audio_video",
  "work_box",
  "rack",
] as const;

export const CASE_CATEGORY_LABELS: Record<CaseCategory, string> = {
  flat_screen: "Flat-Screen Display Cases",
  trunk_utility: "Trunk & Utility Cases",
  audio_video: "Audio-Video Cases",
  work_box: "Work Boxes",
  rack: "Rack Cases",
};

export type CasePreset = CaseDimensions & {
  id: string;
  label: string;
  weightLb: number;
  stackable: boolean;
  maxStack: number;
  category: CaseCategory | null;
};

export type CaseLookup = Map<string, CasePreset>;

export function hydrateVendorInput(args: {
  inputMethod: InputMethod;
  inputData: unknown;
  stackable: boolean | null;
  cases: CaseLookup;
}): VendorInput | null {
  const parsed = parseInputData(args.inputMethod, args.inputData);
  if (!parsed) return null;
  const stackOverride = args.stackable ?? undefined;

  switch (parsed.method) {
    case "linear":
      return { method: "linear", linearFt: parsed.data.linearFt };
    case "cubic":
      return { method: "cubic", cubicFt: parsed.data.cubicFt };
    case "footprint":
      return { method: "footprint", squareFt: parsed.data.squareFt };
    case "image":
      return {
        method: "image",
        estimatedLinearFt: parsed.data.estimatedLinearFt,
      };
    case "dimensions":
      return {
        method: "dimensions",
        depthIn: parsed.data.depthIn,
        widthIn: parsed.data.widthIn,
        heightIn: parsed.data.heightIn,
        quantity: parsed.data.quantity,
        stackable: stackOverride,
      };
    case "pallets":
      return {
        method: "pallets",
        quantity: parsed.data.quantity,
        stackable: stackOverride,
      };
    case "pieces": {
      const preset = args.cases.get(parsed.data.caseId);
      if (!preset) {
        // No case picked yet (or the caseId references a deleted case).
        // Return a zero-dim placeholder so the row still renders; packing
        // math will resolve to 0 lin ft / 0 lb.
        return {
          method: "pieces",
          case: { depthIn: 0, widthIn: 0, heightIn: 0, weightLb: 0 },
          defaultStackable: false,
          defaultMaxStack: 1,
          quantity: parsed.data.quantity,
          stackable: stackOverride,
        };
      }
      return {
        method: "pieces",
        case: {
          depthIn: preset.depthIn,
          widthIn: preset.widthIn,
          heightIn: preset.heightIn,
          weightLb: preset.weightLb,
        },
        defaultStackable: preset.stackable,
        defaultMaxStack: preset.maxStack,
        quantity: parsed.data.quantity,
        stackable: stackOverride,
      };
    }
  }
}

// ----- FormData -> jsonb payload -----------------------------------------

function num(form: FormData, key: string): number {
  const raw = form.get(key);
  if (raw === null) return 0;
  const n = parseFloat(String(raw));
  return Number.isFinite(n) ? n : 0;
}

function intOr(form: FormData, key: string, fallback = 0): number {
  const raw = form.get(key);
  if (raw === null) return fallback;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : fallback;
}

// Builds the jsonb payload for `vendors.input_data` from a posted form.
// Throws if the method-specific fields don't validate.
export function parseInputDataFromForm(
  method: InputMethod,
  form: FormData,
): Record<string, unknown> {
  switch (method) {
    case "linear":
      return InputDataLinearSchema.parse({ linearFt: num(form, "linearFt") });
    case "cubic":
      return InputDataCubicSchema.parse({ cubicFt: num(form, "cubicFt") });
    case "footprint":
      return InputDataFootprintSchema.parse({
        squareFt: num(form, "squareFt"),
      });
    case "dimensions":
      return InputDataDimensionsSchema.parse({
        depthIn: num(form, "depthIn"),
        widthIn: num(form, "widthIn"),
        heightIn: num(form, "heightIn"),
        quantity: intOr(form, "quantity"),
      });
    case "pieces":
      return InputDataPiecesSchema.parse({
        caseId: String(form.get("caseId") ?? ""),
        quantity: intOr(form, "quantity"),
      });
    case "pallets":
      return InputDataPalletsSchema.parse({
        quantity: intOr(form, "quantity"),
      });
    case "image":
      return InputDataImageSchema.parse({
        estimatedLinearFt: num(form, "estimatedLinearFt"),
      });
  }
}
