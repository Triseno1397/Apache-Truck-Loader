import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { isValidSession, SESSION_COOKIE } from "@/lib/auth";
import Header from "@/components/Header";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Defense in depth: proxy.ts already redirects unauthenticated users.
  const cookieStore = await cookies();
  const ok = await isValidSession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!ok) redirect("/login");

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">{children}</main>
    </div>
  );
}
