import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { AppEnv } from "../lib/env";
import type { Rule } from "../lib/content";
import { requireToken, writer } from "../lib/auth";
import { mutateContent } from "../lib/mutations";

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
  const rule = await c.env.DB.prepare("SELECT * FROM rules WHERE slug='org-chart' OR rule_id='ORG-001' ORDER BY CASE WHEN slug='org-chart' THEN 0 ELSE 1 END LIMIT 1").first<Rule>();
  if (!rule) return c.json({ message: "Org entry not found. Create org-chart in Operational Rules first." }, 404);
  if (rule.deleted_at) return c.json({ message: "The org entry is in trash. Restore it first." }, 409);
  await mutateContent(c.env.DB, "rule", rule.slug, (await writer(c.req.raw, c.env))!, c.env.DB.prepare(
    "UPDATE rules SET body_md=?,updated_at=? WHERE slug=? AND deleted_at IS NULL",
  ).bind(body, new Date().toISOString(), rule.slug), { public: rule.status !== "draft" });
  return c.json({ ok: true });
});
