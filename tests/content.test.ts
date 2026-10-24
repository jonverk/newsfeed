import { env } from "cloudflare:test";
import { expect, it, beforeAll } from "vitest";
import { getPostForAdmin, getPublishedPost, listPublishedPosts, listRules } from "../workers/lib/content";
import initSql from "../migrations/0001_init.sql?raw";

const now = "2026-10-24T00:00:00.000Z";

beforeAll(async () => {
  const queries = initSql.split(";").map(q => q.trim()).filter(q => q && !q.startsWith("--"));
  for (const q of queries) {
    try {
      await env.DB.prepare(q).run();
    } catch {}
  }
});

async function seed() {
  await env.DB.prepare("DELETE FROM posts").run();
  await env.DB.prepare("DELETE FROM rules").run();
  await env.DB.prepare("INSERT INTO posts (slug,title,body_md,kind,author,status,published_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .bind("live", "Live", "hi", "announcement", "Jon", "published", now, now, now).run();
  await env.DB.prepare("INSERT INTO posts (slug,title,body_md,kind,author,status,published_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .bind("hidden", "Hidden", "secret", "announcement", "Jon", "draft", null, now, now).run();
  await env.DB.prepare("INSERT INTO rules (rule_id,slug,title,body_md,category,owner,status,effective_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .bind("LOG-001", "logging", "Logging", "log it", "logging", "Jon", "active", now, now, now).run();
}

it("lists only published posts, newest first", async () => {
  await seed();
  const posts = await listPublishedPosts(env.DB);
  expect(posts.map((p) => p.slug)).toContain("live");
  expect(posts.map((p) => p.slug)).not.toContain("hidden");
});

it("does not resolve a draft by slug publicly, but does for admin", async () => {
  await seed();
  expect(await getPublishedPost(env.DB, "hidden")).toBeNull();
  expect((await getPostForAdmin(env.DB, "hidden"))?.status).toBe("draft");
});

it("excludes draft rules from public listings", async () => {
  await seed();
  const rules = await listRules(env.DB);
  expect(rules.every((r) => r.status !== "draft")).toBe(true);
});
