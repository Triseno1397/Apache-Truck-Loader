"use client";

// Top-view truck visualization. Front of the truck on the LEFT, rear
// (doors / liftgate) on the RIGHT. Items render in their actual packed
// positions inside the cargo box - users SEE the gaps where future
// vendors can slot in.
//
// Box truck (26ft Penske): cab + cargo box are one contiguous shape.
// Semi (53ft): tractor + 5th-wheel gap + trailer.
//
// DRAG: every ground item is draggable. Pick one up, move it anywhere
// inside the cargo box, drop it. The drop position snaps to a 6" grid
// and persists via setVendorPlacementAction; the auto-packer re-runs
// against this new manual anchor on the server, so the page refresh
// shows the new layout. Stacked items are NOT independently draggable
// (drag the base instead - stacks rebuild around the moved base).

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { TruckSpec } from "@/lib/trucks";
import type { LoadResult, PlacedItem, Shelf } from "@/lib/load-packer";
import { setVendorPlacementAction } from "@/app/(app)/jobs/[id]/actions";

type Props = {
  truck: TruckSpec;
  load: LoadResult;
  vendorColors: Map<string, string>;
  vendorNames: Map<string, string>;
};

const PX_PER_FT = 18;
const PX_PER_IN = PX_PER_FT / 12; // = 1.5 px/in (constant for both axes)
const VIEWBOX_W = 1200;
const VIEWBOX_H = 240;
const SNAP_IN = 6; // grid resolution for drop positions

function fillColorFor(pct: number): string {
  if (pct > 1.0) return "#dc2626";
  if (pct > 0.95) return "#ff7302";
  if (pct > 0.75) return "#ffa902";
  return "#0e3e7a";
}

// In-flight drag state. Tracks the item being dragged, the cursor offset
// inside the rect (so the rect doesn't jump to the cursor on pickup), and
// the proposed snapped truck-inches position (xIn = along length, yIn =
// across width). Null when nothing is being dragged.
type DragState = {
  vendorId: string;
  itemIndex: number;
  // dimensions of the dragged item, in truck inches
  depthIn: number;
  widthIn: number;
  // pickup offset inside the item rect, in SVG pixels
  offsetSvgX: number;
  offsetSvgY: number;
  // current snapped position (truck inches), recomputed each pointermove
  snappedXIn: number;
  snappedYIn: number;
  // pointer id we captured at pickup (released on drop)
  pointerId: number;
  // SVG-pixel anchor of the cargo box (passed in so we can convert
  // pointer coords to truck inches without re-deriving each frame)
  cargoStartX: number;
  cargoY: number;
  // truck dimensions in inches (for clamping during drag)
  truckLengthIn: number;
  truckWidthIn: number;
};

