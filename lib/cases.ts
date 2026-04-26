// Helpers around the case_library table. Phase 1 only reads global
// presets; org-specific cases come in step 10.

import { createAdminClient } from "@/lib/supabase/admin";
import type { CaseLookup, CasePreset } from "@/lib/vendor-input";

export async function fetchAllCases(): Promise<CasePreset[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("case_library")
    .select(
      "id, label, depth_in, width_in, height_in, weight_lb, stackable, max_stack",
    )
    .order("label", { ascending: true });

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    label: row.label,
    depthIn: Number(row.depth_in),
    widthIn: Number(row.width_in),
    heightIn: Number(row.height_in),
    weightLb: Number(row.weight_lb),
    stackable: row.stackable,
    maxStack: row.max_stack,
  }));
}

export function buildCaseLookup(cases: CasePreset[]): CaseLookup {
  return new Map(cases.map((c) => [c.id, c]));
}
