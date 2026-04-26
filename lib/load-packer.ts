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
//   2. Per-item MANUAL PLACEMENTS (from vendors.manual_placements) get
//      placed FIRST as locked shelves at the user-anchored xIn / yIn.
//      The auto-packer then fills around them.
//   3. Sort the remaining (auto) items by depthIn desc, then heightIn
//      desc, then widthIn desc. Deepest first defines shelf depth;
//      tallest first prefers bases for stacking.
//   4. For each auto item, walk existing shelves and try to fit:
//        a) ground-level: must find a yIn slot wide enough between
//           existing items in the shelf (slot-aware, NOT contiguous-
//           from-zero), AND item depth <= shelf depth
//        b) stacked: item must be stackable, base must be stackable,
//           base's stack count not at cap, total stack height <=
//           truck height, item width <= base width, item depth <= base
//           depth
//      First fit wins.
//   5. If no shelf accepts the item, open a new shelf at the rear
//      (max startIn + depthIn across existing shelves).
//   6. Total length = max(startIn + depthIn) over all shelves. Gaps
//      created by manual placements DON'T inflate the total.
//
// Items wider than the truck are returned as `unplaced` for the UI to
// surface as warnings.

import type { TruckCrossSection, VendorInput } from "@/lib/packing";

export type ManualPlacement = {
  xIn: number; // distance from front of truck along cargo length
  yIn: number; // offset across truck width from driver-side wall
};

export type PackableItem = {
  vendorId: string;
  // Stable index of this item within its vendor's expansion (0..qty-1).
  // Drives the manual_placements lookup so a dragged rect persists to
  // the right slot in the JSONB array.
  itemIndex: number;
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
  // If set, the user has manually anchored this item at this position.
  // The packer pre-places these as locked shelves before auto-packing.
  manual?: ManualPlacement;
};

export type PlacedItem = {
  item: PackableItem;
  xIn: number; // offset across truck width (left edge of item, NOT length)
  layer: number; // 0 = ground, 1+ = stacked on a layer-N-1 item
  baseGroundIndex: number | null; // index into shelf.groundItems for stacked items
  isManual: boolean; // true when placed from vendors.manual_placements
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

// Snap-to-grid resolution for manual placements. The UI also snaps to
// this grid before persist; the packer re-snaps defensively.
const GRID_SNAP_IN = 6;

function snap(n: number): number {
  return Math.max(0, Math.round(n / GRID_SNAP_IN) * GRID_SNAP_IN);
}

// ----- Vendor -> items expansion -----------------------------------------

export function expandVendorToItems(args: {
  vendorId: string;
  vendorInput: VendorInput;
  weightOverride: number | null;
  canBeBaseOverride?: boolean | null;
  truck: TruckCrossSection;
  // Sparse array indexed by itemIndex (0..qty-1). null entries mean
  // "this item has no manual anchor and should be auto-packed".
  manualPlacements?: (ManualPlacement | null)[];
}): PackableItem[] {
  const {
    vendorId,
    vendorInput,
    weightOverride,
    canBeBaseOverride,
    truck,
    manualPlacements,
  } = args;

  // Helper: stamp manual placement onto items 0..N-1 by index.
  const withManual = (items: PackableItem[]): PackableItem[] => {
    if (!manualPlacements || manualPlacements.length === 0) return items;
    return items.map((it, idx) => {
      const mp = manualPlacements[idx];
      if (!mp) return it;
      return { ...it, manual: { xIn: mp.xIn, yIn: mp.yIn } };
    });
  };

  // For approximate methods, build a single bulk item that occupies the
  // full truck width for its converted linear feet. These can't share rows
  // with anything else.
  const bulkItem = (linearFt: number): PackableItem[] => {
    if (linearFt <= 0) return [];
    return [
      {
        vendorId,
        itemIndex: 0,
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
      return withManual(bulkItem(vendorInput.linearFt));
    case "cubic":
      return withManual(bulkItem(vendorInput.cubicFt / 64));
    case "footprint":
      return withManual(bulkItem(vendorInput.squareFt / 8));
    case "image":
      return withManual(bulkItem(vendorInput.estimatedLinearFt));

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
      return withManual(
        Array.from({ length: qty }, (_, i) => ({
          vendorId,
          itemIndex: i,
          depthIn: vendorInput.depthIn,
          widthIn: vendorInput.widthIn,
          heightIn: vendorInput.heightIn,
          weightLb: perItemWeight,
          stackable,
          canBeBase,
          maxStack: 6,
          isBulk: false,
        })),
      );
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
      return withManual(
        Array.from({ length: qty }, (_, i) => ({
          vendorId,
          itemIndex: i,
          depthIn: 48,
          widthIn: 40,
          heightIn: 48,
          weightLb: perItemWeight,
          stackable,
          canBeBase,
          maxStack: 2,
          isBulk: false,
        })),
      );
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
      return withManual(
        Array.from({ length: qty }, (_, i) => ({
          vendorId,
          itemIndex: i,
          depthIn: vendorInput.case.depthIn,
          widthIn: vendorInput.case.widthIn,
          heightIn: vendorInput.case.heightIn,
          weightLb: perItemWeight,
          stackable,
          canBeBase,
          maxStack: vendorInput.defaultMaxStack,
          isBulk: false,
        })),
      );
    }
  }
}

// ----- Shelf packer ------------------------------------------------------

function stackHeightAbove(shelf: Shelf, baseIndex: number): number {
  return shelf.stackedItems
    .filter((p) => p.baseGroundIndex === baseIndex)
    .reduce((sum, p) => sum + p.item.heightIn, 0);
}

function stackCountAbove(shelf: Shelf, baseIndex: number): number {
  return shelf.stackedItems.filter((p) => p.baseGroundIndex === baseIndex)
    .length;
}

// Slot-aware ground placement: scans the shelf's existing ground items
// (sorted by xIn) and finds the first y-gap wide enough for the new item.
// This is what lets manual placements sit at arbitrary yIn positions and
// auto items still pack around them.
function tryFitGround(
  shelf: Shelf,
  item: PackableItem,
  truckWidthIn: number,
): PlacedItem | null {
  if (item.depthIn > shelf.depthIn) return null;
  const sorted = [...shelf.groundItems].sort((a, b) => a.xIn - b.xIn);
  let cursor = 0;
  for (const placed of sorted) {
    const gap = placed.xIn - cursor;
    if (gap >= item.widthIn) {
      return {
        item,
        xIn: cursor,
        layer: 0,
        baseGroundIndex: null,
        isManual: false,
      };
    }
    cursor = Math.max(cursor, placed.xIn + placed.item.widthIn);
  }
  if (truckWidthIn - cursor >= item.widthIn) {
    return {
      item,
      xIn: cursor,
      layer: 0,
      baseGroundIndex: null,
      isManual: false,
    };
  }
  return null;
}

function tryFitStacked(
  shelf: Shelf,
  item: PackableItem,
  truckHeightIn: number,
): PlacedItem | null {
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
      isManual: false,
    };
  }
  return null;
}

