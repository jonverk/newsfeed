import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { AppEnv } from "../lib/env";

import { requireToken } from "../lib/auth";
import { publicChange } from "../lib/mutations";

export const org = new Hono<{ Bindings: AppEnv }>();
org.use("*", async (c, next) => {
  const denied = await requireToken(c.req.raw, c.env);
  if (denied) return denied;
  await next();
});
org.use("*", bodyLimit({ maxSize: 80 * 1024, onError: (c) => c.json({ message: "Upload is too large", field: "file" }, 413) }));

org.put("/", async (c) => {
  let file: FormDataEntryValue | null;
  try { file = (await c.req.formData()).get("file"); }
  catch { return c.json({ message: "Upload a Markdown file", field: "file" }, 400); }
  if (!file || typeof file === "string" || !/\.md$/i.test(file.name)) return c.json({ message: "Choose a .md file", field: "file" }, 400);
  if (!file.size || file.size > 65536) return c.json({ message: "File must contain 1–65536 bytes", field: "file" }, 400);
  let body: string;
  try { body = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer()).replace(/^\uFEFF/, ""); }
  catch { return c.json({ message: "File must be valid UTF-8", field: "file" }, 400); }
  // Export frontmatter describes the record. Uploads replace its body only.
  if (/^---\r?\n/.test(body)) {
    const match = body.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)([\s\S]*)$/);
    if (!match) return c.json({ message: "Unclosed Markdown frontmatter", field: "file" }, 400);
    body = match[1].replace(/^\r?\n/, "");
  }
  const diagram = body.match(/^```mermaid[^\S\r\n]*\r?\n([\s\S]*?)^```[^\S\r\n]*$/m);
  if (!diagram?.[1].trim()) return c.json({ message: "Include a nonempty fenced Mermaid block", field: "file" }, 400);
  const ts = new Date().toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO org_chart (id,title,body_md,updated_at) VALUES (1,'Organization Chart',?,?) ON CONFLICT(id) DO UPDATE SET body_md=excluded.body_md,updated_at=excluded.updated_at").bind(body, ts),
    publicChange(c.env.DB, ts),
  ]);
  return c.json({ ok: true });
});
