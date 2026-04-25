import { describe, expect, it } from "vitest";
import {
  computeVendorLinearFeet,
  computeVendorPacking,
  computeVendorWeight,
  cubicFeetToLinearFeet,
  effectiveLengthFt,
  footprintToLinearFeet,
  packItems,
  type CaseDimensions,
  type TruckCrossSection,
  type VendorInput,
} from "@/lib/packing";
import { TRUCK_PRESETS, truckCrossSection } from "@/lib/trucks";

const TRUCK_26 = truckCrossSection(TRUCK_PRESETS["26ft_penske"]);
const TRUCK_53 = truckCrossSection(TRUCK_PRESETS["53ft_semi"]);

const PELICAN_1620: CaseDimensions = { depthIn: 28, widthIn: 21, heightIn: 13 };
const PELICAN_1510: CaseDimensions = { depthIn: 22, widthIn: 14, heightIn: 9 };

describe("truck cross-sections (sanity)", () => {
  it("26ft Penske is 97in wide x 103in tall", () => {
    expect(TRUCK_26.widthIn).toBeCloseTo(97, 1);
    expect(TRUCK_26.heightIn).toBeCloseTo(103, 1);
  });

  it("53ft semi is 99in wide x 108in tall", () => {
    expect(TRUCK_53.widthIn).toBeCloseTo(99, 1);
    expect(TRUCK_53.heightIn).toBeCloseTo(108, 1);
  });
});

describe("packItems - canonical scenarios from CLAUDE.md", () => {
  it("8 Pelican 1620s, floor-only, 26ft truck => 4.7 linear ft (4 across x 2 rows)", () => {
    const r = packItems({
      case: PELICAN_1620,
      quantity: 8,
      truck: TRUCK_26,
      stack: { stackable: false, maxStack: 1 },
    });
    expect(r.perRow).toBe(4);
    expect(r.layers).toBe(1);
    expect(r.rows).toBe(2);
    expect(r.linearFt).toBeCloseTo(4.667, 2);
  });

  it("24 Pelican 1510s, stackable max 6, 26ft truck => 1.83 linear ft (6 across x 6 high x 1 row)", () => {
    const r = packItems({
      case: PELICAN_1510,
      quantity: 24,
      truck: TRUCK_26,
      stack: { stackable: true, maxStack: 6 },
    });
    expect(r.perRow).toBe(6);
    expect(r.layers).toBe(6);
    expect(r.rows).toBe(1);
    expect(r.linearFt).toBeCloseTo(1.833, 2);
  });

  it("2 standard pallets (48x40), floor-only, 26ft truck => 4 linear ft (2 across x 1 row)", () => {
    const r = packItems({
      case: { depthIn: 48, widthIn: 40, heightIn: 48 },
      quantity: 2,
      truck: TRUCK_26,
      stack: { stackable: false, maxStack: 1 },
    });
    expect(r.perRow).toBe(2);
    expect(r.layers).toBe(1);
    expect(r.rows).toBe(1);
    expect(r.linearFt).toBe(4);
  });
});

