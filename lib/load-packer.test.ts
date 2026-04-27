import { describe, expect, it } from "vitest";
import {
  expandVendorToItems,
  packLoad,
  packVendors,
  type PackableItem,
} from "@/lib/load-packer";
import { TRUCK_PRESETS, truckCrossSection } from "@/lib/trucks";
import type { VendorInput } from "@/lib/packing";

const TRUCK_26 = truckCrossSection(TRUCK_PRESETS["26ft_penske"]);

const PALLET_INPUT = (qty: number, stackable = false): VendorInput => ({
  method: "pallets",
  quantity: qty,
  stackable,
});

const PELICAN_1620: VendorInput = {
  method: "pieces",
  case: { depthIn: 28, widthIn: 21, heightIn: 13, weightLb: 30 },
  defaultStackable: true,
  defaultMaxStack: 5,
  quantity: 8,
};

describe("expandVendorToItems", () => {
  it("3 pallets becomes 3 items", () => {
    const items = expandVendorToItems({
      vendorId: "v1",
      vendorInput: PALLET_INPUT(3),
      weightOverride: 1500,
      truck: TRUCK_26,
    });
    expect(items).toHaveLength(3);
    expect(items[0].depthIn).toBe(48);
    expect(items[0].widthIn).toBe(40);
    expect(items[0].weightLb).toBe(500); // 1500 / 3
  });

  it("8 Pelican 1620s as pieces becomes 8 items, weight from preset", () => {
    const items = expandVendorToItems({
      vendorId: "v1",
      vendorInput: PELICAN_1620,
      weightOverride: null,
      truck: TRUCK_26,
    });
    expect(items).toHaveLength(8);
    expect(items[0].depthIn).toBe(28);
    expect(items[0].weightLb).toBe(30);
  });

  it("approximate methods (linear/cubic/footprint/image) generate one bulk item full-width", () => {
    const linear = expandVendorToItems({
      vendorId: "v1",
      vendorInput: { method: "linear", linearFt: 10 },
      weightOverride: 200,
      truck: TRUCK_26,
    });
    expect(linear).toHaveLength(1);
    expect(linear[0].isBulk).toBe(true);
    expect(linear[0].depthIn).toBe(120); // 10 ft
    expect(linear[0].widthIn).toBe(TRUCK_26.widthIn);
    expect(linear[0].weightLb).toBe(200);

    const cubic = expandVendorToItems({
      vendorId: "v2",
      vendorInput: { method: "cubic", cubicFt: 320 },
      weightOverride: null,
      truck: TRUCK_26,
    });
    expect(cubic[0].depthIn).toBe(60); // 320 / 64 = 5 ft
  });

  it("returns empty array for zero quantity", () => {
    const items = expandVendorToItems({
      vendorId: "v1",
      vendorInput: PALLET_INPUT(0),
      weightOverride: null,
      truck: TRUCK_26,
    });
    expect(items).toHaveLength(0);
  });
});

