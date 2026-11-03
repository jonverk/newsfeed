import { Hono } from "hono";
import type { AppEnv } from "../lib/env";
import { requireToken } from "../lib/auth";
import { publicChange } from "../lib/mutations";
import { listProfiles } from "../lib/content";

export const directory = new Hono<{ Bindings: AppEnv }>();
directory.get("/", async c => c.json({ items: await listProfiles(c.env.DB) }));
directory.put("/:tag", async c => {
  const denied = await requireToken(c.req.raw, c.env); if (denied) return denied;
  const tag = c.req.param("tag");
  if (!/^[A-Z]{3}$/.test(tag)) return c.json({ message: "Tag must be three uppercase letters", field: "tag" }, 400);
  let input: any; try { input = await c.req.json(); } catch { return c.json({ message: "Invalid JSON" }, 400); }
  if (typeof input?.body !== "string" || !input.body.trim() || new TextEncoder().encode(input.body).length > 65536) return c.json({ message: "Description must contain 1–65536 bytes", field: "body" }, 400);
  const createOnly = c.req.header("if-none-match") === "*";
  const sql = createOnly ? "INSERT INTO agent_profiles(tag,body_md) VALUES (?,?)" : "INSERT INTO agent_profiles(tag,body_md) VALUES (?,?) ON CONFLICT(tag) DO UPDATE SET body_md=excluded.body_md";
  try { await c.env.DB.batch([c.env.DB.prepare(sql).bind(tag,input.body), publicChange(c.env.DB,new Date().toISOString())]); }
  catch (error) { if (createOnly && error instanceof Error && /UNIQUE constraint failed/i.test(error.message)) return c.json({ message: "Agent tag already exists", field: "tag" },409); throw error; }
  return c.json({ ok: true });
});
directory.delete("/:tag", async c => {
  const denied = await requireToken(c.req.raw,c.env); if (denied) return denied;
  const tag = c.req.param("tag"); if (!/^[A-Z]{3}$/.test(tag)) return c.json({ message: "Invalid tag" },400);
  await c.env.DB.batch([c.env.DB.prepare("DELETE FROM agent_profiles WHERE tag=?").bind(tag),publicChange(c.env.DB,new Date().toISOString())]);
  return c.json({ ok: true });
});
