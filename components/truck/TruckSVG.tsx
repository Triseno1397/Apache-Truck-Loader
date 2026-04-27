"use client";

// Top-view truck visualization. Front of the truck on the LEFT, rear
// (doors / liftgate) on the RIGHT. Items render in their actual packed
// positions inside the cargo box - users SEE the gaps where future
// vendors can slot in.
//
// Box truck (26ft Penske): cab + cargo box are one contiguous shape.
// Semi (53ft): tractor + 5th-wheel gap + trailer.
//
// DRAG: every item (ground OR stacked) is independently draggable.
// Pick one up, move it anywhere inside the cargo box, drop it. The drop
// snaps to a 6" grid and persists via setVendorPlacementAction. A
// dropped stacked item leaves the stack and becomes a manual ground
// placement at the new spot; the auto-packer will rebuild any remaining
// stack on the next pass.
//
// PERF: the drag uses refs + direct DOM mutation. The React tree only
// re-renders TWICE per drag (start + end). Pointer moves bypass React
// entirely - the ghost rect's x / y attributes mutate at 60+fps with
// zero virtual-DOM diffing.

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";
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

// Tiny React state for "which item is being dragged" - drives the ghost
// element's existence in the tree and the source rect's ghost appearance.
// Only flips on drag start (null -> id) and drag end (id -> null), so we
// only re-render twice per drag.
type DragHandle = {
  vendorId: string;
  itemIndex: number;
  // Vendor color for the ghost rect (looked up once at start so the
  // ghost can render without prop drilling vendorColors)
  color: string;
  // Item dimensions used to size the ghost rect
  depthIn: number;
  widthIn: number;
} | null;

// "I just dropped this item HERE; the server hasn't confirmed yet."
// While set, the matching item is HIDDEN in the regular renderer and
// an overlay rect is drawn at the pending position. As soon as the
// server data arrives (load prop changes), this clears and the real
// render takes over - the user never sees the rect snap to the old
// position and then to the new one.
type PendingPlacement = {
  vendorId: string;
  itemIndex: number;
  xIn: number;
  yIn: number;
  depthIn: number;
  widthIn: number;
  color: string;
} | null;

type Toast = {
  message: string;
  kind: "error" | "info";
} | null;