describe("packLoad - the user's example case", () => {
  it("3 pallets in a 26ft truck pack into 2 shelves (2 ground + 1 ground in row 2) = 96in / 8ft", () => {
    const items = expandVendorToItems({
      vendorId: "pallet-vendor",
      vendorInput: PALLET_INPUT(3),
      weightOverride: 1500,
      truck: TRUCK_26,
    });
    const result = packLoad(items, TRUCK_26);
    expect(result.shelves).toHaveLength(2);
    expect(result.shelves[0].groundItems).toHaveLength(2);
    expect(result.shelves[1].groundItems).toHaveLength(1);
    expect(result.totalLengthIn).toBe(96);
    expect(result.unplaced).toHaveLength(0);
  });

  it("3 pallets + 2 Pelican 1620s with pallets NOT serving as bases - pelicans share row 2 ground", () => {
    // Demonstrates GROUND sharing across vendors: with canBeBase explicitly
    // disabled on the pallet vendor, the Pelicans can't stack on the pallets
    // and instead drop into the half-empty row 2 next to the 3rd pallet.
    // Total still stays 96in (the user's point about no new rows).
    const result = packVendors(
      [
        {
          id: "pallet-vendor",
          vendorInput: PALLET_INPUT(3),
          weightOverride: null,
          canBeBase: false, // override: don't let pelicans land on top
        },
        {
          id: "pelican-vendor",
          vendorInput: { ...PELICAN_1620, quantity: 2 },
          weightOverride: null,
        },
      ],
      TRUCK_26,
    );
    expect(result.totalLengthIn).toBe(96);
    expect(result.shelves).toHaveLength(2);
    const shelf2Vendors = new Set(
      result.shelves[1].groundItems.map((p) => p.item.vendorId),
    );
    expect(shelf2Vendors).toContain("pallet-vendor");
    expect(shelf2Vendors).toContain("pelican-vendor");
  });

  it("3 pallets + 2 Pelican 1620s with default canBeBase=true on pallets - pelicans STACK on the pallets", () => {
    // Real-world default: pallets ARE bases (you stack things on pallets all
    // the time). With no explicit override, Pelicans land ON TOP of the
    // pallets in row 1 - even more space-efficient than ground sharing.
    const result = packVendors(
      [
        {
          id: "pallet-vendor",
          vendorInput: PALLET_INPUT(3),
          weightOverride: null,
          // no canBeBase override -> defaults to true for pallets
        },
        {
          id: "pelican-vendor",
          vendorInput: { ...PELICAN_1620, quantity: 2 },
          weightOverride: null,
        },
      ],
      TRUCK_26,
    );
    expect(result.totalLengthIn).toBe(96);
    // Pelicans landed as STACKED items, not new ground placements
    const allStacked = result.shelves.flatMap((s) => s.stackedItems);
    const pelicansOnTop = allStacked.filter(
      (p) => p.item.vendorId === "pelican-vendor",
    );
    expect(pelicansOnTop).toHaveLength(2);
  });
});

describe("packLoad - canonical scenarios from CLAUDE.md", () => {
  it("8 Pelican 1620s alone, NOT stackable, packs into 4-across x 2 rows = 56in / 4.67 ft", () => {
    const items = expandVendorToItems({
      vendorId: "v",
      vendorInput: {
        ...PELICAN_1620,
        quantity: 8,
        stackable: false,
      },
      weightOverride: null,
      truck: TRUCK_26,
    });
    const r = packLoad(items, TRUCK_26);
    expect(r.shelves).toHaveLength(2);
    expect(r.totalLengthIn).toBe(56);
  });

  it("8 Pelican 1620s with stacking enabled fits in 1 shelf (4 ground + 4 stacked) = 28in / 2.33 ft", () => {
    const items = expandVendorToItems({
      vendorId: "v",
      vendorInput: { ...PELICAN_1620, quantity: 8, stackable: true },
      weightOverride: null,
      truck: TRUCK_26,
    });
    const r = packLoad(items, TRUCK_26);
    expect(r.shelves).toHaveLength(1);
    expect(r.shelves[0].groundItems).toHaveLength(4);
    expect(r.shelves[0].stackedItems).toHaveLength(4);
    expect(r.totalLengthIn).toBe(28);
  });

  it("24 Pelican 1510s stacked max 6: 6 across x 6 high x 1 row = 22in / 1.83ft", () => {
    const items = expandVendorToItems({
      vendorId: "v",
      vendorInput: {
        method: "pieces",
        case: { depthIn: 22, widthIn: 14, heightIn: 9, weightLb: 14 },
        defaultStackable: true,
        defaultMaxStack: 6,
        quantity: 24,
      },
      weightOverride: null,
      truck: TRUCK_26,
    });
    const r = packLoad(items, TRUCK_26);
    expect(r.shelves).toHaveLength(1);
    expect(r.shelves[0].groundItems).toHaveLength(6);
    expect(r.shelves[0].stackedItems).toHaveLength(18);
    expect(r.totalLengthIn).toBe(22);
  });
});

