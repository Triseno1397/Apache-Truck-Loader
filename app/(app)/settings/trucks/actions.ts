"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

// custom_trucks CRUD. Linked to job_trucks via FK on delete set null,
// but the job_trucks consistency check requires custom_truck_id NOT NULL
// when truck_type='custom'. So if we let a delete cascade it would
// trip the check constraint and fail with an ugly error - we pre-check
// for references and refuse the delete with a friendlier message.

const TruckInputSchema = z.object({
  label: z.string().trim().min(1).max(80),
  interiorLengthFt: z.number().positive().max(200),
  interiorWidthFt: z.number().positive().max(20),
  interiorHeightFt: z.number().positive().max(20),
  cargoWeightLb: z.number().positive().max(200000),
  hasLiftgate: z.boolean(),
  liftgateLb: z.number().nonnegative().max(20000).nullable(),
});

type TruckInput = z.input<typeof TruckInputSchema>;

export async function createCustomTruckAction(
  args: TruckInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const parsed = TruckInputSchema.safeParse(args);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid truck",
    };
  }
  const t = parsed.data;
  // No liftgate => liftgate_lb meaningless. Force null so the row stays
  // internally consistent regardless of what the form sent.
  const liftgateLb = t.hasLiftgate ? t.liftgateLb : null;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("custom_trucks")
    .insert({
      label: t.label,
      interior_length_ft: t.interiorLengthFt,
      interior_width_ft: t.interiorWidthFt,
      interior_height_ft: t.interiorHeightFt,
      cargo_weight_lb: t.cargoWeightLb,
      has_liftgate: t.hasLiftgate,
      liftgate_lb: liftgateLb,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Failed to create truck" };
  }

  revalidatePath("/settings/trucks");
  return { ok: true, id: data.id };
}

export async function updateCustomTruckAction(args: {
  id: string;
  patch: TruckInput;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!args.id) return { ok: false, error: "Missing truck id" };
  const parsed = TruckInputSchema.safeParse(args.patch);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid truck",
    };
  }
  const t = parsed.data;
  const liftgateLb = t.hasLiftgate ? t.liftgateLb : null;

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("custom_trucks")
    .update({
      label: t.label,
      interior_length_ft: t.interiorLengthFt,
      interior_width_ft: t.interiorWidthFt,
      interior_height_ft: t.interiorHeightFt,
      cargo_weight_lb: t.cargoWeightLb,
      has_liftgate: t.hasLiftgate,
      liftgate_lb: liftgateLb,
    })
    .eq("id", args.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings/trucks");
  // Job pages cache the resolved truck dims; any job using this custom
  // truck now needs to re-render with the new dimensions.
  revalidatePath("/jobs", "layout");
  return { ok: true };
}

export async function deleteCustomTruckAction(args: {
  id: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!args.id) return { ok: false, error: "Missing truck id" };

  const supabase = createAdminClient();

  // Pre-check: any job_truck row referencing this custom truck would
  // fail the consistency check on cascade SET NULL. Refuse with a
  // helpful count instead of letting Postgres yell.
  const { count, error: countErr } = await supabase
    .from("job_trucks")
    .select("id", { count: "exact", head: true })
    .eq("custom_truck_id", args.id);
  if (countErr) return { ok: false, error: countErr.message };
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: `${count} job truck${count === 1 ? "" : "s"} use this custom truck. Reassign them to a different truck first.`,
    };
  }

  const { error } = await supabase
    .from("custom_trucks")
    .delete()
    .eq("id", args.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings/trucks");
  return { ok: true };
}
