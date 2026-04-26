"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

export async function createJobAction(): Promise<never> {
  const supabase = createAdminClient();

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .insert({ name: "Untitled job" })
    .select("id")
    .single();

  if (jobErr || !job) {
    throw new Error(jobErr?.message ?? "Failed to create job");
  }

  // Every job needs at least one truck. Default new jobs to a single
  // 26ft Penske; the user can change the type or add more trucks from
  // the editor.
  const { error: truckErr } = await supabase
    .from("job_trucks")
    .insert({
      job_id: job.id,
      truck_type: "26ft_penske",
      sort_order: 0,
    });

  if (truckErr) {
    // Roll back the job so we don't leave an orphaned, truckless job behind.
    await supabase.from("jobs").delete().eq("id", job.id);
    throw new Error(truckErr.message);
  }

  redirect(`/jobs/${job.id}`);
}