describe("packLoad - cross-vendor STACKING (small items on top of big bases)", () => {
  it("Pelican 1510s from one vendor stack on road cases from another vendor", () => {
    // Vendor A: 4 medium road cases (36 x 26 x 22, stackable max 3)
    // Vendor B: 6 small Pelican 1510s (22 x 14 x 9, stackable max 6)
    //
    // Road cases sort first (deeper). They open shelf depth=36 and pack
    // 3 across (78in used of 97in available, 19in remaining width). The
    // 4th road case can't ground-fit (26in needed, 19in left), but it
    // can stack on case1 (max 3). Pelicans then stack on the road cases
    // from underneath - same shelf, different vendor, smaller dims.
    const r = packVendors(
      [
        {
          id: "cases-vendor",
          vendorInput: {
            method: "pieces",
            case: { depthIn: 36, widthIn: 26, heightIn: 22, weightLb: 60 },
            defaultStackable: true,
            defaultMaxStack: 3,
            quantity: 4,
          },
          weightOverride: null,
        },
        {
          id: "pelican-vendor",
          vendorInput: {
            method: "pieces",
            case: { depthIn: 22, widthIn: 14, heightIn: 9, weightLb: 14 },
            defaultStackable: true,
            defaultMaxStack: 6,
            quantity: 6,
          },
          weightOverride: null,
        },
      ],
      TRUCK_26,
    );
    // Should pack into a single shelf (depth=36, set by the road cases)
    // with everything fitting via stacking + ground sharing.
    expect(r.shelves).toHaveLength(1);
    expect(r.totalLengthIn).toBe(36);

    // Confirm Pelicans are physically stacked (not just placed on ground)
    const pelicanStacked = r.shelves[0].stackedItems.filter(
      (p) => p.item.vendorId === "pelican-vendor",
    );
    expect(pelicanStacked.length).toBeGreaterThan(0);
  });

  it("3 wide cases fill the ground; Pelicans MUST stack on the cases (no row 2)", () => {
    // 3 wide cases (depth 36 x width 32 x height 22, stackable max 3):
    // pack 3-across in 1 shelf at depth 36. Width used = 96 of 97 - the
    // ground is effectively full (1in remaining, no Pelican fits).
    //
    // Then 4 small Pelicans (depth 22 x width 14 x height 9, stackable
    // max 6): no ground room anywhere, but the cases are stackable.
    // Pelicans ride on top of the cases - the truck length stays at
    // 36in / 3 ft instead of opening a brand-new row for the Pelicans.
    const r = packVendors(
      [
        {
          id: "cases",
          vendorInput: {
            method: "pieces",
            case: { depthIn: 36, widthIn: 32, heightIn: 22, weightLb: 60 },
            defaultStackable: true,
            defaultMaxStack: 3,
            quantity: 3,
          },
          weightOverride: null,
        },
        {
          id: "pelicans",
          vendorInput: {
            method: "pieces",
            case: { depthIn: 22, widthIn: 14, heightIn: 9, weightLb: 14 },
            defaultStackable: true,
            defaultMaxStack: 6,
            quantity: 4,
          },
          weightOverride: null,
        },
      ],
      TRUCK_26,
    );
    expect(r.shelves).toHaveLength(1);
    expect(r.totalLengthIn).toBe(36); // ZERO additional rows for the Pelicans
    expect(r.shelves[0].groundItems).toHaveLength(3); // 3 cases on the floor

    // All 4 Pelicans landed as STACKED items, not ground placements.
    const pelicansOnTop = r.shelves[0].stackedItems.filter(
      (p) => p.item.vendorId === "pelicans",
    );
    expect(pelicansOnTop).toHaveLength(4);
  });
});

