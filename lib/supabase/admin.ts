// Server-side Supabase client using the SECRET key. Bypasses RLS.
//
// NEVER import this from a client component. It must only be used in:
//   - server actions ("use server")
//   - route handlers (app/.../route.ts)
//   - server components (default in app/)
//
// Phase 1 has no per-user identity, so all DB access goes through this
// client. The publishable key + browser client are not used.

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

let cached: ReturnType<typeof createClient<Database>> | null = null;

export function createAdminClient() {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) {
    throw new Error(
      "Supabase admin client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY",
    );
  }

  cached = createClient<Database>(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}
