// Helpers around the case_library table. Phase 1 only reads global
// presets; org-specific cases come in step 10.

import { createAdminClient } from "@/lib/supabase/admin";
import {
  CASE_CATEGORY_ORDER,
  type CaseCategory,
  type CaseLookup,
  type CasePreset,
} from "@/lib/vendor-input";

const CATEGORY_RANK: Record<CaseCategory, number> = CASE_CATEGORY_ORDER.reduce(
  (acc, cat, i) => {
    acc[cat] = i;
    return acc;
  },
  {} as Record<CaseCategory, number>,
);

function normalizeCategory(raw: string | null): CaseCategory | null {
  if (raw === null) return null;
  return (CASE_CATEGORY_ORDER as readonly string[]).includes(raw)
    ? (raw as CaseCategory)
    : null;
}

export async function fetchAllCases(): Promise<CasePreset[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("case_library")
    .select(
      "id, label, depth_in, width_in, height_in, weight_lb, stackable, max_stack, category",
    );

  if (error || !data) return [];

  const presets = data.map<CasePreset>((row) => ({
    id: row.id,
    label: row.label,
    depthIn: Number(row.depth_in),
    widthIn: Number(row.width_in),
    heightIn: Number(row.height_in),
    weightLb: Number(row.weight_lb),
    stackable: row.stackable,
    maxStack: row.max_stack,
    category: normalizeCategory(row.category),
  }));

  // Sort by category order, then alphabetically by label within each
  // category. Uncategorized (org) cases sort last.
  presets.sort((a, b) => {
    const ra = a.category === null ? Number.MAX_SAFE_INTEGER : CATEGORY_RANK[a.category];
    const rb = b.category === null ? Number.MAX_SAFE_INTEGER : CATEGORY_RANK[b.category];
    if (ra !== rb) return ra - rb;
    return a.label.localeCompare(b.label);
  });

  return presets;
}

export function buildCaseLookup(cases: CasePreset[]): CaseLookup {
  return new Map(cases.map((c) => [c.id, c]));
}