describe("packLoad - cross-vendor sharing pays off", () => {
  it("smart packing beats naive sum on a mixed load", () => {
    // 2 pallets + 4 Pelican 1620s
    // Naive: pallets = 1 row * 4ft = 4ft (full width row 1). Pelicans = 1 row * 28in = 28in.
    //   Naive sum: 48 + 28 = 76 in.
    // Smart: pallets fill row 1 (48 in deep) at width 80, leaving 17 in width.
    //   Pelican width 21 doesn't fit in 17. So Pelicans open row 2 (28 in deep)
    //   and fit 4 across.
    //   Total: 48 + 28 = 76 in.
    // (Same here because the gap left by 2 pallets is too narrow for a Pelican.)
    const r = packVendors(
      [
        {
          id: "p",
          vendorInput: PALLET_INPUT(2),
          weightOverride: null,
        },
        {
          id: "k",
          vendorInput: {
            ...PELICAN_1620,
            quantity: 4,
            stackable: false,
          },
          weightOverride: null,
        },
      ],
      TRUCK_26,
    );
    expect(r.totalLengthIn).toBe(76);

    // Now the case that proves cross-vendor matters: 3 pallets + 2 Pelicans.
    // Row 2 has 1 pallet (40 in wide) leaving 57 in - 2 Pelicans (21 ea) fit there.
    const r2 = packVendors(
      [
        {
          id: "p",
          vendorInput: PALLET_INPUT(3),
          weightOverride: null,
        },
        {
          id: "k",
          vendorInput: {
            ...PELICAN_1620,
            quantity: 2,
            stackable: false,
          },
          weightOverride: null,
        },
      ],
      TRUCK_26,
    );
    expect(r2.totalLengthIn).toBe(96); // 8 ft, NOT 96+28
  });
});

describe("multi-truck per job - independent packing", () => {
  // The data model splits vendors across N trucks; each truck packs
  // independently with its own truckCrossSection. Totals roll up by
  // summing per-truck LoadResult fields. These tests guard the contract.
  it("splitting vendors across two trucks packs each independently and sums clean", () => {
    // Together on ONE truck: 3 pallets + 2 Pelican 1620s -> 96in (the
    // pelicans share row 2 with the 3rd pallet, no new row opened).
    const oneTruck = packVendors(
      [
        { id: "p", vendorInput: PALLET_INPUT(3), weightOverride: null, canBeBase: false },
        {
          id: "k",
          vendorInput: { ...PELICAN_1620, quantity: 2, stackable: false },
          weightOverride: null,
        },
      ],
      TRUCK_26,
    );
    expect(oneTruck.totalLengthIn).toBe(96);

    // Split across two trucks: pallets on truck A, pelicans on truck B.
    // - Truck A: 3 pallets only -> 96in (2 rows: 2 pallets + 1 pallet)
    // - Truck B: 2 pelicans only -> 28in (1 row, 4 across capacity)
    // Roll-up: 96 + 28 = 124in. The penalty for splitting is the
    // 28in that previously shared a row on the single truck.
    const truckA = packVendors(
      [{ id: "p", vendorInput: PALLET_INPUT(3), weightOverride: null }],
      TRUCK_26,
    );
    const truckB = packVendors(
      [
        {
          id: "k",
          vendorInput: { ...PELICAN_1620, quantity: 2, stackable: false },
          weightOverride: null,
        },
      ],
      TRUCK_26,
    );
    expect(truckA.totalLengthIn).toBe(96);
    expect(truckB.totalLengthIn).toBe(28);
    expect(truckA.totalLengthIn + truckB.totalLengthIn).toBe(124);
  });

  it("a truck with no vendors packs to a zero-length, no-shelf load", () => {
    const empty = packVendors([], TRUCK_26);
    expect(empty.shelves).toHaveLength(0);
    expect(empty.totalLengthIn).toBe(0);
    expect(empty.totalWeightLb).toBe(0);
    expect(empty.unplaced).toHaveLength(0);
  });

  it("weight rolls up across trucks", () => {
    const a = packVendors(
      [{ id: "p", vendorInput: PALLET_INPUT(2), weightOverride: 1000 }],
      TRUCK_26,
    );
    const b = packVendors(
      [{ id: "k", vendorInput: { ...PELICAN_1620, quantity: 4 }, weightOverride: null }],
      TRUCK_26,
    );
    expect(a.totalWeightLb + b.totalWeightLb).toBe(1000 + 4 * 30);
  });
});

