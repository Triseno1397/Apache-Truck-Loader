import { Truck } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { TRUCK_PRESETS, type CustomTruckRow } from "@/lib/trucks";
import CustomTrucksClient from "@/components/truck/CustomTrucksClient";

export default async function CustomTrucksPage() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("custom_trucks")
    .select(
      "id, label, interior_length_ft, interior_width_ft, interior_height_ft, cubic_feet, cargo_weight_lb, has_liftgate, liftgate_lb",
    )
    .order("label", { ascending: true });

  if (error) {
    return (
      <div className="border border-[#dc2626]/30 bg-[#dc2626]/10 text-[#dc2626] rounded-md p-4 text-sm">
        Could not load custom trucks: {error.message}
      </div>
    );
  }

  const customs: CustomTruckRow[] = (data ?? []).map((r) => ({
    id: r.id,
    label: r.label,
    interiorLengthFt: Number(r.interior_length_ft),
    interiorWidthFt: Number(r.interior_width_ft),
    interiorHeightFt: Number(r.interior_height_ft),
    cubicFeet: Number(r.cubic_feet),
    cargoWeightLb: Number(r.cargo_weight_lb),
    hasLiftgate: r.has_liftgate,
    liftgateLb: r.liftgate_lb === null ? null : Number(r.liftgate_lb),
  }));

  return (
    <>
      <div className="mb-4 sm:mb-5">
        <h1 className="text-base sm:text-lg font-semibold tracking-tight text-[#0e3e7a]">
          Custom Trucks
        </h1>
        <div className="text-[11px] sm:text-xs text-[#5a6370] mt-1 max-w-2xl">
          Define trucks beyond the two stock presets so jobs that ride in
          something else (a smaller box truck, a flatbed, an unusual rental)
          pack against the right interior dimensions.
        </div>
      </div>

      <section className="mb-6">
        <CustomTrucksClient customs={customs} />
      </section>

      <section>
        <div className="text-[10px] tracking-[0.2em] text-[#9ca3af] uppercase mb-2">
          Stock presets (read-only)
        </div>
        <ul className="border border-[#e6e8eb] bg-[#f8f9fa] rounded-md divide-y divide-[#e6e8eb] overflow-hidden">
          {Object.values(TRUCK_PRESETS).map((p) => (
            <li
              key={p.id}
              className="px-3 sm:px-4 py-2 flex items-center justify-between gap-3 hover:bg-[#eff1f4] transition-colors duration-150"
            >
              <div className="min-w-0 flex-1">
                <div className="text-[13px] text-[#272727] font-medium truncate flex items-center gap-1.5">
                  <Truck size={12} className="text-[#9ca3af] flex-shrink-0" />
                  {p.label}
                </div>
                <div className="text-[10px] text-[#9ca3af] mono tracking-wider mt-0.5 flex flex-wrap gap-x-3">
                  <span>
                    {p.interiorLengthFt}&apos; × {p.interiorWidthFt}&apos; ×{" "}
                    {p.interiorHeightFt}&apos;
                  </span>
                  <span>{p.cubicFeet.toLocaleString()} CU FT</span>
                  <span>{p.cargoWeightLb.toLocaleString()} LB MAX</span>
                  {p.hasLiftgate && p.liftgateLb !== null && (
                    <span>{p.liftgateLb} LB LIFTGATE</span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
