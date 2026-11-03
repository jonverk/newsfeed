import { Hono } from "hono";
import type { AppEnv } from "../lib/env";
import { requireToken, writer, PRIVATE_CACHE } from "../lib/auth";
import { SLUG_RE, validateRuleInput } from "../lib/validate";
import { getRule, getRuleForAdmin, getRuleById, listRules, getTags } from "../lib/content";

import { mutateContent } from "../lib/mutations";
import { registerTrashRoutes } from "./trash";

export const handbook = new Hono<{ Bindings: AppEnv }>();

handbook.put("/:slug", async (c) => {
  const auth = await requireToken(c.req.raw, c.env);
  if (auth) return auth;
  const slug = c.req.param("slug");
  if (!SLUG_RE.test(slug)) return c.json({ message: "Invalid slug", field: "slug" }, 400);
  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ message: "Invalid JSON", field: "body" }, 400); }
  const validation = validateRuleInput(body);
  if (!validation.ok) return c.json({ message: validation.message, field: validation.field }, 400);
  const input = validation.value;
  const existing = await getRuleForAdmin(c.env.DB, slug);
  if (existing && c.req.header("if-none-match") === "*") return c.json({ message: "This title already has an entry. Choose a different title or edit the existing entry.", field: "title" }, 409);
  const ts = new Date().toISOString();
  const actor = (await writer(c.req.raw, c.env))!;
  if (existing) {
    if (existing.deleted_at) return c.json({ message: "This entry is in trash. Restore it first." }, 409);
    await mutateContent(c.env.DB, "rule", slug, actor, c.env.DB.prepare(
      "UPDATE rules SET title=?,body_md=?,updated_at=? WHERE slug=? AND deleted_at IS NULL",
    ).bind(input.title, input.body, ts, slug),
      { public: existing.status !== "draft" });
  } else {
    await mutateContent(c.env.DB, "rule", slug, actor, c.env.DB.prepare(
      "INSERT INTO rules (rule_id,slug,title,body_md,category,owner,status,effective_at,superseded_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    ).bind(`legacy-${crypto.randomUUID()}`, slug, input.title, input.body, "", "", "active", null, null, ts, ts), { revision: false });
  }
  return c.json({ ...publicRule((await getRuleForAdmin(c.env.DB, slug))!), tags: await getTags(c.env.DB,"rule",slug) });
});

registerTrashRoutes(handbook, "rule");
const publicRule = (rule: any) => ({ slug: rule.slug, title: rule.title, body_md: rule.body_md });
handbook.get("/", async (c) => c.json({ items: await Promise.all((await listRules(c.env.DB)).map(async r => ({...publicRule(r),tags:await getTags(c.env.DB,"rule",r.slug)}))) }));
handbook.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const rule = await getRule(c.env.DB, slug);
  if (rule) return c.json({...publicRule(rule), tags: await getTags(c.env.DB,"rule",slug)});
  const privateRule = await getRuleForAdmin(c.env.DB, slug);
  if (!privateRule || privateRule.deleted_at || await requireToken(c.req.raw, c.env)) return c.json({ message: "Not found" }, 404);
  c.header("Cache-Control", PRIVATE_CACHE);
  return c.json(publicRule(privateRule));
});
