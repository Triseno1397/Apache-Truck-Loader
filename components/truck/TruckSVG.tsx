// Top-view truck visualization. Front of the truck on the LEFT, rear
// (doors / liftgate) on the RIGHT. The cargo box fills from the cab end
// toward the back as load is added - mirrors how crews actually load.
//
// Box truck (26ft Penske): cab + cargo box are one contiguous shape.
// Semi (53ft): tractor + 5th-wheel gap + trailer.
//
// Both trucks share the same px-per-ft scale so size comparison stays
// honest. The 26ft renders shorter inside the same viewBox.

import type { TruckSpec } from "@/lib/trucks";

type Props = {
  truck: TruckSpec;
  fillPercent: number; // 0 = empty, 1.0 = full, >1 = over capacity
};

const PX_PER_FT = 18;
const VIEWBOX_W = 1200;
const VIEWBOX_H = 240;

function fillColorFor(pct: number): string {
  if (pct > 1.0) return "#dc2626";
  if (pct > 0.95) return "#ff7302";
  if (pct > 0.75) return "#ffa902";
  return "#0e3e7a";
}

export default function TruckSVG({ truck, fillPercent }: Props) {
  const color = fillColorFor(fillPercent);
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
        <SemiTopView truck={truck} fillPercent={fillPercent} color={color} />
      ) : (
        <BoxTruckTopView
          truck={truck}
          fillPercent={fillPercent}
          color={color}
        />
      )}
    </svg>
  );
}

// ----- 26ft Penske box truck (top view) ----------------------------------

