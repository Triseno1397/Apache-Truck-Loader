"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";
import {
  InputDataCubicSchema,
  InputDataDimensionsSchema,
  InputDataFootprintSchema,
  InputDataImageSchema,
  InputDataLinearSchema,
  InputDataPalletsSchema,
  InputDataPiecesSchema,
  type InputMethod,
} from "@/lib/vendor-input";

const INPUT_METHODS = [
  "linear",
  "dimensions",
  "pieces",
  "cubic",
  "footprint",
  "pallets",
  "image",
] as const satisfies readonly InputMethod[];

const InputMethodEnum = z.enum(INPUT_METHODS);
const TruckTypeEnum = z.enum(["26ft_penske", "53ft_semi", "custom"]);
const StatusEnum = z.enum(["draft", "confirmed", "loaded", "archived"]);

// ----- job updates -------------------------------------------------------

const JobUpdateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  client: z.string().trim().max(200).nullable().optional(),
  event_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  truck_type: TruckTypeEnum.optional(),
  status: StatusEnum.optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  buffer_pct: z.number().int().min(0).max(100).optional(),
});

export async function updateJobAction(
  jobId: string,
  patch: z.input<typeof JobUpdateSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = JobUpdateSchema.safeParse(patch);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message };
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("jobs")
    .update(parsed.data)
    .eq("id", jobId);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/jobs");
  return { ok: true };
}

// ----- vendor: create (eager, empty) ------------------------------------
//
// Auto-save model: clicking "Add vendor" inserts a placeholder row right
// away and drops the user into the edit form for that row. Subsequent
// edits are auto-saved by updateVendorAction. If they navigate away
// without typing anything, the row stays as "Untitled vendor" with 0/0
// numbers - they can delete it from the list.

export async function createVendorAction(formData: FormData): Promise<never> {
  const jobId = String(formData.get("jobId") ?? "");
  if (!jobId) throw new Error("Missing jobId");

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("vendors")
    .insert({
      job_id: jobId,
      name: "Untitled vendor",
      input_method: "linear",
      input_data: {} as Json,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to create vendor");

  await supabase
    .from("jobs")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", jobId);

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/jobs");
  redirect(`/jobs/${jobId}?edit=${data.id}`);
}

// ----- vendor: update (auto-save) ---------------------------------------

const VendorUpdateSchema = z.object({
  vendorId: z.string().uuid(),
  jobId: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  inputMethod: InputMethodEnum,
  inputData: z.record(z.string(), z.unknown()),
  stackable: z.boolean().nullable(),
  canBeBase: z.boolean().nullable(),
  weightOverride: z.number().nonnegative().nullable(),
  notes: z.string().trim().max(2000).nullable(),
});

type InputDataResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string };

function validateInputData(
  method: InputMethod,
  raw: Record<string, unknown>,
): InputDataResult {
  try {
    switch (method) {
      case "linear":
        return { ok: true, data: InputDataLinearSchema.parse(raw) };
      case "cubic":
        return { ok: true, data: InputDataCubicSchema.parse(raw) };
      case "footprint":
        return { ok: true, data: InputDataFootprintSchema.parse(raw) };
      case "dimensions":
        return { ok: true, data: InputDataDimensionsSchema.parse(raw) };
      case "pieces":
        return { ok: true, data: InputDataPiecesSchema.parse(raw) };
      case "pallets":
        return { ok: true, data: InputDataPalletsSchema.parse(raw) };
      case "image":
        return { ok: true, data: InputDataImageSchema.parse(raw) };
    }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Invalid input data",
    };
  }
}

export async function updateVendorAction(args: {
  vendorId: string;
  jobId: string;
  name: string;
  inputMethod: InputMethod;
  inputData: Record<string, unknown>;
  stackable: boolean | null;
  canBeBase: boolean | null;
  weightOverride: number | null;
  notes: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = VendorUpdateSchema.safeParse(args);
  if (!parsed.success) return { ok: false, error: parsed.error.message };

  const dataValidation = validateInputData(
    parsed.data.inputMethod,
    parsed.data.inputData,
  );
  if (!dataValidation.ok) {
    return { ok: false, error: dataValidation.error };
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("vendors")
    .update({
      name: parsed.data.name,
      input_method: parsed.data.inputMethod,
      input_data: dataValidation.data as Json,
      stackable: parsed.data.stackable,
      can_be_base: parsed.data.canBeBase,
      weight_lb_override: parsed.data.weightOverride,
      notes: parsed.data.notes,
    })
    .eq("id", parsed.data.vendorId);

  if (error) return { ok: false, error: error.message };

  // Touch the job so updated_at refreshes (drives jobs-list ordering).
  await supabase
    .from("jobs")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", parsed.data.jobId);

  revalidatePath(`/jobs/${parsed.data.jobId}`);
  revalidatePath("/jobs");
  return { ok: true };
}

// ----- vendor: delete ---------------------------------------------------

export async function deleteVendorAction(formData: FormData): Promise<never> {
  const vendorId = String(formData.get("vendorId") ?? "");
  const jobId = String(formData.get("jobId") ?? "");
  if (!vendorId || !jobId) throw new Error("Missing ids");

  const supabase = createAdminClient();
  const { error } = await supabase.from("vendors").delete().eq("id", vendorId);
  if (error) throw new Error(error.message);

  await supabase
    .from("jobs")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", jobId);

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/jobs");
  redirect(`/jobs/${jobId}`);
}

export async function deleteJobAction(formData: FormData): Promise<never> {
  const jobId = String(formData.get("jobId") ?? "");
  if (!jobId) throw new Error("Missing jobId");

  const supabase = createAdminClient();
  const { error } = await supabase.from("jobs").delete().eq("id", jobId);
  if (error) throw new Error(error.message);

  revalidatePath("/jobs");
  redirect("/jobs");
}