// Find or create a locked shelf for a manually-placed item. Items at the
// same snapped startIn AND same depth share a shelf; otherwise the manual
// item gets its own shelf.
function placeManualItem(
  shelves: Shelf[],
  item: PackableItem,
  truckWidthIn: number,
): { ok: true } | { ok: false } {
  if (!item.manual) return { ok: false };
  const startIn = snap(item.manual.xIn);
  const yIn = Math.max(
    0,
    Math.min(truckWidthIn - item.widthIn, snap(item.manual.yIn)),
  );

  // Try to share a shelf with another manual item at the same x and depth.
  let shelf = shelves.find(
    (s) => s.startIn === startIn && s.depthIn === item.depthIn,
  );
  if (!shelf) {
    shelf = {
      startIn,
      depthIn: item.depthIn,
      groundItems: [],
      stackedItems: [],
    };
    shelves.push(shelf);
  }

  // Make sure this manual item doesn't overlap an already-placed one in
  // the same shelf. If it does, drop the placement to ground at the next
  // free slot (rare; the UI prevents this).
  const sorted = [...shelf.groundItems].sort((a, b) => a.xIn - b.xIn);
  let resolvedY = yIn;
  for (const placed of sorted) {
    const overlap =
      yIn < placed.xIn + placed.item.widthIn &&
      yIn + item.widthIn > placed.xIn;
    if (overlap) {
      // shift to right of the conflicting item
      resolvedY = Math.max(resolvedY, placed.xIn + placed.item.widthIn);
    }
  }
  if (resolvedY + item.widthIn > truckWidthIn) {
    return { ok: false };
  }

  shelf.groundItems.push({
    item,
    xIn: resolvedY,
    layer: 0,
    baseGroundIndex: null,
    isManual: true,
  });
  return { ok: true };
}

export function packLoad(
  items: PackableItem[],
  truck: TruckCrossSection,
): LoadResult {
  const shelves: Shelf[] = [];
  const unplaced: PackableItem[] = [];
  let totalWeightLb = 0;

  // 1. Pre-place manual items as locked shelves at their anchored xIn.
  //    Manual placements always count toward weight even if they fail to
  //    place (the gear is still in the load logically).
  const manuals = items.filter((i) => i.manual);
  const autos = items.filter((i) => !i.manual);

  for (const item of manuals) {
    totalWeightLb += item.weightLb;
    if (item.widthIn > truck.widthIn) {
      unplaced.push(item);
      continue;
    }
    const result = placeManualItem(shelves, item, truck.widthIn);
    if (!result.ok) {
      unplaced.push(item);
    }
  }

  // 2. Auto-pack remaining items into existing shelves first (which now
  //    include the locked manual ones), then open new shelves at the rear.
  const sorted = [...autos].sort(
    (a, b) =>
      b.depthIn - a.depthIn ||
      b.heightIn - a.heightIn ||
      b.widthIn - a.widthIn,
  );

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
      // Open a new shelf at the rearmost end so we don't conflict with
      // existing (possibly manually-anchored) shelves at lower xIn.
      const rearEnd = shelves.reduce(
        (max, s) => Math.max(max, s.startIn + s.depthIn),
        0,
      );
      shelves.push({
        startIn: rearEnd,
        depthIn: item.depthIn,
        groundItems: [
          {
            item,
            xIn: 0,
            layer: 0,
            baseGroundIndex: null,
            isManual: false,
          },
        ],
        stackedItems: [],
      });
    }
  }

  // Render in front-to-rear order regardless of insertion order.
  shelves.sort((a, b) => a.startIn - b.startIn);

  const totalLengthIn = shelves.reduce(
    (max, s) => Math.max(max, s.startIn + s.depthIn),
    0,
  );
  return { shelves, unplaced, totalLengthIn, totalWeightLb };
}

// ----- Convenience wrapper -----------------------------------------------

export type VendorForPacking = {
  id: string;
  vendorInput: VendorInput;
  weightOverride: number | null;
  canBeBase?: boolean | null; // override: "let other gear stack on top of mine"
  // Sparse: index = itemIndex within the vendor expansion; null = auto-pack
  manualPlacements?: (ManualPlacement | null)[];
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
        manualPlacements: v.manualPlacements,
      }),
    );
  }
  return packLoad(allItems, truck);
}
