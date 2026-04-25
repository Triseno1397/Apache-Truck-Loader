import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Header from "@/components/Header";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Defense in depth: proxy.ts already redirects unauthenticated users.
  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, role")
    .eq("id", user.id)
    .single();

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        email={user.email ?? ""}
        displayName={profile?.display_name ?? null}
        role={profile?.role ?? null}
      />
      <main className="flex-1">{children}</main>
    </div>
  );
}
