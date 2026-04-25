// 3D packing math - the IP that makes the tool valuable.
//
// Items pack side-by-side across the truck WIDTH and stacked vertically
// in HEIGHT (when stackable), then fill along the truck LENGTH in rows.
// This mirrors how crews actually load: pallets in pairs, Pelicans 4
// across and stacked 5-6 high to the ceiling.
//
// Reference scenarios (from CLAUDE.md):
//   8 Pelican 1620s, floor-only -> 4.7 ft (4 across x 2 rows)
//   24 Pelican 1510s, stackable max 6 -> 1.8 ft (6 across x 6 high x 1 row)
//   2 standard pallets, floor-only -> 4 ft (2 across x 1 row)
//
// DO NOT replace this with cubic-feet/64 - that's how the spec calls
// out the dumb fallback that breaks load planning.

const TRUCK_CROSS_SECTION_SQFT = 64; // canonical 8x8 ft truck cross-section
const STANDARD_TRUCK_WIDTH_FT = 8;
const SHORT_ITEM_HEIGHT_THRESHOLD_IN = 18; // dimensions input default-stacks below this
const DIMENSIONS_GENERIC_MAX_STACK = 6; // safety cap for unknown cases entered by L/W/H
const PALLET_DEPTH_IN = 48;
const PALLET_WIDTH_IN = 40;
const PALLET_HEIGHT_IN = 48;
const PALLET_MAX_STACK = 2;

// ----- Core types ---------------------------------------------------------

export type CaseDimensions = {
  depthIn: number; // along the truck length (loaded depth of the case)
  widthIn: number; // across the truck (drives side-by-side pairing)
  heightIn: number; // drives vertical stacking
};

export type StackingRule = {
  stackable: boolean;
  maxStack: number; // safety cap; 1 = no stacking
};

export type TruckCrossSection = {
  widthIn: number;
  heightIn: number;
};

export type PackingResult = {
  linearFt: number;
  perRow: number;
  layers: number;
  rows: number;
  perCrossSection: number;
};

const EMPTY_PACK: PackingResult = {
  linearFt: 0,
  perRow: 0,
  layers: 1,
  rows: 0,
  perCrossSection: 0,
};

// ----- Conversions --------------------------------------------------------

export function cubicFeetToLinearFeet(cubicFt: number): number {
  return Math.max(0, cubicFt) / TRUCK_CROSS_SECTION_SQFT;
}

export function footprintToLinearFeet(squareFt: number): number {
  return Math.max(0, squareFt) / STANDARD_TRUCK_WIDTH_FT;
}

// ----- Smart 3D packing ---------------------------------------------------

export function packItems(args: {
  case: CaseDimensions;
  quantity: number;
  truck: TruckCrossSection;
  stack: StackingRule;
}): PackingResult {
  const { case: c, quantity, truck, stack } = args;
  const qty = Math.max(0, Math.floor(quantity));
  if (qty === 0 || c.depthIn <= 0 || c.widthIn <= 0 || truck.widthIn <= 0) {
    return EMPTY_PACK;
  }

  const perRow = Math.max(1, Math.floor(truck.widthIn / c.widthIn));

  let layers = 1;
  if (stack.stackable && c.heightIn > 0 && truck.heightIn > 0) {
    const physicalMax = Math.floor(truck.heightIn / c.heightIn);
    const safetyMax = Math.max(1, stack.maxStack);
    layers = Math.max(1, Math.min(physicalMax, safetyMax));
  }

  const perCrossSection = perRow * layers;
  const rows = Math.ceil(qty / perCrossSection);
  const linearFt = rows * (c.depthIn / 12);

  return { linearFt, perRow, layers, rows, perCrossSection };
}

// ----- Vendor input dispatcher --------------------------------------------
//
// Vendors quote gear in many shapes. This dispatcher converts any of them
// to a canonical PackingResult given a truck cross-section.
//
// `pieces` carries the case dimensions + weight INLINE (hydrate from the
// case_library row before calling this). Keeping packing pure of DB I/O.

export type VendorInputLinear = {
  method: "linear";
  linearFt: number;
};

export type VendorInputCubic = {
  method: "cubic";
  cubicFt: number;
};

