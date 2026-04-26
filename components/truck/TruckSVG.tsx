// Top-view truck visualization. Front of the truck on the LEFT, rear
// (doors / liftgate) on the RIGHT. Items render in their actual packed
// positions inside the cargo box - users SEE the gaps where future
// vendors can slot in.
//
// Box truck (26ft Penske): cab + cargo box are one contiguous shape.
// Semi (53ft): tractor + 5th-wheel gap + trailer.

import type { TruckSpec } from "@/lib/trucks";
import type { LoadResult, Shelf } from "@/lib/load-packer";

type Props = {
  truck: TruckSpec;
  load: LoadResult;
  vendorColors: Map<string, string>;
  vendorNames: Map<string, string>;
};

const PX_PER_FT = 18;
const PX_PER_IN = PX_PER_FT / 12;
const VIEWBOX_W = 1200;
const VIEWBOX_H = 240;

function fillColorFor(pct: number): string {
  if (pct > 1.0) return "#dc2626";
  if (pct > 0.95) return "#ff7302";
  if (pct > 0.75) return "#ffa902";
  return "#0e3e7a";
}

export default function TruckSVG({
  truck,
  load,
  vendorColors,
  vendorNames,
}: Props) {
  const truckLengthIn = truck.interiorLengthFt * 12;
  const fillPercent = load.totalLengthIn / truckLengthIn;
  const overColor = fillColorFor(fillPercent);
  const isSemi = truck.id === "53ft_semi";

  return (
    <svg
      viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
      className="w-full h-auto"
      style={{ maxHeight: "240px" }}
      role="img"
      aria-label={`${truck.label}, ${(fillPercent * 100).toFixed(0)}% full (top view)`}
    >
      <defs>
        <pattern
          id="truck-grid"
          width="20"
          height="20"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M 20 0 L 0 0 0 20"
            fill="none"
            stroke="#e6e8eb"
            strokeWidth="0.5"
          />
        </pattern>
      </defs>
      {isSemi ? (
        <SemiTopView
          truck={truck}
          load={load}
          fillPercent={fillPercent}
          overColor={overColor}
          vendorColors={vendorColors}
          vendorNames={vendorNames}
        />
      ) : (
        <BoxTruckTopView
          truck={truck}
          load={load}
          fillPercent={fillPercent}
          overColor={overColor}
          vendorColors={vendorColors}
          vendorNames={vendorNames}
        />
      )}
    </svg>
  );
}

type ShapeProps = {
  truck: TruckSpec;
  load: LoadResult;
  fillPercent: number;
  overColor: string;
  vendorColors: Map<string, string>;
  vendorNames: Map<string, string>;
};

// ----- 26ft Penske box truck (top view) ----------------------------------

