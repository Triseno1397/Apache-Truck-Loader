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
  hydrateVendorInput,
  type InputMethod,
} from "@/lib/vendor-input";
import { fetchAllCases, buildCaseLookup } from "@/lib/cases";
import { TRUCK_PRESETS, truckCrossSection } from "@/lib/trucks";
import {
  packVendors,
  type ManualPlacement,
} from "@/lib/load-packer";

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
//
// truck_type and custom_truck_id moved to public.job_trucks in
// migration 0005 (one job, N trucks). buffer_pct was dropped entirely
// in migration 0007.

const JobUpdateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  client: z.string().trim().max(200).nullable().optional(),
  event_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  status: StatusEnum.optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
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

// ----- job_trucks: add ---------------------------------------------------
//
// A job always has at least one truck (the migration backfilled one per
// existing job and createJobAction creates one for new jobs). This adds
// a second/third/Nth truck. New trucks default to 26ft Penske.

export async function addJobTruckAction(
  jobId: string,
): Promise<{ ok: true; truckId: string } | { ok: false; error: string }> {
  const supabase = createAdminClient();

  // Pick the next sort_order so the new truck lands at the end of the list.
  const { data: existing, error: listErr } = await supabase
    .from("job_trucks")
    .select("sort_order")
    .eq("job_id", jobId)
    .order("sort_order", { ascending: false })
    .limit(1);
  if (listErr) return { ok: false, error: listErr.message };
  const nextSort = (existing?.[0]?.sort_order ?? -1) + 1;

  const { data, error } = await supabase
    .from("job_trucks")
    .insert({
      job_id: jobId,
      truck_type: "26ft_penske",
      sort_order: nextSort,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Failed to add truck" };
  }

  await supabase
    .from("jobs")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", jobId);

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/jobs");
  return { ok: true, truckId: data.id };
}

// ----- job_trucks: update ------------------------------------------------

const JobTruckUpdateSchema = z
  .object({
    truck_type: TruckTypeEnum.optional(),
    custom_truck_id: z.string().uuid().nullable().optional(),
    label: z.string().trim().max(80).nullable().optional(),
    sort_order: z.number().int().min(0).optional(),
  })
  // truck_type='custom' requires a custom_truck_id; the DB has the same
  // check constraint, but failing fast here gives a nicer error.
  .refine(
    (v) =>
      v.truck_type === undefined ||
      v.truck_type !== "custom" ||
      (v.custom_truck_id !== undefined && v.custom_truck_id !== null),
    { message: "Custom truck requires a custom_truck_id" },
  );

export async function updateJobTruckAction(
  jobTruckId: string,
  patch: z.input<typeof JobTruckUpdateSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = JobTruckUpdateSchema.safeParse(patch);
  if (!parsed.success) return { ok: false, error: parsed.error.message };

  const supabase = createAdminClient();

  // When the truck_type flips away from 'custom' we must clear
  // custom_truck_id to satisfy the DB check constraint - and vice versa,
  // when flipping TO 'custom' the caller must supply a custom_truck_id.
  const update: z.output<typeof JobTruckUpdateSchema> = { ...parsed.data };
  if (update.truck_type !== undefined && update.truck_type !== "custom") {
    update.custom_truck_id = null;
  }

  const { data, error } = await supabase
    .from("job_trucks")
    .update(update)
    .eq("id", jobTruckId)
    .select("job_id")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Failed to update truck" };
  }

  await supabase
    .from("jobs")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", data.job_id);

  revalidatePath(`/jobs/${data.job_id}`);
  revalidatePath("/jobs");
  return { ok: true };
}

// ----- job_trucks: delete ------------------------------------------------
//
// Cascade-deletes every vendor on this truck (FK on delete cascade). The
// UI surfaces a confirmation that names the vendor count. We block the
// last truck on a job - a job must always have at least one.

export async function deleteJobTruckAction(formData: FormData): Promise<never> {
  const jobTruckId = String(formData.get("jobTruckId") ?? "");
  const jobId = String(formData.get("jobId") ?? "");
  if (!jobTruckId || !jobId) throw new Error("Missing ids");

  const supabase = createAdminClient();

  const { count, error: countErr } = await supabase
    .from("job_trucks")
    .select("*", { count: "exact", head: true })
    .eq("job_id", jobId);
  if (countErr) throw new Error(countErr.message);
  if ((count ?? 0) <= 1) {
    throw new Error("A job must have at least one truck");
  }

  const { error } = await supabase
    .from("job_trucks")
    .delete()
    .eq("id", jobTruckId);
  if (error) throw new Error(error.message);

  await supabase
    .from("jobs")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", jobId);

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/jobs");
  redirect(`/jobs/${jobId}`);
}

