import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isValidSession, SESSION_COOKIE } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  TRUCK_PRESETS,
  customTruckSpec,
  type CustomTruckRow,
  type TruckSpec,
} from "@/lib/trucks";
import { fetchAllCases, buildCaseLookup } from "@/lib/cases";
import {
  hydrateVendorInput,
  type InputMethod,
} from "@/lib/vendor-input";
import {
  computeVendorPacking,
  computeVendorWeight,
} from "@/lib/packing";

// CSV download for a job. One row per vendor, with the truck context
// repeated on each row so the file imports cleanly into a spreadsheet.
//
// Columns: Truck #, Truck Label, Truck Type, Vendor, Method, Linear Ft,
// Weight LB, Stackable, Notes
//
// Auth: this route lives under (app) but route handlers don't run the
// (app) layout's session check, so we do it inline. Without this any
// signed-out caller could pull job data via curl.

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const cookieStore = await cookies();
  const ok = await isValidSession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!ok) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { id } = await context.params;
  const supabase = createAdminClient();

  const [
    { data: job, error: jobErr },
    { data: truckRows },
    { data: vendors },
    cases,
  ] = await Promise.all([
    supabase.from("jobs").select("id, name").eq("id", id).single(),
    supabase
      .from("job_trucks")
      .select("*")
      .eq("job_id", id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("vendors")
      .select("*")
      .eq("job_id", id)
      .order("created_at", { ascending: true }),
    fetchAllCases(),
  ]);

  if (jobErr || !job) {
    return new NextResponse("Job not found", { status: 404 });
  }

  const trucks = truckRows ?? [];

  // Resolve any custom_trucks the job references so we can label them.
  const customTruckIds = Array.from(
    new Set(
      trucks
        .map((t) => t.custom_truck_id)
        .filter((idVal): idVal is string => idVal !== null),
    ),
  );
  const customTruckById = new Map<string, CustomTruckRow>();
  if (customTruckIds.length > 0) {
    const { data: customRows } = await supabase
      .from("custom_trucks")
      .select(
        "id, label, interior_length_ft, interior_width_ft, interior_height_ft, cubic_feet, cargo_weight_lb, has_liftgate, liftgate_lb",
      )
      .in("id", customTruckIds);
    for (const r of customRows ?? []) {
      customTruckById.set(r.id, {
        id: r.id,
        label: r.label,
        interiorLengthFt: Number(r.interior_length_ft),
        interiorWidthFt: Number(r.interior_width_ft),
        interiorHeightFt: Number(r.interior_height_ft),
        cubicFeet: Number(r.cubic_feet),
        cargoWeightLb: Number(r.cargo_weight_lb),
        hasLiftgate: r.has_liftgate,
        liftgateLb: r.liftgate_lb === null ? null : Number(r.liftgate_lb),
      });
    }
  }

  function specFor(t: (typeof trucks)[number]): TruckSpec {
    if (t.truck_type !== "custom") {
      return TRUCK_PRESETS[t.truck_type as "26ft_penske" | "53ft_semi"];
    }
    const ref = t.custom_truck_id ? customTruckById.get(t.custom_truck_id) : null;
    return ref ? customTruckSpec(ref) : TRUCK_PRESETS["26ft_penske"];
  }

  const truckIndexById = new Map<string, { index: number; spec: TruckSpec; label: string }>();
  trucks.forEach((t, i) => {
    const spec = specFor(t);
    truckIndexById.set(t.id, {
      index: i + 1,
      spec,
      label: t.label?.trim() || `Truck ${i + 1}`,
    });
  });

  const caseMap = buildCaseLookup(cases);

  // Build CSV rows.
  const HEADER = [
    "Truck #",
    "Truck Label",
    "Truck Type",
    "Vendor",
    "Method",
    "Linear Ft",
    "Weight LB",
    "Stackable",
    "Notes",
  ];
  const lines: string[] = [HEADER.join(",")];

  for (const v of vendors ?? []) {
    const truckCtx = truckIndexById.get(v.job_truck_id);
    if (!truckCtx) continue; // dangling reference - skip
    const inputMethod = v.input_method as InputMethod;
    const hydrated = hydrateVendorInput({
      inputMethod,
      inputData: v.input_data as unknown,
      stackable: v.stackable,
      cases: caseMap,
    });
    const linearFt = hydrated
      ? computeVendorPacking(hydrated, { widthIn: 96, heightIn: 100 }).linearFt
      : 0;
    const weightLb = hydrated
      ? computeVendorWeight(hydrated, v.weight_lb_override)
      : 0;
    const stackableLabel =
      v.stackable === null ? "default" : v.stackable ? "yes" : "no";

    lines.push(
      [
        truckCtx.index.toString(),
        truckCtx.label,
        truckCtx.spec.shortLabel,
        v.name,
        inputMethod,
        linearFt.toFixed(1),
        weightLb.toFixed(0),
        stackableLabel,
        v.notes ?? "",
      ]
        .map(csvEscape)
        .join(","),
    );
  }

  // Filename: <job-name>-<YYYYMMDD>.csv with the name slugged.
  const slug =
    job.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 40) || "load-plan";
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const filename = `${slug}-${today}.csv`;

  // Prepend a UTF-8 BOM so Excel opens the file with the right encoding.
  // Without the BOM, names with special chars (é, ñ, etc.) can render
  // garbled in Excel for Windows.
  const body = "﻿" + lines.join("\r\n") + "\r\n";

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

// Properly escape a value for inclusion in a CSV cell. Wrap in quotes
// if the value contains a comma, quote, CR, or LF; double-up any
// embedded quotes per RFC 4180.
function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
