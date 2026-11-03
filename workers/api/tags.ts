import { Hono } from "hono";
import type { AppEnv } from "../lib/env";
import { requireToken } from "../lib/auth";
import { publicChange } from "../lib/mutations";
export const tags = new Hono<{ Bindings: AppEnv }>();
tags.get("/", async c => c.json({ items: (await c.env.DB.prepare("SELECT name FROM tags ORDER BY name").all()).results }));
tags.post("/", async c => {
  const denied = await requireToken(c.req.raw,c.env); if (denied) return denied;
  let body: any; try { body = await c.req.json(); } catch { return c.json({ message: "Invalid JSON" },400); }
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 80 || /[\r\n]/.test(name)) return c.json({ message: "Invalid tag", field: "name" },400);
  await c.env.DB.batch([c.env.DB.prepare("INSERT INTO tags(name) VALUES (?)").bind(name),publicChange(c.env.DB,new Date().toISOString())]);
  return c.json({ name },201);
});
tags.delete("/:name", async c => {
  const denied = await requireToken(c.req.raw,c.env); if (denied) return denied;
  const name = c.req.param("name");
  await c.env.DB.batch([c.env.DB.prepare("DELETE FROM entry_tags WHERE tag=? COLLATE NOCASE").bind(name),c.env.DB.prepare("DELETE FROM tags WHERE name=? COLLATE NOCASE").bind(name),publicChange(c.env.DB,new Date().toISOString())]);
  return c.json({ ok: true });
});
tags.put("/:kind/:slug", async c => {
  const denied = await requireToken(c.req.raw,c.env); if (denied) return denied;
  const kind = c.req.param("kind"), slug = c.req.param("slug");
  if (kind !== "post" && kind !== "rule") return c.json({ message: "Invalid kind" },400);
  let body: any; try { body = await c.req.json(); } catch { return c.json({ message: "Invalid JSON" },400); }
  if (!Array.isArray(body?.tags) || body.tags.some((x: unknown) => typeof x !== "string") || new Set(body.tags.map((x: string) => x.toLowerCase())).size !== body.tags.length) return c.json({ message: "Invalid tags" },400);
  const row = await c.env.DB.prepare(`SELECT 1 FROM ${kind === "post" ? "posts" : "rules"} WHERE slug=? AND deleted_at IS NULL`).bind(slug).first();
  if (!row) return c.json({ message: "Not found" },404);
  const available = (await c.env.DB.prepare("SELECT name FROM tags").all<{name:string}>()).results;
  const values = body.tags.map((x: string) => available.find(t => t.name.toLowerCase() === x.toLowerCase())?.name);
  if (values.some((x: unknown) => !x)) return c.json({ message: "Unknown tag" },400);
  await c.env.DB.batch([c.env.DB.prepare("DELETE FROM entry_tags WHERE entity_type=? AND entity_ref=?").bind(kind,slug),...values.map((value: string) => c.env.DB.prepare("INSERT INTO entry_tags(entity_type,entity_ref,tag) VALUES (?,?,?)").bind(kind,slug,value)),publicChange(c.env.DB,new Date().toISOString())]);
  return c.json({ ok: true });
});