export default function TruckSVG({
  truck,
  load,
  vendorColors,
  vendorNames,
}: Props) {
  const router = useRouter();
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [saving, startSave] = useTransition();

  const truckLengthIn = truck.interiorLengthFt * 12;
  const truckWidthIn = truck.interiorWidthFt * 12;
  const fillPercent = load.totalLengthIn / truckLengthIn;
  const overColor = fillColorFor(fillPercent);
  const isSemi = truck.id === "53ft_semi";

  // Convert a pointer event's client coordinates to SVG-local coordinates.
  function clientToSVG(clientX: number, clientY: number): { x: number; y: number } {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const t = pt.matrixTransform(ctm.inverse());
    return { x: t.x, y: t.y };
  }

  function startDrag(args: {
    e: React.PointerEvent<SVGRectElement>;
    placed: PlacedItem;
    cargoStartX: number;
    cargoY: number;
  }) {
    const { e, placed, cargoStartX, cargoY } = args;
    if (placed.layer !== 0) return; // only ground items are draggable
    const svg = svgRef.current;
    if (!svg) return;
    e.stopPropagation();
    e.preventDefault();
    const local = clientToSVG(e.clientX, e.clientY);
    const target = e.currentTarget;
    // Use the rect's bbox as the source of truth for current position;
    // it already has the SVG-pixel position the rendering computed.
    const bbox = target.getBBox();
    const offsetSvgX = local.x - bbox.x;
    const offsetSvgY = local.y - bbox.y;
    // Initial snapped position = where the item is right now (in truck
    // inches). Keeps the ghost stable until the user actually moves.
    const initialXIn = clamp(
      Math.round((bbox.x - cargoStartX) / PX_PER_IN / SNAP_IN) * SNAP_IN,
      0,
      Math.max(0, truckLengthIn - placed.item.depthIn),
    );
    const initialYIn = clamp(
      Math.round((bbox.y - cargoY) / PX_PER_IN / SNAP_IN) * SNAP_IN,
      0,
      Math.max(0, truckWidthIn - placed.item.widthIn),
    );

    target.setPointerCapture(e.pointerId);
    setDrag({
      vendorId: placed.item.vendorId,
      itemIndex: placed.item.itemIndex,
      depthIn: placed.item.depthIn,
      widthIn: placed.item.widthIn,
      offsetSvgX,
      offsetSvgY,
      snappedXIn: initialXIn,
      snappedYIn: initialYIn,
      pointerId: e.pointerId,
      cargoStartX,
      cargoY,
      truckLengthIn,
      truckWidthIn,
    });
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const local = clientToSVG(e.clientX, e.clientY);
    // Pointer-relative top-left of the dragged rect (in SVG pixels).
    const rectTopLeftX = local.x - drag.offsetSvgX;
    const rectTopLeftY = local.y - drag.offsetSvgY;
    // Convert to truck inches relative to the cargo box.
    const rawXIn = (rectTopLeftX - drag.cargoStartX) / PX_PER_IN;
    const rawYIn = (rectTopLeftY - drag.cargoY) / PX_PER_IN;
    // Snap, then clamp so the item stays inside the cargo box.
    const snappedXIn = clamp(
      Math.round(rawXIn / SNAP_IN) * SNAP_IN,
      0,
      Math.max(0, drag.truckLengthIn - drag.depthIn),
    );
    const snappedYIn = clamp(
      Math.round(rawYIn / SNAP_IN) * SNAP_IN,
      0,
      Math.max(0, drag.truckWidthIn - drag.widthIn),
    );
    if (snappedXIn !== drag.snappedXIn || snappedYIn !== drag.snappedYIn) {
      setDrag({ ...drag, snappedXIn, snappedYIn });
    }
  }

  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const finalX = drag.snappedXIn;
    const finalY = drag.snappedYIn;
    const vendorId = drag.vendorId;
    const itemIndex = drag.itemIndex;
    setDrag(null);
    startSave(async () => {
      const result = await setVendorPlacementAction({
        vendorId,
        itemIndex,
        xIn: finalX,
        yIn: finalY,
      });
      if (result.ok) {
        router.refresh();
      } else {
        alert(`Couldn't save placement: ${result.error}`);
      }
    });
  }

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
        className="w-full h-auto select-none"
        style={{ maxHeight: "240px", touchAction: drag ? "none" : "auto" }}
        role="img"
        aria-label={`${truck.label}, ${(fillPercent * 100).toFixed(0)}% full (top view)`}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
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
          <pattern
            id="snap-grid"
            width={SNAP_IN * PX_PER_IN}
            height={SNAP_IN * PX_PER_IN}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={`M ${SNAP_IN * PX_PER_IN} 0 L 0 0 0 ${SNAP_IN * PX_PER_IN}`}
              fill="none"
              stroke="#0e3e7a"
              strokeOpacity="0.18"
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
            drag={drag}
            onItemPointerDown={startDrag}
          />
        ) : (
          <BoxTruckTopView
            truck={truck}
            load={load}
            fillPercent={fillPercent}
            overColor={overColor}
            vendorColors={vendorColors}
            vendorNames={vendorNames}
            drag={drag}
            onItemPointerDown={startDrag}
          />
        )}
      </svg>
      {saving && (
        <div className="absolute top-2 right-2 flex items-center gap-1.5 text-[10px] text-[#9ca3af] mono tracking-wider bg-white/90 px-2 py-1 rounded border border-[#e6e8eb]">
          <Loader2 size={10} className="animate-spin" />
          SAVING POSITION
        </div>
      )}
    </div>
  );
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

type ShapeProps = {
  truck: TruckSpec;
  load: LoadResult;
  fillPercent: number;
  overColor: string;
  vendorColors: Map<string, string>;
  vendorNames: Map<string, string>;
  drag: DragState | null;
  onItemPointerDown: (args: {
    e: React.PointerEvent<SVGRectElement>;
    placed: PlacedItem;
    cargoStartX: number;
    cargoY: number;
  }) => void;
};

