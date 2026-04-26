// Cross-vendor 2D shelf packing - the IP that makes this tool valuable.
//
// Per-vendor packing (lib/packing.ts) is honest in isolation but lies in
// aggregate: 3 pallets reports 8 ft (2 rows of 2-1) and 2 Pelicans reports
// 2.3 ft (4 across in 1 row); summing them says 10.3 ft, but in reality
// the Pelicans drop into the half-empty pallet row and the load is still
// 8 ft long. This module solves that.
//
// Algorithm:
//   1. Expand every vendor input into individual items (3 pallets -> 3
//      items, 8 Pelicans -> 8 items, etc.). Approximate methods (linear,
//      cubic, footprint, image) become a single full-width "bulk" item
//      whose depth is the converted linear feet.
//   2. Sort all items by depthIn desc, then heightIn desc, then widthIn
//      desc. Deepest first defines shelf depth; tallest first prefers
//      bases for stacking.
//   3. For each item, walk existing shelves and try to fit:
//        a) ground-level: width must fit in the shelf's remaining width
//           AND item depth <= shelf depth
//        b) stacked: item must be stackable, base must be stackable,
//           base's stack count not at cap, total stack height <=
//           truck height, item width <= base width, item depth <= base
//           depth
//      First fit wins.
//   4. If no shelf accepts the item, open a new shelf with depth =
//      item.depthIn.
//   5. Total length = sum of shelf depths.
//
// Items wider than the truck are returned as `unplaced` for the UI to
// surface as warnings.

import type { TruckCrossSection, VendorInput } from "@/lib/packing";

export type PackableItem = {
  vendorId: string;
  depthIn: number;
  widthIn: number;
  heightIn: number;
  weightLb: number;
  // Two independent stacking flags:
  //   stackable -> "this item can be placed ON TOP of others" (acts as
  //                a stacked item)
  //   canBeBase -> "OTHER items can be placed on top of THIS one" (acts
  //                as a base). Falls back to `stackable` when the source
  //                doesn't specify - matches the old single-flag behavior.
  stackable: boolean;
  canBeBase: boolean;
  maxStack: number;
  isBulk: boolean; // true for linear/cubic/footprint/image bulk blobs
};

export type PlacedItem = {
  item: PackableItem;
  xIn: number; // offset across truck width (left edge of item)
  layer: number; // 0 = ground, 1+ = stacked on a layer-N-1 item
  baseGroundIndex: number | null; // index into shelf.groundItems for stacked items
};

export type Shelf = {
  startIn: number; // distance from front of truck (cumulative)
  depthIn: number; // depth along truck length
  groundItems: PlacedItem[];
  stackedItems: PlacedItem[];
};

export type LoadResult = {
  shelves: Shelf[];
  unplaced: PackableItem[];
  totalLengthIn: number;
  totalWeightLb: number;
};

// ----- Vendor -> items expansion -----------------------------------------

export function expandVendorToItems(args: {
  vendorId: string;
  vendorInput: VendorInput;
  weightOverride: number | null;
  canBeBaseOverride?: boolean | null;
  truck: TruckCrossSection;
}): PackableItem[] {
  const { vendorId, vendorInput, weightOverride, canBeBaseOverride, truck } =
    args;

  // For approximate methods, build a single bulk item that occupies the
  // full truck width for its converted linear feet. These can't share rows
  // with anything else.
  const bulkItem = (linearFt: number): PackableItem[] => {
    if (linearFt <= 0) return [];
    return [
      {
        vendorId,
        depthIn: linearFt * 12,
        widthIn: truck.widthIn, // full width — blocks any sharing
        heightIn: truck.heightIn,
        weightLb: Math.max(0, weightOverride ?? 0),
        stackable: false,
        canBeBase: false, // bulk fills the whole row, no stacking surface
        maxStack: 1,
        isBulk: true,
      },
    ];
  };

  switch (vendorInput.method) {
    case "linear":
      return bulkItem(vendorInput.linearFt);
    case "cubic":
      return bulkItem(vendorInput.cubicFt / 64);
    case "footprint":
      return bulkItem(vendorInput.squareFt / 8);
    case "image":
      return bulkItem(vendorInput.estimatedLinearFt);

    case "dimensions": {
      const qty = Math.max(0, Math.floor(vendorInput.quantity));
      if (
        qty === 0 ||
        vendorInput.depthIn <= 0 ||
        vendorInput.widthIn <= 0
      ) {
        return [];
      }
      const stackable =
        vendorInput.stackable ??
        (vendorInput.heightIn > 0 && vendorInput.heightIn < 18);
      // Default canBeBase = stackable (mirrors old single-flag behavior),
      // unless the vendor explicitly opted in/out via the form toggle.
      const canBeBase = canBeBaseOverride ?? stackable;
      const perItemWeight =
        weightOverride !== null && weightOverride !== undefined
          ? weightOverride / qty
          : 0;
      return Array.from({ length: qty }, () => ({
        vendorId,
        depthIn: vendorInput.depthIn,
        widthIn: vendorInput.widthIn,
        heightIn: vendorInput.heightIn,
        weightLb: perItemWeight,
        stackable,
        canBeBase,
        maxStack: 6,
        isBulk: false,
      }));
    }

    case "pallets": {
      const qty = Math.max(0, Math.floor(vendorInput.quantity));
      if (qty === 0) return [];
      const stackable = vendorInput.stackable === true; // pallets default off
      // Pallets DEFAULT to canBeBase=true (you stack things on pallets
      // all the time even though you don't stack pallets on each other).
      const canBeBase = canBeBaseOverride ?? true;
      const perItemWeight =
        weightOverride !== null && weightOverride !== undefined
          ? weightOverride / qty
          : 0;
      return Array.from({ length: qty }, () => ({
        vendorId,
        depthIn: 48,
        widthIn: 40,
        heightIn: 48,
        weightLb: perItemWeight,
        stackable,
        canBeBase,
        maxStack: 2,
        isBulk: false,
      }));
    }

    case "pieces": {
      const qty = Math.max(0, Math.floor(vendorInput.quantity));
      if (qty === 0 || vendorInput.case.depthIn <= 0) return [];
      const stackable = vendorInput.stackable ?? vendorInput.defaultStackable;
      const canBeBase = canBeBaseOverride ?? vendorInput.defaultStackable;
      const perItemWeight =
        weightOverride !== null && weightOverride !== undefined
          ? weightOverride / qty
          : vendorInput.case.weightLb;
      return Array.from({ length: qty }, () => ({
        vendorId,
        depthIn: vendorInput.case.depthIn,
        widthIn: vendorInput.case.widthIn,
        heightIn: vendorInput.case.heightIn,
        weightLb: perItemWeight,
        stackable,
        canBeBase,
        maxStack: vendorInput.defaultMaxStack,
        isBulk: false,
      }));
    }
  }
}