describe("manual placements - drag-anchored items", () => {
  it("a single manual pallet placement creates a locked shelf at the snapped xIn", () => {
    const r = packVendors(
      [
        {
          id: "p",
          vendorInput: PALLET_INPUT(1),
          weightOverride: null,
          // user dragged the pallet to ~80" from the front, ~10" from the wall
          manualPlacements: [{ xIn: 80, yIn: 10 }],
        },
      ],
      TRUCK_26,
    );
    // 80 snaps to 78 (6"-grid)... actually 80/6=13.33 -> round to 13 -> 78
    expect(r.shelves).toHaveLength(1);
    expect(r.shelves[0].startIn).toBe(78);
    expect(r.shelves[0].depthIn).toBe(48); // pallet depth
    expect(r.shelves[0].groundItems).toHaveLength(1);
    expect(r.shelves[0].groundItems[0].isManual).toBe(true);
    // 10 snaps to 12 (10/6=1.67 -> round to 2 -> 12)
    expect(r.shelves[0].groundItems[0].xIn).toBe(12);
    // totalLengthIn = startIn + depthIn for the rearmost shelf
    expect(r.totalLengthIn).toBe(126);
  });

  it("auto items share the manual shelf when there's width room, then open new shelf in the front gap", () => {
    // 1 pallet manually anchored at xIn=120 yIn=0, plus 2 more pallets auto-packed.
    // - Auto pallet #1 fits in the manual shelf's free width (97-40=57 >= 40).
    // - Auto pallet #2 has no width room left in the manual shelf, so it
    //   opens a new shelf in the FRONT gap (0..120, plenty for a 48"-deep
    //   pallet). This is the smart-fill fix - older code dumped it at the
    //   rear (startIn=168) even with all that empty length in front.
    const r = packVendors(
      [
        {
          id: "p",
          vendorInput: PALLET_INPUT(3),
          weightOverride: null,
          manualPlacements: [{ xIn: 120, yIn: 0 }], // pallet #1 anchored
        },
      ],
      TRUCK_26,
    );
    expect(r.shelves).toHaveLength(2);
    const manualShelf = r.shelves.find((s) => s.startIn === 120)!;
    const autoShelf = r.shelves.find((s) => s.startIn === 0)!;
    expect(manualShelf.groundItems).toHaveLength(2);
    expect(manualShelf.groundItems.filter((g) => g.isManual)).toHaveLength(1);
    expect(manualShelf.groundItems.filter((g) => !g.isManual)).toHaveLength(1);
    expect(autoShelf.groundItems).toHaveLength(1);
    expect(autoShelf.groundItems[0].isManual).toBe(false);
    // total length = max(autoShelf end, manualShelf end) = max(48, 168) = 168
    expect(r.totalLengthIn).toBe(168);
  });

  it("anchoring an item near the back fills the FRONT before pushing past it", () => {
    // The actual user-reported bug: 1 anchored pallet at the back, plus
    // 4 more pallets to auto-pack. Old behavior pushed all 4 BEHIND the
    // manual one (rear-end opens). New behavior fills the front gap first.
    const r = packVendors(
      [
        {
          id: "p",
          vendorInput: PALLET_INPUT(5),
          weightOverride: null,
          // anchor #1 deep into the truck (240" of a 311" truck)
          manualPlacements: [{ xIn: 240, yIn: 0 }],
        },
      ],
      TRUCK_26,
    );
    // After packing, every shelf's startIn should be < 240 except the
    // manual one - i.e. nothing got dumped behind the anchor.
    const startIns = r.shelves.map((s) => s.startIn).sort((a, b) => a - b);
    const manualShelfStart = 240;
    expect(startIns).toContain(manualShelfStart);
    const autoStarts = startIns.filter((s) => s !== manualShelfStart);
    expect(autoStarts.every((s) => s < manualShelfStart)).toBe(true);
    // Total length should NOT exceed manualShelf end (240+48=288).
    expect(r.totalLengthIn).toBeLessThanOrEqual(288);
  });

  it("auto item drops into the y-gap left by a manual item in the same shelf", () => {
    // Manual Pelican at the FAR side (yIn=80, width 21 -> occupies y 78..99... but
    // truck width is 97, so snapped to fit). Auto Pelican should drop at the
    // near wall (yIn=0).
    const PELICAN_DEEP_FOR_SHELF = {
      ...PELICAN_1620,
      quantity: 2,
      stackable: false,
    };
    const r = packVendors(
      [
        {
          id: "k",
          vendorInput: PELICAN_DEEP_FOR_SHELF,
          weightOverride: null,
          manualPlacements: [{ xIn: 0, yIn: 60 }], // pelican #1 anchored to passenger side
        },
      ],
      TRUCK_26,
    );
    // Manual at startIn=0, manual item snapped to yIn=60. Auto Pelican
    // drops in at yIn=0 (left of the manual one) since the gap [0..60]
    // is wide enough for a 21in-wide Pelican.
    expect(r.shelves).toHaveLength(1);
    expect(r.shelves[0].groundItems).toHaveLength(2);
    const sortedByY = [...r.shelves[0].groundItems].sort(
      (a, b) => a.xIn - b.xIn,
    );
    expect(sortedByY[0].xIn).toBe(0);
    expect(sortedByY[0].isManual).toBe(false);
    expect(sortedByY[1].xIn).toBe(60);
    expect(sortedByY[1].isManual).toBe(true);
  });

  it("manual placements snap xIn / yIn to the 6-inch grid", () => {
    const r = packVendors(
      [
        {
          id: "p",
          vendorInput: PALLET_INPUT(1),
          weightOverride: null,
          manualPlacements: [{ xIn: 17, yIn: 4 }], // not on a 6" boundary
        },
      ],
      TRUCK_26,
    );
    // 17/6 = 2.83 -> round 3 -> 18. 4/6 = 0.67 -> round 1 -> 6.
    expect(r.shelves[0].startIn).toBe(18);
    expect(r.shelves[0].groundItems[0].xIn).toBe(6);
  });

  it("no manual placements -> auto-packer behaves identically to before", () => {
    // Sanity check: existing scenario produces same result whether we
    // pass manualPlacements: [] or omit the field entirely.
    const a = packVendors(
      [
        {
          id: "p",
          vendorInput: PALLET_INPUT(3),
          weightOverride: null,
          canBeBase: false,
        },
      ],
      TRUCK_26,
    );
    const b = packVendors(
      [
        {
          id: "p",
          vendorInput: PALLET_INPUT(3),
          weightOverride: null,
          canBeBase: false,
          manualPlacements: [],
        },
      ],
      TRUCK_26,
    );
    expect(b.totalLengthIn).toBe(a.totalLengthIn);
    expect(b.shelves.length).toBe(a.shelves.length);
  });
});

