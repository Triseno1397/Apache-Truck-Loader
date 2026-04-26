// Side-view truck visualization. Same load data as TruckSVG (top view),
// rendered with truck length on the X axis and truck HEIGHT on the Z axis.
// Use this view to see vertical stacking, ceiling clearance, and which
// columns have headroom left.
//
// Front of the truck on the LEFT, rear (doors / liftgate) on the RIGHT -
// orientation matches the top view so the two read consistently.
//
// Multi-item shelves: when several ground items occupy the same shelf at
// different positions across the truck WIDTH, they share the same X in
// side view and overlap. We render each as a translucent stack column
// with strong vendor-colored borders so overlapping silhouettes stay
// readable. Tallest column wins visually; shorter columns sit behind.

import type { TruckSpec } from "@/lib/trucks";
import type { LoadResult, PlacedItem } from "@/lib/load-packer";

type Props = {
  truck: TruckSpec;
  load: LoadResult;
  vendorColors: Map<string, string>;
  vendorNames: Map<string, string>;
};

const PX_PER_FT = 18;
const VIEWBOX_W = 1200;
const VIEWBOX_H = 280;

function fillColorFor(pct: number): string {
  if (pct > 1.0) return "#dc2626";
  if (pct > 0.95) return "#ff7302";
  if (pct > 0.75) return "#ffa902";
  return "#0e3e7a";
}

// Pick the worst (most-utilized) stack column in the load to drive the
// header status %. The columns the user worries about are the tallest.
function tallestColumnPct(load: LoadResult, truckHeightIn: number): number {
  if (truckHeightIn <= 0) return 0;
  let max = 0;
  for (const shelf of load.shelves) {
    for (let gi = 0; gi < shelf.groundItems.length; gi++) {
      const base = shelf.groundItems[gi];
      const stackedHere = shelf.stackedItems.filter(
        (s) => s.baseGroundIndex === gi,
      );
      const total =
        base.item.heightIn +
        stackedHere.reduce((sum, s) => sum + s.item.heightIn, 0);
      if (total > max) max = total;
    }
  }
  return max / truckHeightIn;
}

