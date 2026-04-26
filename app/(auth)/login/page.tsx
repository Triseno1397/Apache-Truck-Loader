import { Package } from "lucide-react";
import { loginAction } from "./actions";

type SearchParams = Promise<{ error?: string; next?: string }>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const hasError = params.error === "1";
  const next = params.next ?? "/jobs";

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-8 h-8 rounded bg-[#0e3e7a] flex items-center justify-center">
            <Package size={16} className="text-[#ffffff]" />
          </div>
          <div>
            <div className="font-semibold text-sm tracking-tight">
              Apache Truck Loader
            </div>
            <div className="text-[10px] text-[#9ca3af] tracking-[0.2em] uppercase">
              Sign in
            </div>
          </div>
        </div>

        <form action={loginAction} className="space-y-3">
          <input type="hidden" name="next" value={next} />

          <div>
            <label className="text-[10px] tracking-[0.2em] text-[#9ca3af] uppercase block mb-1.5">
              Username
            </label>
            <input
              type="text"
              name="username"
              required
              autoComplete="username"
              autoFocus
              autoCapitalize="none"
              spellCheck={false}
              className="w-full bg-[#f8f9fa] border border-[#d1d5db] rounded px-3 py-2.5 text-sm focus:outline-none focus:border-[#0e3e7a] transition"
            />
          </div>

          <div>
            <label className="text-[10px] tracking-[0.2em] text-[#9ca3af] uppercase block mb-1.5">
              Password
            </label>
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              className="w-full bg-[#f8f9fa] border border-[#d1d5db] rounded px-3 py-2.5 text-sm focus:outline-none focus:border-[#0e3e7a] transition"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-[#0e3e7a] text-[#ffffff] font-semibold text-sm px-4 py-2.5 rounded hover:bg-[#02aed6] transition flex items-center justify-center gap-2 min-h-[44px]"
          >
            Sign in
          </button>

          {hasError && (
            <div className="text-xs text-[#dc2626] py-1">
              Wrong username or password.
            </div>
          )}
        </form>
      </div>
    </main>
  );
}