function BoxTruckTopView({
  truck,
  load,
  fillPercent,
  overColor,
  vendorColors,
  vendorNames,
}: ShapeProps) {
  const cargoLengthPx = truck.interiorLengthFt * PX_PER_FT;
  const cargoWidthPx = truck.interiorWidthFt * PX_PER_FT;
  const cabLengthPx = 80;
  const liftgateLengthPx = truck.hasLiftgate ? 32 : 0;

  const cargoY = (VIEWBOX_H - cargoWidthPx) / 2;
  const cabX = 60;
  const cargoStartX = cabX + cabLengthPx;
  const cargoEndX = cargoStartX + cargoLengthPx;
  const liftgateX = cargoEndX;
  const dimY = cargoY + cargoWidthPx + 28;

  return (
    <>
      {/* Cab */}
      <path
        d={`M ${cabX + 14} ${cargoY - 10}
            L ${cabX + cabLengthPx} ${cargoY - 10}
            L ${cabX + cabLengthPx} ${cargoY + cargoWidthPx + 10}
            L ${cabX + 14} ${cargoY + cargoWidthPx + 10}
            Q ${cabX} ${cargoY + cargoWidthPx + 10} ${cabX} ${cargoY + cargoWidthPx - 4}
            L ${cabX} ${cargoY + 4}
            Q ${cabX} ${cargoY - 10} ${cabX + 14} ${cargoY - 10} Z`}
        fill="#eff1f4"
        stroke="#9ca3af"
        strokeWidth="1.5"
      />
      <line
        x1={cabX + 22}
        y1={cargoY - 6}
        x2={cabX + 22}
        y2={cargoY + cargoWidthPx + 6}
        stroke="#272727"
        strokeWidth="1.5"
      />
      <circle cx={cabX + 4} cy={cargoY + 8} r="2.5" fill="#ffa902" />
      <circle
        cx={cabX + 4}
        cy={cargoY + cargoWidthPx - 8}
        r="2.5"
        fill="#ffa902"
      />

      {/* Cargo box (white background + grid) */}
      <rect
        x={cargoStartX}
        y={cargoY}
        width={cargoLengthPx}
        height={cargoWidthPx}
        fill="#ffffff"
        stroke="#0e3e7a"
        strokeWidth="1.5"
      />
      <rect
        x={cargoStartX + 1}
        y={cargoY + 1}
        width={cargoLengthPx - 2}
        height={cargoWidthPx - 2}
        fill="url(#truck-grid)"
      />
      {/* Centerline */}
      <line
        x1={cargoStartX}
        y1={cargoY + cargoWidthPx / 2}
        x2={cargoEndX}
        y2={cargoY + cargoWidthPx / 2}
        stroke="#e6e8eb"
        strokeWidth="0.5"
        strokeDasharray="4 4"
      />

      {/* PACKED ITEMS - the actual load layout */}
      <PackedItems
        load={load}
        cargoStartX={cargoStartX}
        cargoY={cargoY}
        cargoWidthPx={cargoWidthPx}
        truckLengthIn={truck.interiorLengthFt * 12}
        truckWidthIn={truck.interiorWidthFt * 12}
        cargoLengthPx={cargoLengthPx}
        vendorColors={vendorColors}
        vendorNames={vendorNames}
      />

      {/* Door split + liftgate */}
      <line
        x1={cargoEndX}
        y1={cargoY + 8}
        x2={cargoEndX}
        y2={cargoY + cargoWidthPx - 8}
        stroke="#272727"
        strokeWidth="0.5"
      />
      {truck.hasLiftgate && (
        <rect
          x={liftgateX}
          y={cargoY + 14}
          width={liftgateLengthPx}
          height={cargoWidthPx - 28}
          fill="#9ca3af"
          stroke="#272727"
          strokeWidth="1"
        />
      )}

      <DimensionLine
        x1={cargoStartX}
        x2={cargoEndX}
        y={dimY}
        label={`${truck.interiorLengthFt}' INTERIOR`}
      />
      <WidthLabel
        x={cargoStartX - 12}
        label={`${truck.interiorWidthFt}'`}
        cargoY={cargoY}
        cargoWidthPx={cargoWidthPx}
      />

      <text
        x={(cargoStartX + cargoEndX) / 2}
        y={cargoY - 22}
        textAnchor="middle"
        fill={overColor}
        fontSize="14"
        fontFamily="JetBrains Mono, monospace"
        fontWeight="700"
      >
        {(fillPercent * 100).toFixed(0)}%
      </text>
    </>
  );
}

// ----- 53ft Semi (top view) ----------------------------------------------