export type VendorInputFootprint = {
  method: "footprint";
  squareFt: number;
};

export type VendorInputDimensions = {
  method: "dimensions";
  depthIn: number;
  widthIn: number;
  heightIn: number;
  quantity: number;
  // null/undefined => default: stackable when height < 18 inches
  stackable?: boolean | null;
};

export type VendorInputPieces = {
  method: "pieces";
  case: CaseDimensions & { weightLb: number };
  defaultStackable: boolean;
  defaultMaxStack: number;
  quantity: number;
  // null/undefined => use the case's defaultStackable
  stackable?: boolean | null;
};

export type VendorInputPallets = {
  method: "pallets";
  quantity: number;
  // null/undefined => false (pallets default to floor-only)
  stackable?: boolean | null;
};

export type VendorInputImage = {
  method: "image";
  estimatedLinearFt: number;
};

export type VendorInput =
  | VendorInputLinear
  | VendorInputCubic
  | VendorInputFootprint
  | VendorInputDimensions
  | VendorInputPieces
  | VendorInputPallets
  | VendorInputImage;

export function computeVendorPacking(
  input: VendorInput,
  truck: TruckCrossSection,
): PackingResult {
  switch (input.method) {
    case "linear":
      return { ...EMPTY_PACK, linearFt: Math.max(0, input.linearFt) };
    case "cubic":
      return { ...EMPTY_PACK, linearFt: cubicFeetToLinearFeet(input.cubicFt) };
    case "footprint":
      return { ...EMPTY_PACK, linearFt: footprintToLinearFeet(input.squareFt) };
    case "image":
      return { ...EMPTY_PACK, linearFt: Math.max(0, input.estimatedLinearFt) };
    case "dimensions": {
      const stackable =
        input.stackable ??
        (input.heightIn > 0 && input.heightIn < SHORT_ITEM_HEIGHT_THRESHOLD_IN);
      return packItems({
        case: {
          depthIn: input.depthIn,
          widthIn: input.widthIn,
          heightIn: input.heightIn,
        },
        quantity: input.quantity,
        truck,
        stack: { stackable, maxStack: DIMENSIONS_GENERIC_MAX_STACK },
      });
    }
    case "pallets": {
      const stackable = input.stackable === true;
      return packItems({
        case: {
          depthIn: PALLET_DEPTH_IN,
          widthIn: PALLET_WIDTH_IN,
          heightIn: PALLET_HEIGHT_IN,
        },
        quantity: input.quantity,
        truck,
        stack: { stackable, maxStack: PALLET_MAX_STACK },
      });
    }
    case "pieces": {
      const stackable = input.stackable ?? input.defaultStackable;
      return packItems({
        case: {
          depthIn: input.case.depthIn,
          widthIn: input.case.widthIn,
          heightIn: input.case.heightIn,
        },
        quantity: input.quantity,
        truck,
        stack: { stackable, maxStack: input.defaultMaxStack },
      });
    }
  }
}

export function computeVendorLinearFeet(
  input: VendorInput,
  truck: TruckCrossSection,
): number {
  return computeVendorPacking(input, truck).linearFt;
}

// Auto-derived weight: a vendor's piece-count input multiplies the case's
// preset weight by quantity. All other methods require an explicit weight
// from the vendor row (or default to 0). An override always wins.
export function computeVendorWeight(
  input: VendorInput,
  weightOverride: number | null | undefined,
): number {
  if (
    weightOverride !== null &&
    weightOverride !== undefined &&
    Number.isFinite(weightOverride)
  ) {
    return Math.max(0, weightOverride);
  }
  if (input.method === "pieces") {
    return Math.max(0, input.case.weightLb * Math.max(0, input.quantity));
  }
  return 0;
}

// Effective length capacity given a buffer percent (0-100). Subtracts the
// safety margin that covers cable runs, gaff kits, tie-down space, etc.
export function effectiveLengthFt(
  truckInteriorLengthFt: number,
  bufferPct: number,
): number {
  const clamped = Math.min(100, Math.max(0, bufferPct));
  return truckInteriorLengthFt * (1 - clamped / 100);
}
