// Phase-1 auth model: a single shared username/password.
//
// We don't use Supabase Auth at all - DB access goes through the admin
// client with the secret key, server-side only. This file owns the cookie
// session: HMAC-signed token over the constant "valid", validated on
// every request via timing-safe comparison.
//
// Use Web Crypto (not node:crypto) so this works in both the Edge runtime
// (proxy.ts) and Node (server actions / route handlers).

export const SESSION_COOKIE = "atl_session";
const SESSION_PAYLOAD = "valid";

function getSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) {
    throw new Error(
      "SESSION_SECRET env var is required. Generate with: openssl rand -hex 32",
    );
  }
  return s;
}

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

export async function signSession(): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(SESSION_PAYLOAD),
  );
  return bytesToHex(new Uint8Array(sig));
}

// Constant-time string comparison (Web Crypto has no timingSafeEqual).
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function isValidSession(
  cookieValue: string | undefined | null,
): Promise<boolean> {
  if (!cookieValue) return false;
  try {
    const expected = await signSession();
    return timingSafeEqual(cookieValue, expected);
  } catch {
    return false;
  }
}

export function verifyCredentials(
  username: string,
  password: string,
): boolean {
  const expectedUsername = process.env.APP_USERNAME ?? "admin";
  const expectedPassword = process.env.APP_PASSWORD ?? "admin";
  return (
    timingSafeEqual(username, expectedUsername) &&
    timingSafeEqual(password, expectedPassword)
  );
}