export default function TruckSideSVG({
  truck,
  load,
  vendorColors,
  vendorNames,
}: Props) {
  const truckLengthIn = truck.interiorLengthFt * 12;
  const truckHeightIn = truck.interiorHeightFt * 12;
  const fillPct = load.totalLengthIn / truckLengthIn;
  const heightPct = tallestColumnPct(load, truckHeightIn);
  const isSemi = truck.id === "53ft_semi";

  return (
    <svg
      viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
      className="w-full h-auto"
      style={{ maxHeight: "280px" }}
      role="img"
      aria-label={`${truck.label}, ${(fillPct * 100).toFixed(0)}% full lengthwise, tallest stack ${(heightPct * 100).toFixed(0)}% of ceiling (side view)`}
    >
      <defs>
        <pattern
          id="truck-grid-side"
          width="18"
          height="18"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M 18 0 L 0 0 0 18"
            fill="none"
            stroke="#e6e8eb"
            strokeWidth="0.5"
          />
        </pattern>
      </defs>
      {isSemi ? (
        <SemiSideView
          truck={truck}
          load={load}
          fillPct={fillPct}
          heightPct={heightPct}
          vendorColors={vendorColors}
          vendorNames={vendorNames}
        />
      ) : (
        <BoxTruckSideView
          truck={truck}
          load={load}
          fillPct={fillPct}
          heightPct={heightPct}
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
  fillPct: number;
  heightPct: number;
  vendorColors: Map<string, string>;
  vendorNames: Map<string, string>;
};

// ----- 26ft Penske box truck (side view) ---------------------------------

function BoxTruckSideView({
  truck,
  load,
  fillPct,
  heightPct,
  vendorColors,
  vendorNames,
}: ShapeProps) {
  const cargoLengthPx = truck.interiorLengthFt * PX_PER_FT;
  const cargoHeightPx = truck.interiorHeightFt * PX_PER_FT;
  const cabLengthPx = 80;
  const cabHeightPx = cargoHeightPx * 0.78; // cabs are shorter than cargo box
  const liftgateLengthPx = truck.hasLiftgate ? 28 : 0;

  const baselineY = 50 + cargoHeightPx; // ground line for everything (truck + wheels)
  const cargoTopY = 50;
  const cargoBottomY = baselineY;

  const cabX = 60;
  const cabTopY = baselineY - cabHeightPx;
  const cargoStartX = cabX + cabLengthPx;
  const cargoEndX = cargoStartX + cargoLengthPx;
  const liftgateX = cargoEndX;

  const overColor = fillColorFor(Math.max(fillPct, heightPct));

  // Wheels - drawn as small circles at the bottom for grounding
  const wheelRadius = 8;
  const wheelY = baselineY + wheelRadius;

  return (
    <>
      {/* Cab profile - sloped windshield, hood, body */}
      <path
        d={`M ${cabX} ${cabTopY + 16}
            Q ${cabX + 4} ${cabTopY + 4} ${cabX + 18} ${cabTopY + 4}
            L ${cabX + cabLengthPx - 8} ${cabTopY + 4}
            L ${cabX + cabLengthPx - 8} ${cargoBottomY - 4}
            L ${cabX} ${cargoBottomY - 4} Z`}
        fill="#eff1f4"
        stroke="#9ca3af"
        strokeWidth="1.5"
      />
      {/* Windshield slash */}
      <line
        x1={cabX + 18}
        y1={cabTopY + 4}
        x2={cabX + 36}
        y2={cabTopY + cabHeightPx * 0.45}
        stroke="#272727"
        strokeWidth="1.2"
      />
      {/* Door divider */}
      <line
        x1={cabX + 50}
        y1={cabTopY + cabHeightPx * 0.4}
        x2={cabX + 50}
        y2={cargoBottomY - 4}
        stroke="#9ca3af"
        strokeWidth="0.8"
      />

      {/* Cargo box outline + grid */}
      <rect
        x={cargoStartX}
        y={cargoTopY}
        width={cargoLengthPx}
        height={cargoHeightPx}
        fill="#ffffff"
        stroke="#0e3e7a"
        strokeWidth="1.5"
      />
      <rect
        x={cargoStartX + 1}
        y={cargoTopY + 1}
        width={cargoLengthPx - 2}
        height={cargoHeightPx - 2}
        fill="url(#truck-grid-side)"
      />

      {/* Ceiling label - prominent, navy, lives above the cargo box */}
      <line
        x1={cargoStartX}
        y1={cargoTopY}
        x2={cargoEndX}
        y2={cargoTopY}
        stroke="#0e3e7a"
        strokeWidth="2"
      />
      <text
        x={cargoEndX - 6}
        y={cargoTopY - 6}
        textAnchor="end"
        fill="#0e3e7a"
        fontSize="9"
        fontFamily="JetBrains Mono, monospace"
        fontWeight="600"
      >
        CEILING {Math.round(truck.interiorHeightFt * 12)}&quot;
      </text>

      {/* Floor line */}
      <line
        x1={cargoStartX}
        y1={cargoBottomY}
        x2={cargoEndX}
        y2={cargoBottomY}
        stroke="#272727"
        strokeWidth="0.8"
      />

      {/* Packed items */}
      <PackedColumns
        load={load}
        cargoStartX={cargoStartX}
        cargoBottomY={cargoBottomY}
        cargoTopY={cargoTopY}
        truckLengthIn={truck.interiorLengthFt * 12}
        truckHeightIn={truck.interiorHeightFt * 12}
        cargoLengthPx={cargoLengthPx}
        cargoHeightPx={cargoHeightPx}
        vendorColors={vendorColors}
        vendorNames={vendorNames}
      />

      {/* Liftgate (lowered) */}
      {truck.hasLiftgate && (
        <rect
          x={liftgateX}
          y={cargoBottomY - 3}
          width={liftgateLengthPx}
          height="6"
          fill="#9ca3af"
          stroke="#272727"
          strokeWidth="0.8"
        />
      )}

      {/* Wheels */}
      <circle
        cx={cabX + cabLengthPx * 0.6}
        cy={wheelY}
        r={wheelRadius}
        fill="#272727"
      />
      <circle
        cx={cargoEndX - 60}
        cy={wheelY}
        r={wheelRadius}
        fill="#272727"
      />
      <circle
        cx={cargoEndX - 30}
        cy={wheelY}
        r={wheelRadius}
        fill="#272727"
      />
      {/* Asphalt line */}
      <line
        x1={20}
        y1={wheelY + wheelRadius + 2}
        x2={VIEWBOX_W - 20}
        y2={wheelY + wheelRadius + 2}
        stroke="#9ca3af"
        strokeWidth="0.8"
        strokeDasharray="4 6"
      />

      {/* Header status: % length + tallest column % */}
      <text
        x={(cargoStartX + cargoEndX) / 2}
        y={cargoTopY - 22}
        textAnchor="middle"
        fill={overColor}
        fontSize="13"
        fontFamily="JetBrains Mono, monospace"
        fontWeight="700"
      >
        {(fillPct * 100).toFixed(0)}% LENGTH · {(heightPct * 100).toFixed(0)}% TALLEST STACK
      </text>
    </>
  );
}

// ----- 53ft Semi (side view) ---------------------------------------------

function SemiSideView({
  truck,
  load,
  fillPct,
  heightPct,
  vendorColors,
  vendorNames,
}: ShapeProps) {
  const trailerLengthPx = truck.interiorLengthFt * PX_PER_FT;
  const trailerHeightPx = truck.interiorHeightFt * PX_PER_FT;
  const tractorLengthPx = 100;
  const tractorHeightPx = trailerHeightPx * 0.85;
  const fifthWheelGapPx = 10;

  const baselineY = 50 + trailerHeightPx;
  const trailerTopY = 50;
  const trailerBottomY = baselineY;

  const tractorX = 30;
  const tractorTopY = baselineY - tractorHeightPx;
  const trailerStartX = tractorX + tractorLengthPx + fifthWheelGapPx;
  const trailerEndX = trailerStartX + trailerLengthPx;

  const overColor = fillColorFor(Math.max(fillPct, heightPct));
  const wheelRadius = 9;
  const wheelY = baselineY + wheelRadius;

  return (
    <>
      {/* Tractor - cab over with sleeper hump */}
      <path
        d={`M ${tractorX} ${tractorTopY + 18}
            Q ${tractorX + 4} ${tractorTopY + 4} ${tractorX + 24} ${tractorTopY + 4}
            L ${tractorX + 60} ${tractorTopY + 4}
            L ${tractorX + 60} ${tractorTopY + 14}
            L ${tractorX + tractorLengthPx} ${tractorTopY + 14}
            L ${tractorX + tractorLengthPx} ${trailerBottomY - 4}
            L ${tractorX} ${trailerBottomY - 4} Z`}
        fill="#eff1f4"
        stroke="#9ca3af"
        strokeWidth="1.5"
      />
      {/* Windshield */}
      <line
        x1={tractorX + 24}
        y1={tractorTopY + 4}
        x2={tractorX + 42}
        y2={tractorTopY + tractorHeightPx * 0.4}
        stroke="#272727"
        strokeWidth="1.2"
      />

      {/* 5th-wheel saddle */}
      <rect
        x={tractorX + tractorLengthPx}
        y={trailerBottomY - 8}
        width={fifthWheelGapPx}
        height="8"
        fill="#9ca3af"
      />

      {/* Trailer */}
      <rect
        x={trailerStartX}
        y={trailerTopY}
        width={trailerLengthPx}
        height={trailerHeightPx}
        fill="#ffffff"
        stroke="#0e3e7a"
        strokeWidth="1.5"
      />
      <rect
        x={trailerStartX + 1}
        y={trailerTopY + 1}
        width={trailerLengthPx - 2}
        height={trailerHeightPx - 2}
        fill="url(#truck-grid-side)"
      />

      {/* Ceiling marker */}
      <line
        x1={trailerStartX}
        y1={trailerTopY}
        x2={trailerEndX}
        y2={trailerTopY}
        stroke="#0e3e7a"
        strokeWidth="2"
      />
      <text
        x={trailerEndX - 6}
        y={trailerTopY - 6}
        textAnchor="end"
        fill="#0e3e7a"
        fontSize="9"
        fontFamily="JetBrains Mono, monospace"
        fontWeight="600"
      >
        CEILING {Math.round(truck.interiorHeightFt * 12)}&quot;
      </text>

      {/* Floor line */}
      <line
        x1={trailerStartX}
        y1={trailerBottomY}
        x2={trailerEndX}
        y2={trailerBottomY}
        stroke="#272727"
        strokeWidth="0.8"
      />

      {/* Packed items */}
      <PackedColumns
        load={load}
        cargoStartX={trailerStartX}
        cargoBottomY={trailerBottomY}
        cargoTopY={trailerTopY}
        truckLengthIn={truck.interiorLengthFt * 12}
        truckHeightIn={truck.interiorHeightFt * 12}
        cargoLengthPx={trailerLengthPx}
        cargoHeightPx={trailerHeightPx}
        vendorColors={vendorColors}
        vendorNames={vendorNames}
      />

      {/* Trailer rear marker (doors) */}
      <rect
        x={trailerEndX - 2}
        y={trailerTopY + 6}
        width="2"
        height={trailerHeightPx - 12}
        fill="#272727"
      />

      {/* Wheels - tractor steering + drive, trailer tandems */}
      <circle cx={tractorX + 18} cy={wheelY} r={wheelRadius} fill="#272727" />
      <circle cx={tractorX + tractorLengthPx - 24} cy={wheelY} r={wheelRadius} fill="#272727" />
      <circle cx={tractorX + tractorLengthPx - 6} cy={wheelY} r={wheelRadius} fill="#272727" />
      <circle cx={trailerEndX - 80} cy={wheelY} r={wheelRadius} fill="#272727" />
      <circle cx={trailerEndX - 56} cy={wheelY} r={wheelRadius} fill="#272727" />

      <line
        x1={20}
        y1={wheelY + wheelRadius + 2}
        x2={VIEWBOX_W - 20}
        y2={wheelY + wheelRadius + 2}
        stroke="#9ca3af"
        strokeWidth="0.8"
        strokeDasharray="4 6"
      />

      <text
        x={(trailerStartX + trailerEndX) / 2}
        y={trailerTopY - 22}
        textAnchor="middle"
        fill={overColor}
        fontSize="13"
        fontFamily="JetBrains Mono, monospace"
        fontWeight="700"
      >
        {(fillPct * 100).toFixed(0)}% LENGTH · {(heightPct * 100).toFixed(0)}% TALLEST STACK
      </text>
    </>
  );
}

// ----- Packed columns ----------------------------------------------------
//
// One column per ground item. The column is an actual-height stack of the
// base + everything stacked on it. Column X = the shelf's distance from
// the front of the truck. Column WIDTH = the item's depth (along truck
// length). Items are stacked physically from the floor upward in their
// real heights.

function PackedColumns({
  load,
  cargoStartX,
  cargoBottomY,
  cargoTopY,
  truckLengthIn,
  truckHeightIn,
  cargoLengthPx,
  cargoHeightPx,
  vendorColors,
  vendorNames,
}: {
  load: LoadResult;
  cargoStartX: number;
  cargoBottomY: number;
  cargoTopY: number;
  truckLengthIn: number;
  truckHeightIn: number;
  cargoLengthPx: number;
  cargoHeightPx: number;
  vendorColors: Map<string, string>;
  vendorNames: Map<string, string>;
}) {
  const lengthScale = cargoLengthPx / truckLengthIn;
  const heightScale = cargoHeightPx / truckHeightIn;

  return (
    <g style={{ transition: "transform 0.4s ease-out" }}>
      {load.shelves.map((shelf, si) => {
        // For each ground item in this shelf, build its stack column from
        // the floor upward. Sort stacked items by layer so layer 1 is at
        // the bottom of the stack (sitting directly on the base).
        return shelf.groundItems.map((groundPlaced, gi) => {
          const x = cargoStartX + shelf.startIn * lengthScale;
          const w = groundPlaced.item.depthIn * lengthScale;
          const stackedHere = shelf.stackedItems
            .filter((s) => s.baseGroundIndex === gi)
            .sort((a, b) => a.layer - b.layer);

          // Build the vertical sequence of items in this column
          const column: Array<{
            placed: PlacedItem;
            isBase: boolean;
          }> = [
            { placed: groundPlaced, isBase: true },
            ...stackedHere.map((s) => ({ placed: s, isBase: false })),
          ];

          let runningHeightIn = 0;
          // Pre-compute total stack height for the per-column label
          const totalHeightIn = column.reduce(
            (sum, it) => sum + it.placed.item.heightIn,
            0,
          );
          const overheadIn = truckHeightIn - totalHeightIn;
          const headroomColor =
            overheadIn < 0
              ? "#dc2626"
              : overheadIn < 6
                ? "#ff7302"
                : overheadIn < 18
                  ? "#ffa902"
                  : "#16a34a";

          return (
            <g key={`${si}-${gi}`}>
              {column.map((entry, ci) => {
                const heightPx = entry.placed.item.heightIn * heightScale;
                const yTop =
                  cargoBottomY -
                  (runningHeightIn + entry.placed.item.heightIn) *
                    heightScale;
                runningHeightIn += entry.placed.item.heightIn;
                const color =
                  vendorColors.get(entry.placed.item.vendorId) ?? "#0e3e7a";
                const rawName =
                  vendorNames.get(entry.placed.item.vendorId) ?? "";
                const maxChars = Math.max(0, Math.floor(w / 7));
                const showName =
                  w > 28 && heightPx > 14 && maxChars > 3 && rawName.length > 0;
                const displayName =
                  rawName.length > maxChars
                    ? rawName.slice(0, Math.max(0, maxChars - 1)) + "..."
                    : rawName;

                return (
                  <g key={ci}>
                    <rect
                      x={x}
                      y={yTop}
                      width={w}
                      height={heightPx}
                      fill={color}
                      fillOpacity="0.55"
                      stroke={color}
                      strokeWidth="1"
                    />
                    {showName && (
                      <text
                        x={x + 3}
                        y={yTop + 10}
                        fontSize="8"
                        fontFamily="JetBrains Mono, monospace"
                        fill="#272727"
                        style={{ pointerEvents: "none" }}
                      >
                        {displayName}
                      </text>
                    )}
                  </g>
                );
              })}
              {/* Per-column headroom indicator: a small badge above the
                  column showing how much vertical space is left. Color
                  goes red when over-ceiling. */}
              {w > 22 && (
                <text
                  x={x + w / 2}
                  y={cargoBottomY - totalHeightIn * heightScale - 4}
                  textAnchor="middle"
                  fontSize="8"
                  fontFamily="JetBrains Mono, monospace"
                  fontWeight="600"
                  fill={headroomColor}
                  style={{ pointerEvents: "none" }}
                >
                  {overheadIn >= 0
                    ? `${Math.round(overheadIn)}" CLEAR`
                    : `${Math.round(-overheadIn)}" OVER`}
                </text>
              )}
            </g>
          );
        });
      })}
    </g>
  );
}
