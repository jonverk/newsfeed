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
  if (!Array.isArray(body?.tags) || body.tags.some((x: unknown) => typeof x !== "string" || !x.trim() || x.trim().length > 80 || /[\r\n]/.test(x))) return c.json({ message: "Invalid categories" },400);
  const values: string[] = [];
  for (const tag of body.tags as string[]) {
    const value = tag.trim();
    if (!values.some(existing => existing.toLowerCase() === value.toLowerCase())) values.push(value);
  }
  const row = await c.env.DB.prepare(`SELECT 1 FROM ${kind === "post" ? "posts" : "rules"} WHERE slug=? AND deleted_at IS NULL`).bind(slug).first();
  if (!row) return c.json({ message: "Not found" },404);
  await c.env.DB.batch([
    ...values.map(value => c.env.DB.prepare("INSERT OR IGNORE INTO tags(name) VALUES (?)").bind(value)),
    c.env.DB.prepare("DELETE FROM entry_tags WHERE entity_type=? AND entity_ref=?").bind(kind,slug),
    ...values.map(value => c.env.DB.prepare("INSERT INTO entry_tags(entity_type,entity_ref,tag) SELECT ?,?,name FROM tags WHERE name=? COLLATE NOCASE").bind(kind,slug,value)),
    publicChange(c.env.DB,new Date().toISOString())
  ]);
  return c.json({ ok: true });
});
