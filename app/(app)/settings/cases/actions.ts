"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

// Org-specific cases only. Global presets (is_global=true) are seeded
// by migrations and treated as read-only at the app level. Each action
// hard-checks is_global on the existing row before mutating to keep a
// stale UI from sneaking through an edit on a row that flipped to
// global between page load and submit.

const CaseInputSchema = z.object({
  label: z.string().trim().min(1).max(200),
  depthIn: z.number().positive().max(2000),
  widthIn: z.number().positive().max(500),
  heightIn: z.number().positive().max(500),
  weightLb: z.number().nonnegative().max(50000),
  stackable: z.boolean(),
  maxStack: z.number().int().min(1).max(20),
});

type CaseInput = z.input<typeof CaseInputSchema>;

export async function createCustomCaseAction(
  args: CaseInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const parsed = CaseInputSchema.safeParse(args);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid case" };
  }
  const { label, depthIn, widthIn, heightIn, weightLb, stackable, maxStack } =
    parsed.data;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("case_library")
    .insert({
      label,
      depth_in: depthIn,
      width_in: widthIn,
      height_in: heightIn,
      weight_lb: weightLb,
      stackable,
      max_stack: maxStack,
      is_global: false,
      // category is null for org-specific cases - the DB constraint
      // (case_library_category_valid) explicitly allows null and the
      // case picker buckets uncategorized cases under "Other".
      category: null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Failed to create case" };
  }

  revalidatePath("/settings/cases");
  return { ok: true, id: data.id };
}

export async function updateCustomCaseAction(args: {
  id: string;
  patch: CaseInput;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!args.id) return { ok: false, error: "Missing case id" };
  const parsed = CaseInputSchema.safeParse(args.patch);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid case" };
  }

  const supabase = createAdminClient();

  // Defense in depth: the admin client bypasses RLS, so without an
  // explicit guard on is_global we'd silently overwrite seeded global
  // presets if the caller passed a wrong id.
  const { data: existing, error: readErr } = await supabase
    .from("case_library")
    .select("id, is_global")
    .eq("id", args.id)
    .single();
  if (readErr || !existing) {
    return { ok: false, error: readErr?.message ?? "Case not found" };
  }
  if (existing.is_global) {
    return { ok: false, error: "Global presets are read-only" };
  }

  const { label, depthIn, widthIn, heightIn, weightLb, stackable, maxStack } =
    parsed.data;
  const { error } = await supabase
    .from("case_library")
    .update({
      label,
      depth_in: depthIn,
      width_in: widthIn,
      height_in: heightIn,
      weight_lb: weightLb,
      stackable,
      max_stack: maxStack,
    })
    .eq("id", args.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings/cases");
  // Vendor rows reference cases by id - their hydrated dimensions
  // change when the case dims change, so any open job must re-pack.
  revalidatePath("/jobs", "layout");
  return { ok: true };
}

export async function deleteCustomCaseAction(args: {
  id: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!args.id) return { ok: false, error: "Missing case id" };

  const supabase = createAdminClient();

  const { data: existing, error: readErr } = await supabase
    .from("case_library")
    .select("id, is_global")
    .eq("id", args.id)
    .single();
  if (readErr || !existing) {
    return { ok: false, error: readErr?.message ?? "Case not found" };
  }
  if (existing.is_global) {
    return { ok: false, error: "Global presets can't be deleted" };
  }

  const { error } = await supabase
    .from("case_library")
    .delete()
    .eq("id", args.id);
  if (error) return { ok: false, error: error.message };

  // Vendors that referenced this caseId will hydrate to the
  // zero-dim placeholder (lib/vendor-input.ts handles a missing
  // lookup) - the UI will show the row as "0 LIN FT / 0 LB" which
  // signals "go re-pick a case."
  revalidatePath("/settings/cases");
  revalidatePath("/jobs", "layout");
  return { ok: true };
}
