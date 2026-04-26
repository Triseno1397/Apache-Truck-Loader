"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Eye, View } from "lucide-react";

export type TruckView = "top" | "side";

type Props = {
  jobId: string;
  active: TruckView;
};

// Segmented TOP / SIDE pill that lives above the truck render. View
// state persists in the URL so a refresh keeps you on the same view,
// and so the editor server component reads it directly without round-
// tripping through client state. Other URL params (truck=, edit=) are
// preserved.

export default function TruckViewToggle({ jobId, active }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setView(next: TruckView) {
    if (next === active) return;
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("view", next);
    router.replace(`/jobs/${jobId}?${sp.toString()}`, { scroll: false });
  }

  return (
    <div className="inline-flex bg-white border border-[#d1d5db] rounded-md overflow-hidden">
      <ToggleButton
        label="Top"
        Icon={View}
        active={active === "top"}
        onClick={() => setView("top")}
      />
      <ToggleButton
        label="Side"
        Icon={Eye}
        active={active === "side"}
        onClick={() => setView("side")}
      />
    </div>
  );
}

function ToggleButton({
  label,
  Icon,
  active,
  onClick,
}: {
  label: string;
  Icon: typeof Eye;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold tracking-[0.15em] uppercase transition min-h-[36px] ${
        active
          ? "bg-[#0e3e7a] text-white"
          : "text-[#5a6370] hover:text-[#0e3e7a] hover:bg-[#0e3e7a]/[0.04]"
      }`}
    >
      <Icon size={12} />
      {label}
    </button>
  );
}
