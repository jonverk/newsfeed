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
    await c.env.DB.prepare("SELECT 1 FROM search_index LIMIT 0").run();
    return c.json({ fts5: true });
  } catch {
    return c.json({ fts5: false });
  }
});

api.route("/api/posts", posts);
api.route("/api/handbook", handbook);
api.route("/api/search", search);
api.route("/", surfaces);
