import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { AppEnv } from "../lib/env";
import { authError, hashSecret, PRIVATE_CACHE, sameOrigin, secretsEqual, sessionCookie, sessionToken, SESSION_SECONDS } from "../lib/auth";

export const auth = new Hono<{ Bindings: AppEnv }>();
auth.use("*", async (c, next) => {
  c.header("Cache-Control", PRIVATE_CACHE);
  if (!sameOrigin(c.req.raw)) return authError("Forbidden origin", 403);
  await next();
});
auth.use("*", bodyLimit({ maxSize: 4096, onError: () => authError("Request too large", 413) }));

auth.post("/login", async (c) => {
  if (!c.env.ADMIN_USERNAME || !c.env.ADMIN_PASSWORD) return authError("Administrator login has not been configured", 503);
  const { success } = await c.env.LOGIN_RATE_LIMITER.limit({ key: `login:${c.req.header("cf-connecting-ip") || "local"}` });
  if (!success) {
    c.header("Retry-After", "60");
    return c.json({ message: "Too many login attempts. Try again in a minute." }, 429);
  }
  let input: unknown;
  try { input = await c.req.json(); } catch { return authError("Invalid JSON", 400); }
  if (!input || typeof input !== "object" || !("username" in input) || !("password" in input)
      || typeof input.username !== "string" || typeof input.password !== "string") return authError("Username and password are required", 400);
  const [validUser, validPassword] = await Promise.all([
    secretsEqual(input.username, c.env.ADMIN_USERNAME), secretsEqual(input.password, c.env.ADMIN_PASSWORD),
  ]);
  if (!validUser || !validPassword) return authError("Invalid username or password");
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
  const timestamp = Date.now();
  const oldToken = sessionToken(c.req.raw);
  const statements = [c.env.DB.prepare("DELETE FROM admin_sessions WHERE expires_at <= ?").bind(new Date(timestamp).toISOString())];
  if (oldToken) statements.push(c.env.DB.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").bind(await hashSecret(oldToken)));
  statements.push(c.env.DB.prepare("INSERT INTO admin_sessions (token_hash, username, expires_at) VALUES (?, ?, ?)")
    .bind(await hashSecret(token), c.env.ADMIN_USERNAME, new Date(timestamp + SESSION_SECONDS * 1000).toISOString()));
  await c.env.DB.batch(statements);
  c.header("Set-Cookie", sessionCookie(token));
  return c.json({ ok: true });
});

auth.post("/logout", async (c) => {
  const token = sessionToken(c.req.raw);
  if (token) await c.env.DB.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").bind(await hashSecret(token)).run();
  c.header("Set-Cookie", sessionCookie("", 0));
  return c.json({ ok: true });
});
