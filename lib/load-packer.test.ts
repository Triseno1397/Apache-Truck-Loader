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

describe("packLoad - edge cases", () => {
  it("item wider than truck is unplaced", () => {
    const items: PackableItem[] = [
      {
        vendorId: "v",
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
