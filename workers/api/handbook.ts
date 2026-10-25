import { Hono } from "hono";
import type { AppEnv } from "../lib/env";
import { requireToken } from "../lib/auth";
import { validateRuleInput } from "../lib/validate";
import { getRule, getRuleById, listRules } from "../lib/content";
import { nextRuleId } from "../lib/slug";
import { indexDocument } from "../lib/search";

export const handbook = new Hono<{ Bindings: AppEnv }>();

function nowIso() {
  return new Date().toISOString();
}

handbook.put("/:slug", async (c) => {
  const auth = await requireToken(c.req.raw, c.env);
  if (auth) return auth;
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ message: "Invalid JSON", field: "body" }, 400);
  }
  const v = validateRuleInput(body);
  if (!v.ok) {
    return c.json({ message: v.message, field: v.field }, 400);
  }
  const input = v.value;
  const existing = await getRule(c.env.DB, c.req.param("slug"));
  const ts = nowIso();
  if (existing) {
    // update - rule_id immutable
    if (input.rule_id && input.rule_id !== existing.rule_id) {
      return c.json({ message: "rule_id immutable", field: "rule_id" }, 400);
    }
    await c.env.DB.prepare("INSERT INTO revisions (entity_type,entity_ref,title,body_md,saved_at,saved_by) VALUES (?,?,?,?,?,?)")
      .bind("rule", existing.slug, existing.title, existing.body_md, ts, "")
      .run();
    await c.env.DB
      .prepare("UPDATE rules SET title=?, body_md=?, category=?, owner=?, updated_at=? WHERE slug = ?")
      .bind(input.title, input.body, input.category, input.owner || existing.owner, ts, existing.slug)
      .run();
    await indexDocument(c.env.DB, { kind: "rule", slug: existing.slug, title: input.title, body: input.body });
    const updated = await getRule(c.env.DB, existing.slug);
    return c.json(updated);
  } else {
    // create
    let rule_id = input.rule_id;
    if (!rule_id) {
      rule_id = await nextRuleId(c.env.DB, input.category);
    } else {
      const { PREFIX_BY_CATEGORY } = await import("../lib/slug");
      const expectedPrefix = PREFIX_BY_CATEGORY[input.category];
      if (rule_id.split("-")[0] !== expectedPrefix) {
        return c.json({ message: `rule_id prefix must match category prefix '${expectedPrefix}'`, field: "rule_id" }, 400);
      }
    }
    const effective_at = input.effective_at || ts;
    await c.env.DB
      .prepare("INSERT INTO rules (rule_id,slug,title,body_md,category,owner,status,effective_at,superseded_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
      .bind(rule_id, c.req.param("slug"), input.title, input.body, input.category, input.owner || "", "active", effective_at, null, ts, ts)
      .run();
    await indexDocument(c.env.DB, { kind: "rule", slug: c.req.param("slug"), title: input.title, body: input.body });
    const created = await getRule(c.env.DB, c.req.param("slug"));
    return c.json(created);
  }
});

handbook.post("/:slug/supersede", async (c) => {
  const auth = await requireToken(c.req.raw, c.env);
  if (auth) return auth;
  const slug = c.req.param("slug");
  const rule = await getRule(c.env.DB, slug);
  if (!rule) return c.json({ message: "Not found" }, 404);
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ message: "Invalid JSON" }, 400);
  }
  const superseded_by = body.superseded_by;
  if (!superseded_by) return c.json({ message: "superseded_by required", field: "superseded_by" }, 400);
  if (superseded_by === rule.rule_id) return c.json({ message: "cannot self supersede", field: "superseded_by" }, 400);
  const target = await getRuleById(c.env.DB, superseded_by);
  if (!target) return c.json({ message: "target not found", field: "superseded_by" }, 400);
  if (target.status === "superseded") return c.json({ message: "target already superseded", field: "superseded_by" }, 400);
  const ts = nowIso();
  await c.env.DB.prepare("INSERT INTO revisions (entity_type,entity_ref,title,body_md,saved_at,saved_by) VALUES (?,?,?,?,?,?)")
    .bind("rule", rule.slug, rule.title, rule.body_md, ts, "")
    .run();
  await c.env.DB.prepare("UPDATE rules SET status='superseded', superseded_by=?, updated_at=? WHERE slug = ?").bind(superseded_by, ts, slug).run();
  await indexDocument(c.env.DB, { kind: "rule", slug: rule.slug, title: rule.title, body: rule.body_md });
  return c.json({ ok: true });
});

handbook.get("/", async (c) => {
  const rules = await listRules(c.env.DB);
  return c.json({ items: rules });
});

handbook.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const rule = await getRule(c.env.DB, slug);
  if (!rule) return c.json({ message: "Not found" }, 404);
  if (rule.status === "draft") {
    const authCheck = await requireToken(c.req.raw, c.env);
    if (authCheck) return c.json({ message: "Not found" }, 404);
  }
  return c.json(rule);
});