function BoxTruckTopView({
  truck,
  fillPercent,
  color,
}: {
  truck: TruckSpec;
  fillPercent: number;
  color: string;
}) {
  const cargoLengthPx = truck.interiorLengthFt * PX_PER_FT;
  const cargoWidthPx = truck.interiorWidthFt * PX_PER_FT;
  const cabLengthPx = 80;
  const liftgateLengthPx = truck.hasLiftgate ? 32 : 0;

  const cargoY = (VIEWBOX_H - cargoWidthPx) / 2;
  const cabX = 60;
  const cargoStartX = cabX + cabLengthPx;
  const cargoEndX = cargoStartX + cargoLengthPx;
  const liftgateX = cargoEndX;

  const fillWidth = Math.min(1, fillPercent) * cargoLengthPx;
  const dimY = cargoY + cargoWidthPx + 28;

  return (
    <>
      {/* Cab block (slightly taller than cargo box so it reads as wider).
          Rounded front evokes the hood from above. */}
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
      {/* Windshield - dark strip near the front of the cab */}
      <line
        x1={cabX + 22}
        y1={cargoY - 6}
        x2={cabX + 22}
        y2={cargoY + cargoWidthPx + 6}
        stroke="#272727"
        strokeWidth="1.5"
      />
      {/* Headlights */}
      <circle cx={cabX + 4} cy={cargoY + 8} r="2.5" fill="#ffa902" />
      <circle
        cx={cabX + 4}
        cy={cargoY + cargoWidthPx - 8}
        r="2.5"
        fill="#ffa902"
      />

      {/* Cargo box outline + interior grid */}
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

      {/* Centerline (subtle - reads as the truck's center axis from above) */}
      <line
        x1={cargoStartX}
        y1={cargoY + cargoWidthPx / 2}
        x2={cargoEndX}
        y2={cargoY + cargoWidthPx / 2}
        stroke="#e6e8eb"
        strokeWidth="0.5"
        strokeDasharray="4 4"
      />

      {/* FILL - grows from cab end toward rear */}
      {fillPercent > 0 && (
        <rect
          x={cargoStartX + 1}
          y={cargoY + 1}
          width={Math.max(0, fillWidth - 2)}
          height={cargoWidthPx - 2}
          fill={color}
          fillOpacity="0.6"
          style={{ transition: "width 0.4s ease-out" }}
        />
      )}

      {/* Roll-up door split (vertical line at rear, indicating doors) */}
      <line
        x1={cargoEndX}
        y1={cargoY + 8}
        x2={cargoEndX}
        y2={cargoY + cargoWidthPx - 8}
        stroke="#272727"
        strokeWidth="0.5"
      />

      {/* Liftgate (Penske 26ft has one) */}
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

      {/* Length dimension */}
      <DimensionLine
        x1={cargoStartX}
        x2={cargoEndX}
        y={dimY}
        label={`${truck.interiorLengthFt}' INTERIOR`}
      />

      {/* Width dimension */}
      <WidthLabel
        x={cargoStartX - 12}
        y={cargoY + cargoWidthPx / 2}
        label={`${truck.interiorWidthFt}'`}
        side="left"
        cargoY={cargoY}
        cargoWidthPx={cargoWidthPx}
      />

      {/* % label (top center over cargo box) */}
      <text
        x={(cargoStartX + cargoEndX) / 2}
        y={cargoY - 22}
        textAnchor="middle"
        fill={color}
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
  fillPercent,
  color,
}: {
  truck: TruckSpec;
  fillPercent: number;
  color: string;
}) {
  const trailerLengthPx = truck.interiorLengthFt * PX_PER_FT;
  const trailerWidthPx = truck.interiorWidthFt * PX_PER_FT;
  const tractorLengthPx = 100;
  const fifthWheelGapPx = 12;

  const trailerY = (VIEWBOX_H - trailerWidthPx) / 2;
  const tractorX = 30;
  const trailerStartX = tractorX + tractorLengthPx + fifthWheelGapPx;
  const trailerEndX = trailerStartX + trailerLengthPx;

  const fillWidth = Math.min(1, fillPercent) * trailerLengthPx;
  const dimY = trailerY + trailerWidthPx + 28;

  return (
    <>
      {/* Tractor: cab + sleeper from above. Slightly wider than the trailer
          to read distinctly. */}
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
      {/* Sleeper / cab divider */}
      <line
        x1={tractorX + 50}
        y1={trailerY - 12}
        x2={tractorX + 50}
        y2={trailerY + trailerWidthPx + 12}
        stroke="#9ca3af"
        strokeWidth="0.8"
      />
      {/* Windshield */}
      <line
        x1={tractorX + 28}
        y1={trailerY - 8}
        x2={tractorX + 28}
        y2={trailerY + trailerWidthPx + 8}
        stroke="#272727"
        strokeWidth="1.5"
      />
      {/* Headlights */}
      <circle cx={tractorX + 6} cy={trailerY + 8} r="2.5" fill="#ffa902" />
      <circle
        cx={tractorX + 6}
        cy={trailerY + trailerWidthPx - 8}
        r="2.5"
        fill="#ffa902"
      />

      {/* 5th wheel coupling (small connector indicator) */}
      <rect
        x={tractorX + tractorLengthPx}
        y={trailerY + trailerWidthPx / 2 - 8}
        width={fifthWheelGapPx}
        height="16"
        fill="#9ca3af"
      />

      {/* Trailer outline + grid */}
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

      {/* Centerline */}
      <line
        x1={trailerStartX}
        y1={trailerY + trailerWidthPx / 2}
        x2={trailerEndX}
        y2={trailerY + trailerWidthPx / 2}
        stroke="#e6e8eb"
        strokeWidth="0.5"
        strokeDasharray="4 4"
      />

      {/* FILL */}
      {fillPercent > 0 && (
        <rect
          x={trailerStartX + 1}
          y={trailerY + 1}
          width={Math.max(0, fillWidth - 2)}
          height={trailerWidthPx - 2}
          fill={color}
          fillOpacity="0.6"
          style={{ transition: "width 0.4s ease-out" }}
        />
      )}

      {/* Tandem-axle markers (small dark rectangles near the rear of the trailer) */}
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

      {/* Rear door split */}
      <line
        x1={trailerEndX}
        y1={trailerY + 8}
        x2={trailerEndX}
        y2={trailerY + trailerWidthPx - 8}
        stroke="#272727"
        strokeWidth="0.5"
      />

      {/* Length dimension */}
      <DimensionLine
        x1={trailerStartX}
        x2={trailerEndX}
        y={dimY}
        label={`${truck.interiorLengthFt}' INTERIOR`}
      />

      {/* Width dimension */}
      <WidthLabel
        x={trailerStartX - 12}
        y={trailerY + trailerWidthPx / 2}
        label={`${truck.interiorWidthFt}'`}
        side="left"
        cargoY={trailerY}
        cargoWidthPx={trailerWidthPx}
      />

      {/* % label */}
      <text
        x={(trailerStartX + trailerEndX) / 2}
        y={trailerY - 22}
        textAnchor="middle"
        fill={color}
        fontSize="14"
        fontFamily="JetBrains Mono, monospace"
        fontWeight="700"
      >
        {(fillPercent * 100).toFixed(0)}%
      </text>
    </>
  );
}

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
  y,
  label,
  cargoY,
  cargoWidthPx,
}: {
  x: number;
  y: number;
  label: string;
  side: "left" | "right";
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
        y={y + 3}
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
