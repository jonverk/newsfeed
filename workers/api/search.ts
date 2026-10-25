import { Hono } from "hono";
import type { AppEnv } from "../lib/env";
import { searchContent } from "../lib/search";
import { conditionalResponse } from "../lib/http";

export const search = new Hono<{ Bindings: AppEnv }>();

search.get("/", async (c) => {
  const q = c.req.query("q") || "";
  const kind = c.req.query("kind") as any;
  const hits = await searchContent(c.env.DB, q, kind);
  const body = JSON.stringify({ q, hits });
  return conditionalResponse(c.req.raw, body, { contentType: "application/json" });
});