describe("packLoad - edge cases", () => {
  it("item wider than truck is unplaced", () => {
    const items: PackableItem[] = [
      {
        vendorId: "v",
        itemIndex: 0,
        depthIn: 24,
        widthIn: 200, // wider than 97in truck
        heightIn: 24,
        weightLb: 0,
        stackable: false,
        canBeBase: false,
        maxStack: 1,
        isBulk: false,
      },
    ];
    const r = packLoad(items, TRUCK_26);
    expect(r.unplaced).toHaveLength(1);
    expect(r.shelves).toHaveLength(0);
    expect(r.totalLengthIn).toBe(0);
  });

  it("bulk vendors block sharing - they always own their full-width row", () => {
    const r = packVendors(
      [
        {
          id: "a",
          vendorInput: { method: "linear", linearFt: 5 },
          weightOverride: null,
        },
        {
          id: "b",
          vendorInput: PALLET_INPUT(2),
          weightOverride: null,
        },
      ],
      TRUCK_26,
    );
    // Bulk linearFt=5 -> 60in deep, full width. Pallets (48 deep) get their own row.
    // Two separate full-width rows: 60 + 48 = 108in.
    expect(r.totalLengthIn).toBe(108);
    expect(r.shelves).toHaveLength(2);
  });

  it("totalWeightLb sums all items (across vendors)", () => {
    const r = packVendors(
      [
        {
          id: "a",
          vendorInput: PALLET_INPUT(2),
          weightOverride: 1000, // 500/pallet
        },
        {
          id: "b",
          vendorInput: { ...PELICAN_1620, quantity: 4 },
          weightOverride: null, // 30 ea from preset
        },
      ],
      TRUCK_26,
    );
    expect(r.totalWeightLb).toBe(1000 + 4 * 30);
  });
});