describe("packItems - edge cases", () => {
  it("zero quantity returns empty packing", () => {
    const r = packItems({
      case: PELICAN_1620,
      quantity: 0,
      truck: TRUCK_26,
      stack: { stackable: true, maxStack: 5 },
    });
    expect(r.linearFt).toBe(0);
    expect(r.rows).toBe(0);
  });

  it("zero-dim case returns empty packing", () => {
    const r = packItems({
      case: { depthIn: 0, widthIn: 21, heightIn: 13 },
      quantity: 8,
      truck: TRUCK_26,
      stack: { stackable: false, maxStack: 1 },
    });
    expect(r.linearFt).toBe(0);
  });

  it("perRow is at least 1 even when item is wider than truck", () => {
    const r = packItems({
      case: { depthIn: 48, widthIn: 200, heightIn: 12 }, // wider than any truck
      quantity: 1,
      truck: TRUCK_26,
      stack: { stackable: false, maxStack: 1 },
    });
    expect(r.perRow).toBe(1);
    expect(r.rows).toBe(1);
    expect(r.linearFt).toBe(4);
  });

  it("stack layers are clamped by physical truck height", () => {
    // 30in tall items in 103in tall truck: physically fits 3, even if maxStack says 10.
    const r = packItems({
      case: { depthIn: 24, widthIn: 24, heightIn: 30 },
      quantity: 12,
      truck: TRUCK_26,
      stack: { stackable: true, maxStack: 10 },
    });
    expect(r.perRow).toBe(4); // floor(97/24) = 4
    expect(r.layers).toBe(3); // floor(103/30) = 3
    expect(r.rows).toBe(1); // 12 fits in 4*3=12 cross-section
  });

  it("non-integer quantities floor down (you can't ship 2.7 cases)", () => {
    const r = packItems({
      case: PELICAN_1620,
      quantity: 8.7,
      truck: TRUCK_26,
      stack: { stackable: false, maxStack: 1 },
    });
    expect(r.rows).toBe(2); // 8 items, not 9
  });

  it("53ft semi packs more across than 26ft truck for the same Pelican", () => {
    // Floor-only so the perRow difference (6 vs 7) actually drives the
    // row count instead of being absorbed by a generous stacked cross-section.
    const small = packItems({
      case: PELICAN_1510,
      quantity: 100,
      truck: TRUCK_26,
      stack: { stackable: false, maxStack: 1 },
    });
    const big = packItems({
      case: PELICAN_1510,
      quantity: 100,
      truck: TRUCK_53,
      stack: { stackable: false, maxStack: 1 },
    });
    expect(small.perRow).toBe(6); // floor(97/14)
    expect(big.perRow).toBe(7); // floor(99/14)
    expect(small.rows).toBe(17); // ceil(100/6)
    expect(big.rows).toBe(15); // ceil(100/7)
    expect(big.linearFt).toBeLessThan(small.linearFt);
  });
});

describe("conversions", () => {
  it("cubic feet to linear feet uses 8x8 cross-section (640 cuft = 10 ft)", () => {
    expect(cubicFeetToLinearFeet(640)).toBe(10);
    expect(cubicFeetToLinearFeet(1700)).toBeCloseTo(26.5625, 4);
  });

  it("footprint to linear feet uses 8ft truck width (32 sqft = 4 ft)", () => {
    expect(footprintToLinearFeet(32)).toBe(4);
  });

  it("negative inputs clamp to zero", () => {
    expect(cubicFeetToLinearFeet(-50)).toBe(0);
    expect(footprintToLinearFeet(-10)).toBe(0);
  });
});

