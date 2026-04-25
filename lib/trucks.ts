// Truck presets and helpers. Custom org-defined trucks live in the
// `custom_trucks` table and are loaded at runtime; the two presets
// here cover the dominant Apache fleet (26ft Penske + 53ft semi).

import type { TruckCrossSection } from "@/lib/packing";

export type TruckPresetId = "26ft_penske" | "53ft_semi";

export type TruckSpec = {
  id: TruckPresetId | "custom";
  label: string;
  shortLabel: string;
  interiorLengthFt: number;
  interiorWidthFt: number;
  interiorHeightFt: number;
  cubicFeet: number;
  cargoWeightLb: number;
  hasLiftgate: boolean;
  liftgateLb: number | null;
};

export const TRUCK_PRESETS: Record<TruckPresetId, TruckSpec> = {
  "26ft_penske": {
    id: "26ft_penske",
    label: "26ft Penske Box Truck",
    shortLabel: "26ft Box",
    interiorLengthFt: 25.92,
    interiorWidthFt: 8.08, // 97 inches
    interiorHeightFt: 8.58, // 103 inches
    cubicFeet: 1700,
    cargoWeightLb: 10000,
    hasLiftgate: true,
    liftgateLb: 3000,
  },
  "53ft_semi": {
    id: "53ft_semi",
    label: "53ft Semi Trailer",
    shortLabel: "53ft Semi",
    interiorLengthFt: 52.5,
    interiorWidthFt: 8.25, // 99 inches
    interiorHeightFt: 9.0, // 108 inches
    cubicFeet: 4054,
    cargoWeightLb: 43000,
    hasLiftgate: false,
    liftgateLb: null,
  },
};

export function truckCrossSection(
  truck: Pick<TruckSpec, "interiorWidthFt" | "interiorHeightFt">,
): TruckCrossSection {
  return {
    widthIn: truck.interiorWidthFt * 12,
    heightIn: truck.interiorHeightFt * 12,
  };
}
