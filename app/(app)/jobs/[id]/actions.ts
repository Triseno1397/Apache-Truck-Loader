"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";
import {
  parseInputDataFromForm,
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

// ----- vendor save / delete ---------------------------------------------

function readWeightOverride(form: FormData): number | null {
  const raw = form.get("weight_lb_override");
  if (raw === null || String(raw).trim() === "") return null;
  const n = parseFloat(String(raw));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function readStackableOverride(form: FormData): boolean | null {
  const raw = form.get("stackable");
  if (raw === null || raw === "" || raw === "default") return null;
  return raw === "true";
}

export async function saveVendorAction(formData: FormData): Promise<never> {
  const jobId = String(formData.get("jobId") ?? "");
  const vendorId = String(formData.get("vendorId") ?? "") || null;
  if (!jobId) throw new Error("Missing jobId");

  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Vendor name is required");

  const methodRaw = String(formData.get("input_method") ?? "");
  const methodParse = InputMethodEnum.safeParse(methodRaw);
  if (!methodParse.success) throw new Error("Invalid input method");
  const method = methodParse.data;

  const inputData = parseInputDataFromForm(method, formData);

  // Zod validated `inputData` above via parseInputDataFromForm; the cast to
  // Json is the explicit trust-boundary handoff to Supabase's jsonb column.
  const row = {
    job_id: jobId,
    name,
    input_method: method,
    input_data: inputData as Json,
    stackable: readStackableOverride(formData),
    weight_lb_override: readWeightOverride(formData),
    notes: (String(formData.get("notes") ?? "").trim() || null) as
      | string
      | null,
  };

  const supabase = createAdminClient();
  if (vendorId) {
    const { error } = await supabase
      .from("vendors")
      .update(row)
      .eq("id", vendorId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("vendors").insert(row);
    if (error) throw new Error(error.message);
  }

  // Touch the job so updated_at refreshes (used by the jobs list ordering).
  await supabase
    .from("jobs")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", jobId);

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/jobs");
  redirect(`/jobs/${jobId}`);
}

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
