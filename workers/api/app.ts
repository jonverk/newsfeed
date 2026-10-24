import { Hono } from "hono";
import type { AppEnv } from "../lib/env";
import { posts } from "./posts";
import { surfaces } from "./surfaces";
import { handbook } from "./handbook";
import { search } from "./search";

export const api = new Hono<{ Bindings: AppEnv }>();

api.get("/api/health", (c) => c.json({ ok: true }));

api.get("/api/health/fts", async (c) => {
  try {
    await c.env.DB.prepare("CREATE VIRTUAL TABLE IF NOT EXISTS __fts_probe USING fts5(x)").run();
    try {
      await c.env.DB.prepare("DROP TABLE IF EXISTS __fts_probe").run();
    } catch {}
    return c.json({ fts5: true });
  } catch {
    return c.json({ fts5: false });
  }
});

api.route("/api/posts", posts);
api.route("/api/handbook", handbook);
api.route("/api/search", search);
api.route("/", surfaces);
