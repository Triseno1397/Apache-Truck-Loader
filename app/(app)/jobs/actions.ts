"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

export async function createJobAction(): Promise<never> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("jobs")
    .insert({ name: "Untitled job" })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create job");
  }

  redirect(`/jobs/${data.id}`);
}
