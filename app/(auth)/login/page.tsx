"use client";

import { useState } from "react";
import { Loader2, Mail, Package } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Status = "idle" | "sending" | "sent" | "error";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    setErrorMsg("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setStatus("error");
      setErrorMsg(error.message);
    } else {
      setStatus("sent");
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-8 h-8 rounded bg-[#00d4ff] flex items-center justify-center">
            <Package size={16} className="text-[#0a0b0d]" />
          </div>
          <div>
            <div className="font-semibold text-sm tracking-tight">
              Apache Truck Loader
            </div>
            <div className="text-[10px] text-[#4a5058] tracking-[0.2em] uppercase">
              Sign in
            </div>
          </div>
        </div>

        {status === "sent" ? (
          <div className="border border-[#1f2328] rounded-md p-5 bg-[#0f1115]">
            <div className="flex items-center gap-2 text-[#00d4ff] mb-2">
              <Mail size={14} />
              <span className="text-sm font-medium">Check your email</span>
            </div>
            <p className="text-xs text-[#8a9199] leading-relaxed">
              Sign-in link sent to{" "}
              <span className="mono text-[#e8eaed]">{email}</span>. Open it on
              this device to continue.
            </p>
            <button
              type="button"
              onClick={() => {
                setStatus("idle");
                setEmail("");
              }}
              className="mt-4 text-[11px] text-[#4a5058] hover:text-[#8a9199] transition tracking-wider uppercase"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="text-[10px] tracking-[0.2em] text-[#4a5058] uppercase block mb-1.5">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                autoFocus
                className="w-full bg-[#0f1115] border border-[#2a2f36] rounded px-3 py-2.5 text-sm focus:outline-none focus:border-[#00d4ff] transition"
              />
            </div>
            <button
              type="submit"
              disabled={status === "sending" || !email}
              className="w-full bg-[#00d4ff] text-[#0a0b0d] font-semibold text-sm px-4 py-2.5 rounded hover:bg-[#33dcff] transition disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-h-[44px]"
            >
              {status === "sending" ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Sending...
                </>
              ) : (
                "Send magic link"
              )}
            </button>
            {status === "error" && (
              <div className="text-xs text-[#ff4757] py-1">{errorMsg}</div>
            )}
            <p className="text-[10px] text-[#4a5058] leading-relaxed pt-2">
              We send a one-time link to your email. No password needed.
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
