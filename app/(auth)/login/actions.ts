"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signSession, verifyCredentials, SESSION_COOKIE } from "@/lib/auth";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export async function loginAction(formData: FormData): Promise<never> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/jobs") || "/jobs";

  if (!verifyCredentials(username, password)) {
    redirect("/login?error=1");
  }

  const sessionValue = await signSession();
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, sessionValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
  });

  redirect(next.startsWith("/") ? next : "/jobs");
}

export async function signOutAction(): Promise<never> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  redirect("/login");
}