// ----- Shelf packer ------------------------------------------------------

function groundUsedWidth(shelf: Shelf): number {
  return shelf.groundItems.reduce((sum, p) => sum + p.item.widthIn, 0);
}

function stackHeightAbove(shelf: Shelf, baseIndex: number): number {
  // total height of items currently stacked on the base at baseIndex
  return shelf.stackedItems
    .filter((p) => p.baseGroundIndex === baseIndex)
    .reduce((sum, p) => sum + p.item.heightIn, 0);
}

function stackCountAbove(shelf: Shelf, baseIndex: number): number {
  return shelf.stackedItems.filter((p) => p.baseGroundIndex === baseIndex)
    .length;
}

function tryFitGround(shelf: Shelf, item: PackableItem, truckWidthIn: number): PlacedItem | null {
  if (item.depthIn > shelf.depthIn) return null;
  const used = groundUsedWidth(shelf);
  if (truckWidthIn - used < item.widthIn) return null;
  return { item, xIn: used, layer: 0, baseGroundIndex: null };
}

function tryFitStacked(shelf: Shelf, item: PackableItem, truckHeightIn: number): PlacedItem | null {
  if (!item.stackable) return null; // item itself can't go on top of anything
  for (let i = 0; i < shelf.groundItems.length; i++) {
    const base = shelf.groundItems[i];
    if (!base.item.canBeBase) continue; // base refuses gear on top
    const cap = Math.max(1, base.item.maxStack);
    if (stackCountAbove(shelf, i) >= cap - 1) continue;
    if (item.widthIn > base.item.widthIn) continue;
    if (item.depthIn > base.item.depthIn) continue;
    const heightSoFar = base.item.heightIn + stackHeightAbove(shelf, i);
    if (heightSoFar + item.heightIn > truckHeightIn) continue;
    return {
      item,
      xIn: base.xIn,
      layer: 1 + stackCountAbove(shelf, i),
      baseGroundIndex: i,
    };
  }
  return null;
}

export function packLoad(
  items: PackableItem[],
  truck: TruckCrossSection,
): LoadResult {
  const sorted = [...items].sort(
    (a, b) =>
      b.depthIn - a.depthIn ||
      b.heightIn - a.heightIn ||
      b.widthIn - a.widthIn,
  );

  const shelves: Shelf[] = [];
  const unplaced: PackableItem[] = [];
  let totalWeightLb = 0;

  for (const item of sorted) {
    totalWeightLb += item.weightLb;

    if (item.widthIn > truck.widthIn) {
      unplaced.push(item);
      continue;
    }

    let placed = false;
    for (const shelf of shelves) {
      const ground = tryFitGround(shelf, item, truck.widthIn);
      if (ground) {
        shelf.groundItems.push(ground);
        placed = true;
        break;
      }
      const stacked = tryFitStacked(shelf, item, truck.heightIn);
      if (stacked) {
        shelf.stackedItems.push(stacked);
        placed = true;
        break;
      }
    }

    if (!placed) {
      const startIn = shelves.reduce((sum, s) => sum + s.depthIn, 0);
      shelves.push({
        startIn,
        depthIn: item.depthIn,
        groundItems: [{ item, xIn: 0, layer: 0, baseGroundIndex: null }],
        stackedItems: [],
      });
    }
  }

  const totalLengthIn = shelves.reduce((sum, s) => sum + s.depthIn, 0);
  return { shelves, unplaced, totalLengthIn, totalWeightLb };
}

// ----- Convenience wrapper -----------------------------------------------

export type VendorForPacking = {
  id: string;
  vendorInput: VendorInput;
  weightOverride: number | null;
  canBeBase?: boolean | null; // override: "let other gear stack on top of mine"
};

export function packVendors(
  vendors: VendorForPacking[],
  truck: TruckCrossSection,
): LoadResult {
  const allItems: PackableItem[] = [];
  for (const v of vendors) {
    allItems.push(
      ...expandVendorToItems({
        vendorId: v.id,
        vendorInput: v.vendorInput,
        weightOverride: v.weightOverride,
        canBeBaseOverride: v.canBeBase ?? null,
        truck,
      }),
    );
  }
  return packLoad(allItems, truck);
}
