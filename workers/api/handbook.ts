import { Hono } from "hono";
import type { AppEnv } from "../lib/env";
import { requireToken, writer, PRIVATE_CACHE } from "../lib/auth";
import { SLUG_RE, validateRuleInput } from "../lib/validate";
import { getRule, getRuleForAdmin, getRuleById, listRules } from "../lib/content";
import { nextRuleId, PREFIX_BY_CATEGORY } from "../lib/slug";
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
    if (input.rule_id && input.rule_id !== existing.rule_id) return c.json({ message: "rule_id immutable", field: "rule_id" }, 400);
    await mutateContent(c.env.DB, "rule", slug, actor, c.env.DB.prepare(
      "UPDATE rules SET title=?,body_md=?,category=?,owner=?,effective_at=?,updated_at=? WHERE slug=? AND deleted_at IS NULL",
    ).bind(input.title, input.body, input.category, input.owner, input.effective_at === undefined ? existing.effective_at : input.effective_at, ts, slug),
      { public: existing.status !== "draft" });
  } else {
    const ruleId = input.rule_id || await nextRuleId(c.env.DB, input.category);
    if (input.rule_id && ruleId.split("-")[0] !== PREFIX_BY_CATEGORY[input.category]) {
      return c.json({ message: "rule_id prefix must match category", field: "rule_id" }, 400);
    }
    if (await c.env.DB.prepare("SELECT 1 FROM rules WHERE rule_id=?").bind(ruleId).first()) return c.json({ message: "rule_id already exists", field: "rule_id" }, 400);
    await mutateContent(c.env.DB, "rule", slug, actor, c.env.DB.prepare(
      "INSERT INTO rules (rule_id,slug,title,body_md,category,owner,status,effective_at,superseded_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    ).bind(ruleId, slug, input.title, input.body, input.category, input.owner, "active", input.effective_at || ts, null, ts, ts), { revision: false });
  }
  return c.json(await getRuleForAdmin(c.env.DB, slug));
});

handbook.post("/:slug/supersede", async (c) => {
  const auth = await requireToken(c.req.raw, c.env);
  if (auth) return auth;
  const slug = c.req.param("slug");
  const rule = await getRule(c.env.DB, slug);
  if (!rule) return c.json({ message: "Not found" }, 404);
  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ message: "Invalid JSON" }, 400); }
  const by = body && typeof body === "object" && "superseded_by" in body ? body.superseded_by : null;
  if (typeof by !== "string" || !by) return c.json({ message: "superseded_by required", field: "superseded_by" }, 400);
  if (by === rule.rule_id) return c.json({ message: "cannot self supersede", field: "superseded_by" }, 400);
  const target = await getRuleById(c.env.DB, by);
  if (!target || target.status !== "active") return c.json({ message: "Replacement must be an active entry", field: "superseded_by" }, 400);
  await mutateContent(c.env.DB, "rule", slug, (await writer(c.req.raw, c.env))!, c.env.DB.prepare(
    "UPDATE rules SET status='superseded',superseded_by=?,updated_at=? WHERE slug=? AND deleted_at IS NULL",
  ).bind(by, new Date().toISOString(), slug));
  return c.json({ ok: true });
});

registerTrashRoutes(handbook, "rule");
handbook.get("/", async (c) => c.json({ items: await listRules(c.env.DB) }));
handbook.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const rule = await getRule(c.env.DB, slug);
  if (rule) return c.json(rule);
  const privateRule = await getRuleForAdmin(c.env.DB, slug);
  if (!privateRule || privateRule.deleted_at || await requireToken(c.req.raw, c.env)) return c.json({ message: "Not found" }, 404);
  c.header("Cache-Control", PRIVATE_CACHE);
  return c.json(privateRule);
});
