"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Loader2 } from "lucide-react";
import { moveVendorToTruckAction } from "@/app/(app)/jobs/[id]/actions";

type Props = {
  vendorId: string;
  otherTrucks: ReadonlyArray<{ id: string; label: string }>;
};

export default function MoveVendorMenu({ vendorId, otherTrucks }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [moving, startMoving] = useTransition();
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close on outside click and on Escape.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (otherTrucks.length === 0) return null;

  function moveTo(truckId: string) {
    setOpen(false);
    startMoving(async () => {
      const result = await moveVendorToTruckAction(vendorId, truckId);
      if (result.ok) {
        router.refresh();
      } else {
        alert(`Couldn't move vendor: ${result.error}`);
      }
    });
  }

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={moving}
        className="text-[#9ca3af] hover:text-[#0e3e7a] p-2 -m-2 transition-colors duration-150 active:translate-y-[0.5px] disabled:opacity-50"
        title="Move to another truck"
      >
        {moving ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <ArrowRightLeft size={14} />
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-10 bg-white border border-[#d1d5db] rounded-md py-1 min-w-[180px]">
          <div className="px-3 py-1 text-[10px] tracking-[0.15em] text-[#9ca3af] uppercase border-b border-[#e6e8eb] mb-1">
            Move to
          </div>
          {otherTrucks.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => moveTo(t.id)}
              className="w-full text-left px-3 py-2 text-xs text-[#272727] hover:bg-[#eff1f4] transition-colors duration-150"
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