// Per-frame data used by direct DOM mutation. Lives in a ref - never
// triggers a re-render.
type DragInfo = {
  vendorId: string;
  itemIndex: number;
  depthIn: number;
  widthIn: number;
  // pickup offset inside the rect, in SVG pixels
  offsetSvgX: number;
  offsetSvgY: number;
  // current snapped position (truck inches); mutates each pointermove
  snappedXIn: number;
  snappedYIn: number;
  pointerId: number;
  cargoStartX: number;
  cargoY: number;
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
  const dragInfoRef = useRef<DragInfo | null>(null);
  const ghostRectRef = useRef<SVGRectElement | null>(null);
  const ghostHaloRef = useRef<SVGRectElement | null>(null);
  const ghostTextRef = useRef<SVGTextElement | null>(null);
  const [dragHandle, setDragHandle] = useState<DragHandle>(null);
  const [pendingPlacement, setPendingPlacement] =
    useState<PendingPlacement>(null);
  const [toast, setToast] = useState<Toast>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saving, startSave] = useTransition();

  // Clear the optimistic placement as soon as fresh server data arrives
  // (the load prop changes). Until that moment, the overlay rect at the
  // pending position is what the user sees.
  useEffect(() => {
    setPendingPlacement(null);
  }, [load]);

  function showToast(message: string, kind: "error" | "info" = "error") {
    setToast({ message, kind });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
  }

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
    const svg = svgRef.current;
    if (!svg) return;
    e.stopPropagation();
    e.preventDefault();
    const local = clientToSVG(e.clientX, e.clientY);
    const target = e.currentTarget;
    const bbox = target.getBBox();
    const offsetSvgX = local.x - bbox.x;
    const offsetSvgY = local.y - bbox.y;
    // Initial snapped position = current item position. For ground items
    // we use the bbox; for stacked items we infer from the base.
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

    dragInfoRef.current = {
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
    };
    setDragHandle({
      vendorId: placed.item.vendorId,
      itemIndex: placed.item.itemIndex,
      color: vendorColors.get(placed.item.vendorId) ?? "#0e3e7a",
      depthIn: placed.item.depthIn,
      widthIn: placed.item.widthIn,
    });
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const info = dragInfoRef.current;
    if (!info || e.pointerId !== info.pointerId) return;
    const local = clientToSVG(e.clientX, e.clientY);
    const rectTopLeftX = local.x - info.offsetSvgX;
    const rectTopLeftY = local.y - info.offsetSvgY;
    const rawXIn = (rectTopLeftX - info.cargoStartX) / PX_PER_IN;
    const rawYIn = (rectTopLeftY - info.cargoY) / PX_PER_IN;
    // Clamp the raw cursor-tracked position so the ghost can't leave
    // the cargo box. The ghost follows the cursor SMOOTHLY here -
    // snapping to the 6" grid only happens on drop. The earlier
    // snap-during-drag was the source of the perceived jitter
    // (cursor moves continuously but the rect lurches in 6" steps).
    const smoothXIn = clamp(
      rawXIn,
      0,
      Math.max(0, info.truckLengthIn - info.depthIn),
    );
    const smoothYIn = clamp(
      rawYIn,
      0,
      Math.max(0, info.truckWidthIn - info.widthIn),
    );
    // Snapped target = where the item will land on release. Stored on
    // the ref so onPointerUp can read it without re-deriving.
    const snappedXIn = clamp(
      Math.round(rawXIn / SNAP_IN) * SNAP_IN,
      0,
      Math.max(0, info.truckLengthIn - info.depthIn),
    );
    const snappedYIn = clamp(
      Math.round(rawYIn / SNAP_IN) * SNAP_IN,
      0,
      Math.max(0, info.truckWidthIn - info.widthIn),
    );
    info.snappedXIn = snappedXIn;
    info.snappedYIn = snappedYIn;

    // Direct DOM mutation - bypasses React re-render per frame.
    const ghostX = info.cargoStartX + smoothXIn * PX_PER_IN;
    const ghostY = info.cargoY + smoothYIn * PX_PER_IN;
    const w = info.depthIn * PX_PER_IN;
    const h = info.widthIn * PX_PER_IN;
    if (ghostRectRef.current) {
      ghostRectRef.current.setAttribute("x", String(ghostX));
      ghostRectRef.current.setAttribute("y", String(ghostY));
    }
    if (ghostHaloRef.current) {
      ghostHaloRef.current.setAttribute("x", String(ghostX - 3));
      ghostHaloRef.current.setAttribute("y", String(ghostY - 3));
    }
    if (ghostTextRef.current) {
      ghostTextRef.current.setAttribute("x", String(ghostX + w / 2));
      ghostTextRef.current.setAttribute("y", String(ghostY + h / 2 + 3));
      // Text shows the SNAPPED target so the user knows exactly where
      // release will land, even though the rect itself follows smoothly.
      ghostTextRef.current.textContent = `${Math.round(snappedXIn)}", ${Math.round(snappedYIn)}"`;
    }
  }

  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    const info = dragInfoRef.current;
    if (!info || e.pointerId !== info.pointerId) return;
    const finalX = info.snappedXIn;
    const finalY = info.snappedYIn;
    const vendorId = info.vendorId;
    const itemIndex = info.itemIndex;
    const depthIn = info.depthIn;
    const widthIn = info.widthIn;
    const color = vendorColors.get(vendorId) ?? "#0e3e7a";
    dragInfoRef.current = null;
    // Set the optimistic overlay BEFORE clearing the drag handle so the
    // user sees the item land at the new spot in the same frame the
    // ghost disappears - no perceived delay.
    setPendingPlacement({
      vendorId,
      itemIndex,
      xIn: finalX,
      yIn: finalY,
      depthIn,
      widthIn,
      color,
    });
    setDragHandle(null);
    startSave(async () => {
      const result = await setVendorPlacementAction({
        vendorId,
        itemIndex,
        xIn: finalX,
        yIn: finalY,
      });
      if (result.ok) {
        router.refresh();
        // pendingPlacement will clear via the useEffect once `load`
        // updates with the saved data.
      } else {
        showToast(result.error || "Couldn't save placement");
        setPendingPlacement(null); // revert the optimistic preview
      }
    });
  }

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
        className="w-full h-auto select-none"
        style={{
          maxHeight: "240px",
          touchAction: dragHandle ? "none" : "auto",
        }}
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
            dragHandle={dragHandle}
            pendingPlacement={pendingPlacement}
            onItemPointerDown={startDrag}
            ghostRectRef={ghostRectRef}
            ghostHaloRef={ghostHaloRef}
            ghostTextRef={ghostTextRef}
          />
        ) : (
          <BoxTruckTopView
            truck={truck}
            load={load}
            fillPercent={fillPercent}
            overColor={overColor}
            vendorColors={vendorColors}
            vendorNames={vendorNames}
            dragHandle={dragHandle}
            pendingPlacement={pendingPlacement}
            onItemPointerDown={startDrag}
            ghostRectRef={ghostRectRef}
            ghostHaloRef={ghostHaloRef}
            ghostTextRef={ghostTextRef}
          />
        )}
      </svg>
      {/* Save-in-flight indicator - subtle, top-right corner */}
      {saving && (
        <div className="absolute top-2 right-2 flex items-center gap-1.5 text-[10px] text-[#9ca3af] mono tracking-wider bg-white/90 px-2 py-1 rounded border border-[#e6e8eb]">
          <Loader2 size={10} className="animate-spin" />
          SAVING POSITION
        </div>
      )}
      {/* Toast - replaces the old alert() popup. Auto-dismisses after
          4s; click anywhere on it to dismiss early. */}
      {toast && (
        <button
          type="button"
          onClick={() => setToast(null)}
          className={`absolute top-2 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium tracking-wide border ${
            toast.kind === "error"
              ? "bg-[#dc2626] text-white border-[#dc2626]"
              : "bg-[#0e3e7a] text-white border-[#0e3e7a]"
          }`}
        >
          {toast.kind === "error" && <AlertTriangle size={12} />}
          <span className="max-w-[420px] truncate">{toast.message}</span>
        </button>
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
  dragHandle: DragHandle;
  pendingPlacement: PendingPlacement;
  onItemPointerDown: (args: {
    e: React.PointerEvent<SVGRectElement>;
    placed: PlacedItem;
    cargoStartX: number;
    cargoY: number;
  }) => void;
  ghostRectRef: React.RefObject<SVGRectElement | null>;
  ghostHaloRef: React.RefObject<SVGRectElement | null>;
  ghostTextRef: React.RefObject<SVGTextElement | null>;
};

// ----- 26ft Penske box truck (top view) ----------------------------------

function BoxTruckTopView({
  truck,
  load,
  fillPercent,
  overColor,
  vendorColors,
  vendorNames,
  dragHandle,
  pendingPlacement,
  onItemPointerDown,
  ghostRectRef,
  ghostHaloRef,
  ghostTextRef,
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
        fill={dragHandle ? "url(#snap-grid)" : "url(#truck-grid)"}
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
        vendorColors={vendorColors}
        vendorNames={vendorNames}
        dragHandle={dragHandle}
        pendingPlacement={pendingPlacement}
        onItemPointerDown={onItemPointerDown}
      />

      {/* Optimistic placement overlay - drawn the instant the user
          drops, before the server confirms. The matching item is
          hidden inside PackedItems so we don't show the rect twice. */}
      {pendingPlacement && (
        <PendingOverlay
          pending={pendingPlacement}
          cargoStartX={cargoStartX}
          cargoY={cargoY}
        />
      )}

      {/* Drag ghost - the snapped destination preview. Lives in the
          tree only while a drag is in progress (dragHandle != null);
          its position attributes are mutated directly via refs during
          pointer move (no React re-render per frame). */}
      {dragHandle && (
        <DragGhost
          dragHandle={dragHandle}
          ghostRectRef={ghostRectRef}
          ghostHaloRef={ghostHaloRef}
          ghostTextRef={ghostTextRef}
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
  dragHandle,
  pendingPlacement,
  onItemPointerDown,
  ghostRectRef,
  ghostHaloRef,
  ghostTextRef,
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
        fill={dragHandle ? "url(#snap-grid)" : "url(#truck-grid)"}
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
        vendorColors={vendorColors}
        vendorNames={vendorNames}
        dragHandle={dragHandle}
        pendingPlacement={pendingPlacement}
        onItemPointerDown={onItemPointerDown}
      />

      {pendingPlacement && (
        <PendingOverlay
          pending={pendingPlacement}
          cargoStartX={trailerStartX}
          cargoY={trailerY}
        />
      )}

      {/* Drag ghost */}
      {dragHandle && (
        <DragGhost
          dragHandle={dragHandle}
          ghostRectRef={ghostRectRef}
          ghostHaloRef={ghostHaloRef}
          ghostTextRef={ghostTextRef}
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
// off the cargo floor visually. Position attributes (x / y) are mutated
// DIRECTLY via refs during pointer move - no React re-render per frame.

function DragGhost({
  dragHandle,
  ghostRectRef,
  ghostHaloRef,
  ghostTextRef,
}: {
  dragHandle: NonNullable<DragHandle>;
  ghostRectRef: React.RefObject<SVGRectElement | null>;
  ghostHaloRef: React.RefObject<SVGRectElement | null>;
  ghostTextRef: React.RefObject<SVGTextElement | null>;
}) {
  const w = dragHandle.depthIn * PX_PER_IN;
  const h = dragHandle.widthIn * PX_PER_IN;
  // Initial x / y are 0 - the first pointermove updates them. (The ghost
  // appears off-screen for one frame, which the eye doesn't catch.)
  return (
    <g style={{ pointerEvents: "none" }}>
      <rect
        ref={ghostHaloRef}
        x={-9999}
        y={-9999}
        width={w + 6}
        height={h + 6}
        fill="none"
        stroke={dragHandle.color}
        strokeOpacity="0.25"
        strokeWidth="3"
        rx="2"
      />
      <rect
        ref={ghostRectRef}
        x={-9999}
        y={-9999}
        width={w}
        height={h}
        fill={dragHandle.color}
        fillOpacity="0.85"
        stroke={dragHandle.color}
        strokeWidth="2"
      />
      <text
        ref={ghostTextRef}
        x={-9999}
        y={-9999}
        textAnchor="middle"
        fontSize="9"
        fontFamily="JetBrains Mono, monospace"
        fontWeight="700"
        fill="#ffffff"
      >
        0&quot;, 0&quot;
      </text>
    </g>
  );
}

// ----- Optimistic-placement overlay --------------------------------------
//
// Drawn at the user's drop position the instant they release, BEFORE
// the server confirms the save. The matching item is hidden inside
// PackedItems while pendingPlacement is set, so we don't show two rects
// for the same item. Cleared automatically when fresh server data
// arrives (the load prop changes).

function PendingOverlay({
  pending,
  cargoStartX,
  cargoY,
}: {
  pending: NonNullable<PendingPlacement>;
  cargoStartX: number;
  cargoY: number;
}) {
  const x = cargoStartX + pending.xIn * PX_PER_IN;
  const y = cargoY + pending.yIn * PX_PER_IN;
  const w = pending.depthIn * PX_PER_IN;
  const h = pending.widthIn * PX_PER_IN;
  return (
    <g style={{ pointerEvents: "none" }}>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill={pending.color}
        fillOpacity="0.55"
        stroke={pending.color}
        strokeWidth="1.5"
      />
      <circle
        cx={x + w - 4}
        cy={y + 4}
        r="2"
        fill="#0e3e7a"
      />
    </g>
  );
}

// ----- Packed items renderer ---------------------------------------------

function PackedItems({
  load,
  cargoStartX,
  cargoY,
  vendorColors,
  vendorNames,
  dragHandle,
  pendingPlacement,
  onItemPointerDown,
}: {
  load: LoadResult;
  cargoStartX: number;
  cargoY: number;
  vendorColors: Map<string, string>;
  vendorNames: Map<string, string>;
  dragHandle: DragHandle;
  pendingPlacement: PendingPlacement;
  onItemPointerDown: ShapeProps["onItemPointerDown"];
}) {
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
          dragHandle={dragHandle}
          pendingPlacement={pendingPlacement}
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
  dragHandle,
  pendingPlacement,
  onItemPointerDown,
}: {
  shelf: Shelf;
  cargoStartX: number;
  cargoY: number;
  vendorColors: Map<string, string>;
  vendorNames: Map<string, string>;
  dragHandle: DragHandle;
  pendingPlacement: PendingPlacement;
  onItemPointerDown: ShapeProps["onItemPointerDown"];
}) {
  // Group every stacked item by the base ground index it sits on so we
  // can render each one as its own draggable mini-rect on top of the
  // base. Each segment maps to ONE PlacedItem; pointer-down on a
  // segment drags that specific stacked item out of the stack.
  const stackedByBase = new Map<number, PlacedItem[]>();
  for (const stacked of shelf.stackedItems) {
    if (stacked.baseGroundIndex === null) continue;
    const list = stackedByBase.get(stacked.baseGroundIndex) ?? [];
    list.push(stacked);
    stackedByBase.set(stacked.baseGroundIndex, list);
  }

  function isDragMatch(placed: PlacedItem): boolean {
    return (
      dragHandle !== null &&
      dragHandle.vendorId === placed.item.vendorId &&
      dragHandle.itemIndex === placed.item.itemIndex
    );
  }

  // Items currently rendered by the optimistic overlay must be hidden
  // here, otherwise the user sees the rect at BOTH the old position
  // (this render) and the new one (the overlay).
  function isPendingMatch(placed: PlacedItem): boolean {
    return (
      pendingPlacement !== null &&
      pendingPlacement.vendorId === placed.item.vendorId &&
      pendingPlacement.itemIndex === placed.item.itemIndex
    );
  }

  return (
    <>
      {shelf.groundItems.map((placed, gi) => {
        if (isPendingMatch(placed)) return null;
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

        // Stacked-item draggable strip across the top edge. Each segment
        // is its OWN <rect> with onPointerDown - dragging it pulls that
        // stacked item out and turns it into a manual ground placement
        // at the drop coords on save.
        const stripeHeight = Math.min(10, Math.max(7, h * 0.22));
        const showStripe = stackedCount > 0 && w > 16 && h > 12;
        const segmentW = showStripe ? w / stackedCount : 0;
        const showCount = stackedCount > 0 && w > 22 && h > 14;

        const isBaseDragged = isDragMatch(placed);
        const baseFillOpacity = isBaseDragged ? 0.1 : 0.55;
        const baseStrokeDash = isBaseDragged ? "4 3" : undefined;

        const showPin = placed.isManual && w > 18 && h > 12;

        return (
          <g key={gi}>
            {/* Base rect (ground item) - draggable */}
            <rect
              x={x}
              y={y}
              width={w}
              height={h}
              fill={baseColor}
              fillOpacity={baseFillOpacity}
              stroke={baseColor}
              strokeWidth="1"
              strokeDasharray={baseStrokeDash}
              style={{
                cursor: isBaseDragged ? "grabbing" : "grab",
                touchAction: "none",
              }}
              onPointerDown={(e) =>
                onItemPointerDown({ e, placed, cargoStartX, cargoY })
              }
            />

            {/* Manual-anchor pin badge for the base */}
            {showPin && !isBaseDragged && (
              <circle
                cx={x + w - 4}
                cy={y + 4 + (showStripe ? stripeHeight : 0)}
                r="2"
                fill="#0e3e7a"
                style={{ pointerEvents: "none" }}
              />
            )}

            {/* Vendor name on the base */}
            {showName && !isBaseDragged && (
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

            {/* Stacked-item segments - each independently draggable */}
            {showStripe &&
              stackedItems.map((stk, i) => {
                if (isPendingMatch(stk)) return null;
                const segColor =
                  vendorColors.get(stk.item.vendorId) ?? "#5a6370";
                const segIsDragged = isDragMatch(stk);
                const segFillOpacity = segIsDragged ? 0.1 : 1.0;
                const segStrokeDash = segIsDragged ? "3 2" : undefined;
                return (
                  <rect
                    key={`stk-${i}`}
                    x={x + i * segmentW}
                    y={y}
                    width={segmentW}
                    height={stripeHeight}
                    fill={segColor}
                    fillOpacity={segFillOpacity}
                    stroke="#272727"
                    strokeWidth="0.5"
                    strokeDasharray={segStrokeDash}
                    style={{
                      cursor: segIsDragged ? "grabbing" : "grab",
                      touchAction: "none",
                    }}
                    onPointerDown={(e) =>
                      onItemPointerDown({
                        e,
                        placed: stk,
                        cargoStartX,
                        cargoY,
                      })
                    }
                  >
                    <title>
                      Drag to pull this {vendorNames.get(stk.item.vendorId) ?? "item"} off the stack
                    </title>
                  </rect>
                );
              })}

            {/* "+N" badge in the bottom-right corner of the base */}
            {showCount && !isBaseDragged && (
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
