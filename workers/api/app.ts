import { Hono } from "hono";
import type { AppEnv } from "../lib/env";
import { posts } from "./posts";
import { surfaces } from "./surfaces";
import { handbook } from "./handbook";
import { search } from "./search";
import { auth } from "./auth";
import { org } from "./org";
import { PRIVATE_CACHE, SESSION_COOKIE } from "../lib/auth";
import { bodyLimit } from "hono/body-limit";

export const api = new Hono<{ Bindings: AppEnv }>();

api.use("*", async (c, next) => {
  await next();
  const privateRequest = !["GET", "HEAD"].includes(c.req.method) || c.req.header("authorization") || c.req.header("cookie")?.includes(SESSION_COOKIE);
  c.header("Cache-Control", privateRequest || c.res.headers.get("Cache-Control")?.includes("no-store") ? PRIVATE_CACHE : "public, no-cache");
});
api.use("/api/*", bodyLimit({ maxSize: 512 * 1024, onError: (c) => c.json({ message: "Request too large" }, 413) }));
api.onError((error, c) => {
  c.header("Cache-Control", PRIVATE_CACHE);
  if (/UNIQUE constraint failed/i.test(error.message)) return c.json({ message: "An entry with this identifier already exists. Refresh and try again." }, 409);
  console.error("API request failed", error.name);
  return c.json({ message: "Unable to save the change. Please try again." }, 500);
});

api.get("/api/health", (c) => c.json({ ok: true }));

api.get("/api/health/fts", async (c) => {
  try {
    await c.env.DB.prepare("SELECT 1 FROM search_index LIMIT 0").run();
    return c.json({ fts5: true });
  } catch {
    return c.json({ fts5: false });
  }
});

api.route("/api/posts", posts);
api.route("/api/auth", auth);
api.route("/api/org", org);
api.route("/api/rules", handbook);
// Retain existing CLI integrations while browser routes use /rules.
api.route("/api/handbook", handbook);
api.route("/api/search", search);
api.route("/", surfaces);
