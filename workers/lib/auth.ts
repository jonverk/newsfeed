import type { AppEnv } from "./env";

export const SESSION_COOKIE = "__Host-newsfeed_session";
export const PRIVATE_CACHE = "private, no-store";
export const SESSION_SECONDS = 24 * 60 * 60;

export async function hashSecret(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function secretsEqual(a: string, b: string): Promise<boolean> {
  const [left, right] = await Promise.all([hashSecret(a), hashSecret(b)]);
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return difference === 0;
}

export function sameOrigin(request: Request): boolean {
  return request.headers.get("origin") === new URL(request.url).origin;
}

export function sessionToken(request: Request): string | null {
  const value = request.headers.get("cookie")?.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}

export async function browserUser(request: Request, env: AppEnv): Promise<string | null> {
  const token = sessionToken(request);
  if (!token || !env.ADMIN_USERNAME || !env.ADMIN_PASSWORD) return null;
  const session = await env.DB.prepare(
    "SELECT username FROM admin_sessions WHERE token_hash = ? AND expires_at > ? AND username = ?",
  ).bind(await hashSecret(token), new Date().toISOString(), env.ADMIN_USERNAME).first<{ username: string }>();
  return session?.username ?? null;
}

export async function writer(request: Request, env: AppEnv): Promise<string | null> {
  const match = request.headers.get("authorization")?.trim().match(/^bearer\s+(.+)$/i);
  // An Authorization header opts into bearer authentication, without cookie fallback.
  if (request.headers.has("authorization")) {
    return match && env.NEWSFEED_TOKEN?.trim() && await secretsEqual(match[1].trim(), env.NEWSFEED_TOKEN.trim()) ? "cli" : null;
  }
  return browserUser(request, env);
}

export function authError(message: string, status = 401): Response {
  return Response.json({ message }, { status, headers: { "Cache-Control": PRIVATE_CACHE } });
}

// Keep V1's API interface while allowing browser sessions as well as bearer tokens.
export async function requireToken(request: Request, env: AppEnv): Promise<Response | null> {
  if (!await writer(request, env)) return authError("Unauthorized");
  if (!request.headers.has("authorization") && !["GET", "HEAD"].includes(request.method) && !sameOrigin(request)) {
    return authError("Forbidden origin", 403);
  }
  return null;
}

export function sessionCookie(token: string, maxAge = SESSION_SECONDS): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}