// ----- vendor: create (eager, empty) ------------------------------------
//
// Auto-save model: clicking "Add vendor" inserts a placeholder row right
// away and drops the user into the edit form for that row. The vendor is
// pinned to a specific truck via jobTruckId (the active tab when the
// button was clicked).

export async function createVendorAction(formData: FormData): Promise<never> {
  const jobId = String(formData.get("jobId") ?? "");
  const jobTruckId = String(formData.get("jobTruckId") ?? "");
  if (!jobId || !jobTruckId) throw new Error("Missing jobId or jobTruckId");

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("vendors")
    .insert({
      job_id: jobId,
      job_truck_id: jobTruckId,
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
  redirect(`/jobs/${jobId}?truck=${jobTruckId}&edit=${data.id}`);
}

// ----- vendor: move to a different truck --------------------------------
//
// Reassigns a vendor to a different truck on the same job. Used by the
// per-row "move to truck" affordance.

export async function moveVendorToTruckAction(
  vendorId: string,
  newJobTruckId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!vendorId || !newJobTruckId) {
    return { ok: false, error: "Missing ids" };
  }

  const supabase = createAdminClient();

  // Cheap safety: confirm the destination truck belongs to the same job
  // as the vendor. Prevents accidental cross-job moves from a stale UI.
  const [{ data: vendor }, { data: truck }] = await Promise.all([
    supabase.from("vendors").select("job_id").eq("id", vendorId).single(),
    supabase
      .from("job_trucks")
      .select("job_id")
      .eq("id", newJobTruckId)
      .single(),
  ]);
  if (!vendor || !truck) {
    return { ok: false, error: "Vendor or truck not found" };
  }
  if (vendor.job_id !== truck.job_id) {
    return { ok: false, error: "Truck belongs to a different job" };
  }

  const { error } = await supabase
    .from("vendors")
    .update({ job_truck_id: newJobTruckId })
    .eq("id", vendorId);
  if (error) return { ok: false, error: error.message };

  await supabase
    .from("jobs")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", vendor.job_id);

  revalidatePath(`/jobs/${vendor.job_id}`);
  revalidatePath("/jobs");
  return { ok: true };
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

// ----- vendor: manual placement (drag-anchor an item) -------------------
//
// Persists the manual position of a single item (item N within a vendor's
// expansion - e.g. pallet #3 of 5). The packer pre-places these as locked
// shelves before auto-packing the rest. xIn/yIn are integer inches the UI
// has already snapped to the 6" grid; we re-clamp defensively here.

const PlacementSchema = z.object({
  vendorId: z.string().uuid(),
  itemIndex: z.number().int().nonnegative(),
  xIn: z.number().int().nonnegative().max(2000),
  yIn: z.number().int().nonnegative().max(500),
});

export async function setVendorPlacementAction(args: {
  vendorId: string;
  itemIndex: number;
  xIn: number;
  yIn: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = PlacementSchema.safeParse(args);
  if (!parsed.success) {
    // Surface the FIRST validation issue in plain English instead of
    // dumping the full ZodError tree, which used to flash up as an
    // ugly JSON blob in an alert().
    const first = parsed.error.issues[0];
    return {
      ok: false,
      error: first ? first.message : "Invalid placement",
    };
  }

  const supabase = createAdminClient();

  // 1. Identify the dragged vendor's job + truck so we can also pin
  //    every other currently-visible ground item on this truck.
  //    Without this step, dragging one item makes the auto-packer
  //    re-run on the rest, which visually shifts unrelated items -
  //    the "I dragged one but other things moved" complaint.
  const { data: dragged, error: readErr } = await supabase
    .from("vendors")
    .select("id, job_id, job_truck_id")
    .eq("id", parsed.data.vendorId)
    .single();
  if (readErr || !dragged) {
    return { ok: false, error: "Vendor not found" };
  }

  const truckId = dragged.job_truck_id;
  const jobId = dragged.job_id;

  // 2. Fetch every vendor on this truck and the truck's spec so we can
  //    recompute the current ground positions and snapshot them.
  const [
    { data: truckVendors, error: tvErr },
    { data: truckRow, error: trErr },
    cases,
  ] = await Promise.all([
    supabase
      .from("vendors")
      .select("*")
      .eq("job_truck_id", truckId)
      .order("created_at", { ascending: true }),
    supabase
      .from("job_trucks")
      .select("*")
      .eq("id", truckId)
      .single(),
    fetchAllCases(),
  ]);
  if (tvErr) return { ok: false, error: tvErr.message };
  if (trErr || !truckRow) return { ok: false, error: "Truck not found" };

  const caseMap = buildCaseLookup(cases);
  const truckSpec =
    truckRow.truck_type === "custom"
      ? TRUCK_PRESETS["26ft_penske"]
      : TRUCK_PRESETS[truckRow.truck_type as "26ft_penske" | "53ft_semi"];
  const truckCS = truckCrossSection(truckSpec);

  // 3. Hydrate vendor inputs and parse existing manual_placements.
  type Hydrated = {
    row: (typeof truckVendors)[number];
    placements: (ManualPlacement | null)[];
  };
  const hydratedRows: Hydrated[] = (truckVendors ?? []).map((row) => ({
    row,
    placements: parseSparsePlacements(row.manual_placements),
  }));

  const hydratedInputs = hydratedRows
    .map((h) => {
      const inputMethod = h.row.input_method as InputMethod;
      const hydrated = hydrateVendorInput({
        inputMethod,
        inputData: h.row.input_data as unknown,
        stackable: h.row.stackable,
        cases: caseMap,
      });
      return hydrated === null
        ? null
        : {
            id: h.row.id,
            vendorInput: hydrated,
            weightOverride: h.row.weight_lb_override,
            canBeBase: h.row.can_be_base,
            manualPlacements: h.placements,
          };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);

  // 4. Run the packer to compute every item's current position.
  const load = packVendors(hydratedInputs, truckCS);

  // 5. Build a per-vendor map of placements to write. Start from the
  //    existing manual_placements so anything already anchored stays
  //    anchored.
  const updates = new Map<string, (ManualPlacement | null)[]>();
  for (const h of hydratedRows) {
    updates.set(h.row.id, [...h.placements]);
  }

  // 6. Pin every currently-visible AUTO-packed ground item to its
  //    rendered position. Ignore stacked items (they re-stack on
  //    pinned bases automatically).
  for (const shelf of load.shelves) {
    for (const placed of shelf.groundItems) {
      if (placed.isManual) continue;
      const arr = updates.get(placed.item.vendorId);
      if (!arr) continue;
      while (arr.length <= placed.item.itemIndex) arr.push(null);
      arr[placed.item.itemIndex] = {
        xIn: shelf.startIn,
        yIn: placed.xIn,
      };
    }
  }

  // 7. Apply the user's drop on top of any auto-pin for the same slot.
  const draggedArr = updates.get(parsed.data.vendorId);
  if (draggedArr) {
    while (draggedArr.length <= parsed.data.itemIndex) draggedArr.push(null);
    draggedArr[parsed.data.itemIndex] = {
      xIn: parsed.data.xIn,
      yIn: parsed.data.yIn,
    };
  }

  // 8. Persist every vendor whose placements actually changed. Skip
  //    rows that match what's already in the DB to avoid pointless
  //    writes.
  const dirty = hydratedRows.filter((h) => {
    const next = updates.get(h.row.id);
    return next !== undefined && !placementsEqual(h.placements, next);
  });
  for (const h of dirty) {
    const next = updates.get(h.row.id);
    if (!next) continue;
    const { error } = await supabase
      .from("vendors")
      .update({ manual_placements: next as unknown as Json })
      .eq("id", h.row.id);
    if (error) return { ok: false, error: error.message };
  }

  await supabase
    .from("jobs")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", jobId);

  revalidatePath(`/jobs/${jobId}`);
  return { ok: true };
}

// Defensive parse: returns a sparse array of placements where bad
// entries become null (which the packer treats as "auto-pack this
// slot"). Mirrors page.tsx's parseManualPlacements but lives here so
// the action doesn't depend on a page module.
function parseSparsePlacements(
  raw: unknown,
): (ManualPlacement | null)[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    if (
      entry &&
      typeof entry === "object" &&
      typeof (entry as { xIn?: unknown }).xIn === "number" &&
      typeof (entry as { yIn?: unknown }).yIn === "number"
    ) {
      return {
        xIn: (entry as { xIn: number }).xIn,
        yIn: (entry as { yIn: number }).yIn,
      };
    }
    return null;
  });
}

function placementsEqual(
  a: (ManualPlacement | null)[],
  b: (ManualPlacement | null)[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x === null && y === null) continue;
    if (x === null || y === null) return false;
    if (x.xIn !== y.xIn || x.yIn !== y.yIn) return false;
  }
  return true;
}

// Clear every manual placement for every vendor on a single truck. Used
// by the per-truck "Reset placements" affordance to fall back to pure
// auto-packing.
export async function clearTruckPlacementsAction(
  formData: FormData,
): Promise<never> {
  const jobTruckId = String(formData.get("jobTruckId") ?? "");
  const jobId = String(formData.get("jobId") ?? "");
  if (!jobTruckId || !jobId) throw new Error("Missing ids");

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("vendors")
    .update({ manual_placements: [] as unknown as Json })
    .eq("job_truck_id", jobTruckId);
  if (error) throw new Error(error.message);

  await supabase
    .from("jobs")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", jobId);

  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}?truck=${jobTruckId}`);
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

// ----- snapshots --------------------------------------------------------
//
// A snapshot is an immutable JSONB blob capturing the full state of a
// job (job + every job_truck + every vendor with its manual_placements)
// at a moment in time. Used by the crew to lock in "this is the plan
// we're committing to" before a load. Restoring rewinds the live job
// back to the snapshot's state; restoring is itself reversible because
// it auto-takes a fresh snapshot of the current state first.
//
// Schema (public.job_snapshots) is immutable - no UPDATE / DELETE RLS
// policies. We never delete or rewrite snapshots.

const SNAPSHOT_VERSION = 1;

type SnapshotBlob = {
  version: number;
  job: {
    name: string;
    client: string | null;
    event_date: string | null;
    status: "draft" | "confirmed" | "loaded" | "archived";
    notes: string | null;
  };
  trucks: Array<{
    truck_type: "26ft_penske" | "53ft_semi" | "custom";
    custom_truck_id: string | null;
    label: string | null;
    sort_order: number;
  }>;
  vendors: Array<{
    // index into the trucks[] array - we don't carry the live truck
    // UUIDs because restoring will mint new ones
    job_truck_idx: number;
    name: string;
    input_method: InputMethod;
    input_data: Record<string, unknown>;
    stackable: boolean | null;
    can_be_base: boolean | null;
    weight_lb_override: number | null;
    notes: string | null;
    manual_placements: Array<{ xIn: number; yIn: number } | null>;
  }>;
};

async function captureSnapshot(jobId: string): Promise<SnapshotBlob> {
  const supabase = createAdminClient();
  const [
    { data: job, error: jobErr },
    { data: trucks, error: trucksErr },
    { data: vendors, error: vendorsErr },
  ] = await Promise.all([
    supabase.from("jobs").select("*").eq("id", jobId).single(),
    supabase
      .from("job_trucks")
      .select("*")
      .eq("job_id", jobId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("vendors")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: true }),
  ]);
  if (jobErr || !job) throw new Error(jobErr?.message ?? "Job not found");
  if (trucksErr) throw new Error(trucksErr.message);
  if (vendorsErr) throw new Error(vendorsErr.message);

  // Map live truck IDs to indexes in the captured array so vendor
  // restore can resolve which truck a vendor belongs to without UUIDs.
  const truckIdxById = new Map<string, number>();
  (trucks ?? []).forEach((t, i) => truckIdxById.set(t.id, i));

  return {
    version: SNAPSHOT_VERSION,
    job: {
      name: job.name,
      client: job.client,
      event_date: job.event_date,
      status: job.status,
      notes: job.notes,
    },
    trucks: (trucks ?? []).map((t) => ({
      truck_type: t.truck_type,
      custom_truck_id: t.custom_truck_id,
      label: t.label,
      sort_order: t.sort_order,
    })),
    vendors: (vendors ?? []).map((v) => ({
      job_truck_idx: truckIdxById.get(v.job_truck_id) ?? 0,
      name: v.name,
      input_method: v.input_method as InputMethod,
      input_data: (v.input_data ?? {}) as Record<string, unknown>,
      stackable: v.stackable,
      can_be_base: v.can_be_base,
      weight_lb_override: v.weight_lb_override,
      notes: v.notes,
      manual_placements: Array.isArray(v.manual_placements)
        ? (v.manual_placements as Array<{ xIn: number; yIn: number } | null>)
        : [],
    })),
  };
}

export async function createSnapshotAction(args: {
  jobId: string;
  label: string | null;
}): Promise<{ ok: true; snapshotId: string } | { ok: false; error: string }> {
  const jobId = args.jobId;
  if (!jobId) return { ok: false, error: "Missing jobId" };

  try {
    const blob = await captureSnapshot(jobId);
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("job_snapshots")
      .insert({
        job_id: jobId,
        label: args.label?.trim() || null,
        data: blob as unknown as Json,
      })
      .select("id")
      .single();
    if (error || !data) {
      return { ok: false, error: error?.message ?? "Failed to save snapshot" };
    }
    revalidatePath(`/jobs/${jobId}`);
    return { ok: true, snapshotId: data.id };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to save snapshot",
    };
  }
}

// Replay a snapshot back into the live job. Auto-takes a "before
// restore" snapshot first so the operation is reversible. Then deletes
// every current truck + vendor and re-inserts from the blob. This is
// not a single SQL transaction - if it fails midway the auto-snapshot
// is the recovery path.
export async function restoreSnapshotAction(
  formData: FormData,
): Promise<never> {
  const snapshotId = String(formData.get("snapshotId") ?? "");
  const jobId = String(formData.get("jobId") ?? "");
  if (!snapshotId || !jobId) throw new Error("Missing ids");

  const supabase = createAdminClient();

  // 1. Read the snapshot blob.
  const { data: snap, error: snapErr } = await supabase
    .from("job_snapshots")
    .select("data, label, created_at")
    .eq("id", snapshotId)
    .single();
  if (snapErr || !snap) throw new Error(snapErr?.message ?? "Snapshot not found");
  const blob = snap.data as unknown as SnapshotBlob;
  if (!blob || blob.version !== SNAPSHOT_VERSION) {
    throw new Error("Unsupported snapshot version");
  }

  // 2. Auto-snapshot the current state for reversibility. Label it so
  //    the user can find it.
  const auto = await captureSnapshot(jobId);
  const restoreLabel = `Auto-saved before restoring "${snap.label ?? new Date(snap.created_at).toLocaleString()}"`;
  await supabase.from("job_snapshots").insert({
    job_id: jobId,
    label: restoreLabel,
    data: auto as unknown as Json,
  });

  // 3. Delete current trucks (cascades to vendors via FK on delete).
  const { error: delErr } = await supabase
    .from("job_trucks")
    .delete()
    .eq("job_id", jobId);
  if (delErr) throw new Error(delErr.message);

  // 4. Update job-level fields.
  await supabase
    .from("jobs")
    .update({
      name: blob.job.name,
      client: blob.job.client,
      event_date: blob.job.event_date,
      status: blob.job.status,
      notes: blob.job.notes,
    })
    .eq("id", jobId);

  // 5. Re-create trucks. Capture the new IDs in order so vendors can
  //    resolve their job_truck_id by index.
  const truckIds: string[] = [];
  for (const t of blob.trucks) {
    const { data, error } = await supabase
      .from("job_trucks")
      .insert({
        job_id: jobId,
        truck_type: t.truck_type,
        custom_truck_id:
          t.truck_type === "custom" ? t.custom_truck_id : null,
        label: t.label,
        sort_order: t.sort_order,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Truck insert failed");
    truckIds.push(data.id);
  }

  // 6. Re-create vendors, mapping job_truck_idx -> the freshly-minted
  //    truck IDs.
  if (blob.vendors.length > 0) {
    const vendorRows = blob.vendors.map((v) => ({
      job_id: jobId,
      job_truck_id:
        truckIds[v.job_truck_idx] ?? truckIds[0] ?? truckIds[truckIds.length - 1],
      name: v.name,
      input_method: v.input_method,
      input_data: v.input_data as Json,
      stackable: v.stackable,
      can_be_base: v.can_be_base,
      weight_lb_override: v.weight_lb_override,
      notes: v.notes,
      manual_placements: v.manual_placements as unknown as Json,
    }));
    const { error: vErr } = await supabase.from("vendors").insert(vendorRows);
    if (vErr) throw new Error(vErr.message);
  }

  // 7. Touch updated_at so the jobs list reflects the change.
  await supabase
    .from("jobs")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", jobId);

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/jobs");
  redirect(`/jobs/${jobId}`);
}