function SemiTopView({
  truck,
  load,
  fillPercent,
  overColor,
  vendorColors,
  vendorNames,
}: ShapeProps) {
  const trailerLengthPx = truck.interiorLengthFt * PX_PER_FT;
  const trailerWidthPx = truck.interiorWidthFt * PX_PER_FT;
  const tractorLengthPx = 100;
  const fifthWheelGapPx = 12;

  const trailerY = (VIEWBOX_H - trailerWidthPx) / 2;
  const tractorX = 30;
  const trailerStartX = tractorX + tractorLengthPx + fifthWheelGapPx;
  const trailerEndX = trailerStartX + trailerLengthPx;
  const dimY = trailerY + trailerWidthPx + 28;

  return (
    <>
      <path
        d={`M ${tractorX + 18} ${trailerY - 14}
            L ${tractorX + tractorLengthPx} ${trailerY - 14}
            L ${tractorX + tractorLengthPx} ${trailerY + trailerWidthPx + 14}
            L ${tractorX + 18} ${trailerY + trailerWidthPx + 14}
            Q ${tractorX} ${trailerY + trailerWidthPx + 14} ${tractorX} ${trailerY + trailerWidthPx - 4}
            L ${tractorX} ${trailerY + 4}
            Q ${tractorX} ${trailerY - 14} ${tractorX + 18} ${trailerY - 14} Z`}
        fill="#eff1f4"
        stroke="#9ca3af"
        strokeWidth="1.5"
      />
      <line
        x1={tractorX + 50}
        y1={trailerY - 12}
        x2={tractorX + 50}
        y2={trailerY + trailerWidthPx + 12}
        stroke="#9ca3af"
        strokeWidth="0.8"
      />
      <line
        x1={tractorX + 28}
        y1={trailerY - 8}
        x2={tractorX + 28}
        y2={trailerY + trailerWidthPx + 8}
        stroke="#272727"
        strokeWidth="1.5"
      />
      <circle cx={tractorX + 6} cy={trailerY + 8} r="2.5" fill="#ffa902" />
      <circle
        cx={tractorX + 6}
        cy={trailerY + trailerWidthPx - 8}
        r="2.5"
        fill="#ffa902"
      />
      <rect
        x={tractorX + tractorLengthPx}
        y={trailerY + trailerWidthPx / 2 - 8}
        width={fifthWheelGapPx}
        height="16"
        fill="#9ca3af"
      />

      {/* Trailer */}
      <rect
        x={trailerStartX}
        y={trailerY}
        width={trailerLengthPx}
        height={trailerWidthPx}
        fill="#ffffff"
        stroke="#0e3e7a"
        strokeWidth="1.5"
      />
      <rect
        x={trailerStartX + 1}
        y={trailerY + 1}
        width={trailerLengthPx - 2}
        height={trailerWidthPx - 2}
        fill="url(#truck-grid)"
      />
      <line
        x1={trailerStartX}
        y1={trailerY + trailerWidthPx / 2}
        x2={trailerEndX}
        y2={trailerY + trailerWidthPx / 2}
        stroke="#e6e8eb"
        strokeWidth="0.5"
        strokeDasharray="4 4"
      />

      {/* PACKED ITEMS */}
      <PackedItems
        load={load}
        cargoStartX={trailerStartX}
        cargoY={trailerY}
        cargoWidthPx={trailerWidthPx}
        truckLengthIn={truck.interiorLengthFt * 12}
        truckWidthIn={truck.interiorWidthFt * 12}
        cargoLengthPx={trailerLengthPx}
        vendorColors={vendorColors}
        vendorNames={vendorNames}
      />

      <rect
        x={trailerEndX - 100}
        y={trailerY - 4}
        width="40"
        height="3"
        fill="#272727"
      />
      <rect
        x={trailerEndX - 100}
        y={trailerY + trailerWidthPx + 1}
        width="40"
        height="3"
        fill="#272727"
      />
      <line
        x1={trailerEndX}
        y1={trailerY + 8}
        x2={trailerEndX}
        y2={trailerY + trailerWidthPx - 8}
        stroke="#272727"
        strokeWidth="0.5"
      />

      <DimensionLine
        x1={trailerStartX}
        x2={trailerEndX}
        y={dimY}
        label={`${truck.interiorLengthFt}' INTERIOR`}
      />
      <WidthLabel
        x={trailerStartX - 12}
        label={`${truck.interiorWidthFt}'`}
        cargoY={trailerY}
        cargoWidthPx={trailerWidthPx}
      />

      <text
        x={(trailerStartX + trailerEndX) / 2}
        y={trailerY - 22}
        textAnchor="middle"
        fill={overColor}
        fontSize="14"
        fontFamily="JetBrains Mono, monospace"
        fontWeight="700"
      >
        {(fillPercent * 100).toFixed(0)}%
      </text>
    </>
  );
}

// ----- Packed items renderer ---------------------------------------------

function PackedItems({
  load,
  cargoStartX,
  cargoY,
  cargoWidthPx,
  cargoLengthPx,
  truckLengthIn,
  truckWidthIn,
  vendorColors,
  vendorNames,
}: {
  load: LoadResult;
  cargoStartX: number;
  cargoY: number;
  cargoWidthPx: number;
  cargoLengthPx: number;
  truckLengthIn: number;
  truckWidthIn: number;
  vendorColors: Map<string, string>;
  vendorNames: Map<string, string>;
}) {
  const lengthScale = cargoLengthPx / truckLengthIn;
  const widthScale = cargoWidthPx / truckWidthIn;

  return (
    <g style={{ transition: "transform 0.4s ease-out" }}>
      {load.shelves.map((shelf, si) => (
        <ShelfGroup
          key={si}
          shelf={shelf}
          cargoStartX={cargoStartX}
          cargoY={cargoY}
          lengthScale={lengthScale}
          widthScale={widthScale}
          vendorColors={vendorColors}
          vendorNames={vendorNames}
        />
      ))}
    </g>
  );
}