describe("computeVendorPacking - dispatcher", () => {
  it("'linear' passes the value straight through", () => {
    const r = computeVendorPacking({ method: "linear", linearFt: 12.5 }, TRUCK_26);
    expect(r.linearFt).toBe(12.5);
  });

  it("'cubic' converts via /64", () => {
    const r = computeVendorPacking({ method: "cubic", cubicFt: 320 }, TRUCK_26);
    expect(r.linearFt).toBe(5);
  });

  it("'footprint' converts via /8", () => {
    const r = computeVendorPacking(
      { method: "footprint", squareFt: 24 },
      TRUCK_26,
    );
    expect(r.linearFt).toBe(3);
  });

  it("'image' passes the estimated value through", () => {
    const r = computeVendorPacking(
      { method: "image", estimatedLinearFt: 7.5 },
      TRUCK_26,
    );
    expect(r.linearFt).toBe(7.5);
  });

  it("'dimensions' defaults stackable=true for short items (<18in tall)", () => {
    const r = computeVendorPacking(
      {
        method: "dimensions",
        depthIn: 22,
        widthIn: 14,
        heightIn: 9,
        quantity: 24,
      },
      TRUCK_26,
    );
    // Same as 24 Pelican 1510s: 6 across x 6 high (capped by maxStack=6) x 1 row
    expect(r.layers).toBe(6);
    expect(r.linearFt).toBeCloseTo(1.833, 2);
  });

  it("'dimensions' defaults stackable=false for tall items (>=18in tall)", () => {
    const r = computeVendorPacking(
      {
        method: "dimensions",
        depthIn: 30,
        widthIn: 22,
        heightIn: 24,
        quantity: 4,
      },
      TRUCK_26,
    );
    expect(r.layers).toBe(1);
  });

  it("'dimensions' explicit stackable=false overrides the short-item default", () => {
    const r = computeVendorPacking(
      {
        method: "dimensions",
        depthIn: 22,
        widthIn: 14,
        heightIn: 9,
        quantity: 24,
        stackable: false,
      },
      TRUCK_26,
    );
    expect(r.layers).toBe(1);
  });

  it("'pallets' defaults to floor-only", () => {
    const r = computeVendorPacking({ method: "pallets", quantity: 4 }, TRUCK_26);
    // 2 across, 1 layer, 2 rows -> 8 ft
    expect(r.perRow).toBe(2);
    expect(r.layers).toBe(1);
    expect(r.rows).toBe(2);
    expect(r.linearFt).toBe(8);
  });

  it("'pallets' with stackable=true enables max-2 stacking", () => {
    const r = computeVendorPacking(
      { method: "pallets", quantity: 4, stackable: true },
      TRUCK_26,
    );
    // 2 across x 2 high = 4 per cross-section, 1 row -> 4 ft
    expect(r.layers).toBe(2);
    expect(r.linearFt).toBe(4);
  });

  it("'pieces' uses the case's defaultStackable when override is null", () => {
    const input: VendorInput = {
      method: "pieces",
      case: { depthIn: 28, widthIn: 21, heightIn: 13, weightLb: 30 },
      defaultStackable: true,
      defaultMaxStack: 5,
      quantity: 8,
    };
    const r = computeVendorPacking(input, TRUCK_26);
    // Stacked Pelican 1620s: 4 across x 5 high = 20 per cross, ceil(8/20)=1 row
    expect(r.layers).toBe(5);
    expect(r.rows).toBe(1);
  });

  it("'pieces' override stackable=false forces floor-only", () => {
    const r = computeVendorPacking(
      {
        method: "pieces",
        case: { depthIn: 28, widthIn: 21, heightIn: 13, weightLb: 30 },
        defaultStackable: true,
        defaultMaxStack: 5,
        quantity: 8,
        stackable: false,
      },
      TRUCK_26,
    );
    expect(r.layers).toBe(1);
    expect(r.linearFt).toBeCloseTo(4.667, 2);
  });

  it("computeVendorLinearFeet returns the linearFt scalar", () => {
    expect(
      computeVendorLinearFeet(
        { method: "linear", linearFt: 9.25 },
        TRUCK_26,
      ),
    ).toBe(9.25);
  });
});

describe("computeVendorWeight", () => {
  it("explicit override wins over auto-calculated piece weight", () => {
    const input: VendorInput = {
      method: "pieces",
      case: { depthIn: 28, widthIn: 21, heightIn: 13, weightLb: 30 },
      defaultStackable: true,
      defaultMaxStack: 5,
      quantity: 8,
    };
    expect(computeVendorWeight(input, 999)).toBe(999);
    expect(computeVendorWeight(input, null)).toBe(240); // 30 * 8
  });

  it("non-pieces method with no override returns 0", () => {
    const input: VendorInput = { method: "linear", linearFt: 12 };
    expect(computeVendorWeight(input, null)).toBe(0);
    expect(computeVendorWeight(input, 1500)).toBe(1500);
  });

  it("NaN override is ignored, falls back to auto", () => {
    const input: VendorInput = {
      method: "pieces",
      case: { depthIn: 28, widthIn: 21, heightIn: 13, weightLb: 30 },
      defaultStackable: true,
      defaultMaxStack: 5,
      quantity: 8,
    };
    expect(computeVendorWeight(input, Number.NaN)).toBe(240);
  });
});

describe("effectiveLengthFt - buffer math", () => {
  it("0% buffer returns the full length", () => {
    expect(effectiveLengthFt(25.92, 0)).toBe(25.92);
  });

  it("10% buffer (default) cuts the 26ft truck to ~23.3 ft", () => {
    expect(effectiveLengthFt(25.92, 10)).toBeCloseTo(23.328, 3);
  });

  it("clamps buffer to [0, 100]", () => {
    expect(effectiveLengthFt(25.92, -5)).toBe(25.92);
    expect(effectiveLengthFt(25.92, 150)).toBe(0);
  });
});