// ----- 26ft Penske box truck (top view) ----------------------------------

function BoxTruckTopView({
  truck,
  load,
  fillPercent,
  overColor,
  vendorColors,
  vendorNames,
  drag,
  onItemPointerDown,
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
        fill={drag ? "url(#snap-grid)" : "url(#truck-grid)"}
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
        drag={drag}
        onItemPointerDown={onItemPointerDown}
      />

      {/* Drag ghost - the snapped destination preview */}
      {drag && (
        <DragGhost
          drag={drag}
          cargoStartX={cargoStartX}
          cargoY={cargoY}
          vendorColors={vendorColors}
        />
      )}

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
  drag,
  onItemPointerDown,
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
        fill={drag ? "url(#snap-grid)" : "url(#truck-grid)"}
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
        drag={drag}
        onItemPointerDown={onItemPointerDown}
      />

      {/* Drag ghost */}
      {drag && (
        <DragGhost
          drag={drag}
          cargoStartX={trailerStartX}
          cargoY={trailerY}
          vendorColors={vendorColors}
        />
      )}

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

// ----- Drag ghost --------------------------------------------------------
//
// A premium-feeling preview rectangle drawn at the snapped destination
// during a drag. Solid border, tinted fill, drop-shadow halo so it lifts
// off the cargo floor visually. Uses the dragged item's vendor color.

function DragGhost({
  drag,
  cargoStartX,
  cargoY,
  vendorColors,
}: {
  drag: DragState;
  cargoStartX: number;
  cargoY: number;
  vendorColors: Map<string, string>;
}) {
  const x = cargoStartX + drag.snappedXIn * PX_PER_IN;
  const y = cargoY + drag.snappedYIn * PX_PER_IN;
  const w = drag.depthIn * PX_PER_IN;
  const h = drag.widthIn * PX_PER_IN;
  const color = vendorColors.get(drag.vendorId) ?? "#0e3e7a";
  return (
    <g style={{ pointerEvents: "none" }}>
      {/* Halo / shadow ring */}
      <rect
        x={x - 3}
        y={y - 3}
        width={w + 6}
        height={h + 6}
        fill="none"
        stroke={color}
        strokeOpacity="0.25"
        strokeWidth="3"
        rx="2"
      />
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill={color}
        fillOpacity="0.85"
        stroke={color}
        strokeWidth="2"
      />
      <text
        x={x + w / 2}
        y={y + h / 2 + 3}
        textAnchor="middle"
        fontSize="9"
        fontFamily="JetBrains Mono, monospace"
        fontWeight="700"
        fill="#ffffff"
      >
        {Math.round(drag.snappedXIn)}&quot;, {Math.round(drag.snappedYIn)}&quot;
      </text>
    </g>
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
  drag,
  onItemPointerDown,
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
  drag: DragState | null;
  onItemPointerDown: ShapeProps["onItemPointerDown"];
}) {
  const lengthScale = cargoLengthPx / truckLengthIn;
  const widthScale = cargoWidthPx / truckWidthIn;
  // unused vars kept to preserve original signature shape; if linter
  // complains, drop them.
  void widthScale;
  void lengthScale;

  return (
    <g style={{ transition: "transform 0.4s ease-out" }}>
      {load.shelves.map((shelf, si) => (
        <ShelfGroup
          key={si}
          shelf={shelf}
          cargoStartX={cargoStartX}
          cargoY={cargoY}
          vendorColors={vendorColors}
          vendorNames={vendorNames}
          drag={drag}
          onItemPointerDown={onItemPointerDown}
        />
      ))}
    </g>
  );
}

function ShelfGroup({
  shelf,
  cargoStartX,
  cargoY,
  vendorColors,
  vendorNames,
  drag,
  onItemPointerDown,
}: {
  shelf: Shelf;
  cargoStartX: number;
  cargoY: number;
  vendorColors: Map<string, string>;
  vendorNames: Map<string, string>;
  drag: DragState | null;
  onItemPointerDown: ShapeProps["onItemPointerDown"];
}) {
  // Group every stacked item by the base ground index it sits on so we
  // can paint a segmented stripe across the top of each base showing
  // what (and from which vendor) is stacked there.
  const stackedByBase = new Map<number, PlacedItem[]>();
  for (const stacked of shelf.stackedItems) {
    if (stacked.baseGroundIndex === null) continue;
    const list = stackedByBase.get(stacked.baseGroundIndex) ?? [];
    list.push(stacked);
    stackedByBase.set(stacked.baseGroundIndex, list);
  }

  return (
    <>
      {shelf.groundItems.map((placed, gi) => {
        const x = cargoStartX + shelf.startIn * PX_PER_IN;
        const y = cargoY + placed.xIn * PX_PER_IN;
        const w = placed.item.depthIn * PX_PER_IN;
        const h = placed.item.widthIn * PX_PER_IN;
        const baseColor = vendorColors.get(placed.item.vendorId) ?? "#0e3e7a";
        const stackedItems = stackedByBase.get(gi) ?? [];
        const stackedCount = stackedItems.length;
        const rawName = vendorNames.get(placed.item.vendorId) ?? "";
        const maxChars = Math.max(0, Math.floor(w / 7));
        const showName = w > 28 && h > 16 && maxChars > 3 && rawName.length > 0;
        const displayName =
          rawName.length > maxChars
            ? rawName.slice(0, Math.max(0, maxChars - 1)) + "..."
            : rawName;

        const stripeHeight = Math.min(5, Math.max(3, h * 0.18));
        const showStripe = stackedCount > 0 && w > 16 && h > 10;
        const segmentW = showStripe ? w / stackedCount : 0;
        const showCount = stackedCount > 0 && w > 22 && h > 14;

        // Hide the rect being dragged from its original spot, but leave a
        // ghosted outline so it's clear what we're moving.
        const isBeingDragged =
          drag !== null &&
          drag.vendorId === placed.item.vendorId &&
          drag.itemIndex === placed.item.itemIndex;
        const fillOpacity = isBeingDragged ? 0.1 : 0.55;
        const strokeDash = isBeingDragged ? "4 3" : undefined;

        // Manual placements get a subtle pin badge in the top-right of
        // the rect so the user can see at a glance which items have been
        // anchored vs. auto-packed.
        const showPin = placed.isManual && w > 18 && h > 12;

        return (
          <g key={gi}>
            <rect
              x={x}
              y={y}
              width={w}
              height={h}
              fill={baseColor}
              fillOpacity={fillOpacity}
              stroke={baseColor}
              strokeWidth="1"
              strokeDasharray={strokeDash}
              style={{
                cursor: isBeingDragged ? "grabbing" : "grab",
                touchAction: "none",
              }}
              onPointerDown={(e) =>
                onItemPointerDown({ e, placed, cargoStartX, cargoY })
              }
            />
            {/* Manual-anchor pin (small navy dot top-right) */}
            {showPin && !isBeingDragged && (
              <circle
                cx={x + w - 4}
                cy={y + 4 + (showStripe ? stripeHeight : 0)}
                r="2"
                fill="#0e3e7a"
                style={{ pointerEvents: "none" }}
              />
            )}
            {showName && !isBeingDragged && (
              <text
                x={x + 3}
                y={y + 10 + (showStripe ? stripeHeight : 0)}
                fontSize="8"
                fontFamily="JetBrains Mono, monospace"
                fill="#272727"
                style={{ pointerEvents: "none" }}
              >
                {displayName}
              </text>
            )}
            {showStripe && !isBeingDragged &&
              stackedItems.map((stk, i) => {
                const segColor =
                  vendorColors.get(stk.item.vendorId) ?? "#5a6370";
                return (
                  <rect
                    key={i}
                    x={x + i * segmentW}
                    y={y}
                    width={segmentW}
                    height={stripeHeight}
                    fill={segColor}
                    stroke="#272727"
                    strokeWidth="0.4"
                    style={{ pointerEvents: "none" }}
                  />
                );
              })}
            {showCount && !isBeingDragged && (
              <text
                x={x + w - 3}
                y={y + h - 3}
                textAnchor="end"
                fontSize="9"
                fontFamily="JetBrains Mono, monospace"
                fontWeight="700"
                fill="#272727"
                style={{ pointerEvents: "none" }}
              >
                +{stackedCount}
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

// Color helpers live in lib/vendor-colors.ts so server components (the
// editor page) can call buildVendorColorMap() directly. Don't re-export
// from this client component - that would re-introduce the same boundary
// crossing that originally broke the editor page.