function ShelfGroup({
  shelf,
  cargoStartX,
  cargoY,
  lengthScale,
  widthScale,
  vendorColors,
  vendorNames,
}: {
  shelf: Shelf;
  cargoStartX: number;
  cargoY: number;
  lengthScale: number;
  widthScale: number;
  vendorColors: Map<string, string>;
  vendorNames: Map<string, string>;
}) {
  // Group ground items by base index so we can label stacks.
  const stackCounts = new Map<number, number>();
  for (const stacked of shelf.stackedItems) {
    if (stacked.baseGroundIndex === null) continue;
    stackCounts.set(
      stacked.baseGroundIndex,
      (stackCounts.get(stacked.baseGroundIndex) ?? 0) + 1,
    );
  }

  return (
    <>
      {shelf.groundItems.map((placed, gi) => {
        const x = cargoStartX + shelf.startIn * lengthScale;
        const y = cargoY + placed.xIn * widthScale;
        const w = placed.item.depthIn * lengthScale;
        const h = placed.item.widthIn * widthScale;
        const color = vendorColors.get(placed.item.vendorId) ?? "#0e3e7a";
        const stackedAbove = stackCounts.get(gi) ?? 0;
        const rawName = vendorNames.get(placed.item.vendorId) ?? "";
        // Truncate vendor name to fit the rect's width. ~7 px per char at
        // size 8, so floor(w / 7) is a safe upper bound. Drop the name
        // entirely if the rect is too cramped.
        const maxChars = Math.max(0, Math.floor(w / 7));
        const showName = w > 28 && h > 16 && maxChars > 3 && rawName.length > 0;
        const displayName =
          rawName.length > maxChars
            ? rawName.slice(0, Math.max(0, maxChars - 1)) + "..."
            : rawName;
        const showStack = stackedAbove > 0 && w > 18 && h > 12;

        return (
          <g key={gi}>
            <rect
              x={x}
              y={y}
              width={w}
              height={h}
              fill={color}
              fillOpacity="0.55"
              stroke={color}
              strokeWidth="1"
            />
            {/* Vendor name label - small black ink, top-left of the rect */}
            {showName && (
              <text
                x={x + 3}
                y={y + 10}
                fontSize="8"
                fontFamily="JetBrains Mono, monospace"
                fill="#272727"
                style={{ pointerEvents: "none" }}
              >
                {displayName}
              </text>
            )}
            {showStack && (
              <text
                x={x + w / 2}
                y={y + h / 2 + 4}
                textAnchor="middle"
                fontSize="9"
                fontFamily="JetBrains Mono, monospace"
                fontWeight="700"
                fill="#ffffff"
                style={{ pointerEvents: "none" }}
              >
                x{stackedAbove + 1}
              </text>
            )}
          </g>
        );
      })}
    </>
  );
}

// ----- Dimension helpers -------------------------------------------------

function DimensionLine({
  x1,
  x2,
  y,
  label,
}: {
  x1: number;
  x2: number;
  y: number;
  label: string;
}) {
  return (
    <>
      <line x1={x1} y1={y} x2={x2} y2={y} stroke="#9ca3af" strokeWidth="0.5" />
      <line x1={x1} y1={y - 3} x2={x1} y2={y + 3} stroke="#9ca3af" strokeWidth="0.5" />
      <line x1={x2} y1={y - 3} x2={x2} y2={y + 3} stroke="#9ca3af" strokeWidth="0.5" />
      <text
        x={(x1 + x2) / 2}
        y={y + 14}
        textAnchor="middle"
        fill="#5a6370"
        fontSize="9"
        fontFamily="JetBrains Mono, monospace"
      >
        {label}
      </text>
    </>
  );
}

function WidthLabel({
  x,
  label,
  cargoY,
  cargoWidthPx,
}: {
  x: number;
  label: string;
  cargoY: number;
  cargoWidthPx: number;
}) {
  return (
    <>
      <line
        x1={x}
        y1={cargoY}
        x2={x}
        y2={cargoY + cargoWidthPx}
        stroke="#9ca3af"
        strokeWidth="0.5"
      />
      <line x1={x - 3} y1={cargoY} x2={x + 3} y2={cargoY} stroke="#9ca3af" strokeWidth="0.5" />
      <line
        x1={x - 3}
        y1={cargoY + cargoWidthPx}
        x2={x + 3}
        y2={cargoY + cargoWidthPx}
        stroke="#9ca3af"
        strokeWidth="0.5"
      />
      <text
        x={x - 6}
        y={cargoY + cargoWidthPx / 2 + 3}
        textAnchor="end"
        fill="#5a6370"
        fontSize="9"
        fontFamily="JetBrains Mono, monospace"
      >
        {label}
      </text>
    </>
  );
}

// ----- Color palette helper (importable by callers) ----------------------

export const VENDOR_COLOR_PALETTE = [
  "#0e3e7a", // Apache navy
  "#02aed6", // Apache cyan
  "#16a34a", // green
  "#ffa902", // amber
  "#9333ea", // purple
  "#0891b2", // teal
  "#ea580c", // orange-deep
  "#be185d", // pink
] as const;

export function buildVendorColorMap(
  vendorIds: readonly string[],
): Map<string, string> {
  const map = new Map<string, string>();
  vendorIds.forEach((id, i) => {
    map.set(id, VENDOR_COLOR_PALETTE[i % VENDOR_COLOR_PALETTE.length]);
  });
  return map;
}
