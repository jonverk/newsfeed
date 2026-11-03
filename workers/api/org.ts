import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { AppEnv } from "../lib/env";

import { requireToken } from "../lib/auth";
import { readMarkdownUpload } from "../lib/markdown-upload";
import { publicChange } from "../lib/mutations";

export const org = new Hono<{ Bindings: AppEnv }>();
org.use("*", async (c, next) => {
  const denied = await requireToken(c.req.raw, c.env);
  if (denied) return denied;
  await next();
});
org.use("*", bodyLimit({ maxSize: 80 * 1024, onError: (c) => c.json({ message: "Upload is too large", field: "file" }, 413) }));

org.put("/", async (c) => {
  const parsed = await readMarkdownUpload(c.req.raw);
  if ("error" in parsed) return c.json({message:parsed.error,field:"file"},400);
  const body = parsed.body;
  const diagram = body.match(/^```mermaid[^\S\r\n]*\r?\n([\s\S]*?)^```[^\S\r\n]*$/m);
  if (!diagram?.[1].trim()) return c.json({ message: "Include a nonempty fenced Mermaid block", field: "file" }, 400);
  const ts = new Date().toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO org_chart (id,title,body_md,updated_at) VALUES (1,'Organization Chart',?,?) ON CONFLICT(id) DO UPDATE SET body_md=excluded.body_md,updated_at=excluded.updated_at").bind(body, ts),
    publicChange(c.env.DB, ts),
  ]);
  return c.json({ ok: true });
});
