import { SELF, env } from "cloudflare:test";
import { beforeEach, expect, it } from "vitest";
import { browserUser, hashSecret, SESSION_COOKIE } from "../workers/lib/auth";
import { loadAdmin } from "../workers/lib/admin";
import type { AppEnv } from "../workers/lib/env";
import { getOrgRule, getPublishedPost, getRule, getRuleById } from "../workers/lib/content";

const origin = "https://x.test";
const bearer = { authorization: "Bearer test-token", "content-type": "application/json" };
let loginNumber = 0;
async function login() {
  const response = await SELF.fetch(`${origin}/api/auth/login`, {
    method: "POST", headers: { origin, "content-type": "application/json", "cf-connecting-ip": `192.0.2.${++loginNumber}` },
    body: JSON.stringify({ username: "jon", password: "test-password" }),
  });
  expect(response.status).toBe(200);
  return response.headers.get("set-cookie")!.split(";")[0];
}
function sessionHeaders(cookie: string) { return { cookie, origin, "content-type": "application/json" }; }
async function createPost(title = "Canary news", draft = false, headers: Record<string, string> = bearer) {
  const response = await SELF.fetch(`${origin}/api/posts`, { method: "POST", headers, body: JSON.stringify({ title, body: "zzcanarynews", draft }) });
  expect(response.status).toBe(201);
  return response.json<{ slug: string; id: number }>();
}
async function createRule(slug = "canary-rule", category = "rules") {
  const response = await SELF.fetch(`${origin}/api/handbook/${slug}`, { method: "PUT", headers: bearer, body: JSON.stringify({ title: "Canary rule", body: "zzcanaryrule", category, owner: "Jon" }) });
  expect(response.status).toBe(200);
  return response.json<{ slug: string; rule_id: string; effective_at: string }>();
}

beforeEach(async () => {
  for (const table of ["posts", "rules", "revisions", "search_index", "admin_sessions", "idempotency"]) await env.DB.prepare(`DELETE FROM ${table}`).run();
  await env.DB.prepare("UPDATE content_state SET changed_at='2000-01-01T00:00:00.000Z',version=0").run();
});

it("creates an opaque, hashed session with secure cookies and revokes it on logout", async () => {
  const cookie = await login();
  const token = cookie.slice(SESSION_COOKIE.length + 1);
  expect(token).toMatch(/^[a-f0-9]{64}$/);
  const stored = await env.DB.prepare("SELECT * FROM admin_sessions").first<{ token_hash: string; expires_at: string }>();
  expect(stored!.token_hash).toBe(await hashSecret(token));
  expect(stored!.token_hash).not.toBe(token);
  expect(Date.parse(stored!.expires_at) - Date.now()).toBeGreaterThan(23 * 3600000);
  expect(await browserUser(new Request(origin, { headers: { cookie } }), env as AppEnv)).toBe("jon");
  const response = await SELF.fetch(`${origin}/api/auth/logout`, { method: "POST", headers: sessionHeaders(cookie) });
  expect(response.status).toBe(200);
  expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  expect(await browserUser(new Request(origin, { headers: { cookie } }), env as AppEnv)).toBeNull();
});

it("sets private caching, secure flags, and a 24-hour cookie", async () => {
  const response = await SELF.fetch(`${origin}/api/auth/login`, { method: "POST", headers: { origin, "content-type": "application/json", "cf-connecting-ip": "secure-flags" }, body: JSON.stringify({ username: "jon", password: "test-password" }) });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  for (const flag of ["HttpOnly", "Secure", "SameSite=Strict", "Path=/", "Max-Age=86400"]) expect(response.headers.get("set-cookie")).toContain(flag);
});

it("rejects wrong credentials, cross-origin login, and missing origin", async () => {
  for (const requestOrigin of [undefined, "https://evil.test", origin]) {
    const response = await SELF.fetch(`${origin}/api/auth/login`, { method: "POST", headers: { ...(requestOrigin ? { origin: requestOrigin } : {}), "content-type": "application/json", "cf-connecting-ip": "wrong-credentials" }, body: JSON.stringify({ username: "jon", password: "wrong" }) });
    expect(response.status).toBe(requestOrigin === origin ? 401 : 403);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  }
  expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM admin_sessions").first<{ n: number }>())!.n).toBe(0);
});

it("rate limits login attempts", async () => {
  let response: Response;
  for (let i = 0; i < 6; i++) response = await SELF.fetch(`${origin}/api/auth/login`, { method: "POST", headers: { origin, "cf-connecting-ip": "rate-limit-test", "content-type": "application/json" }, body: JSON.stringify({ username: "jon", password: "wrong" }) });
  expect(response!.status).toBe(429);
  expect(response!.headers.get("retry-after")).toBe("60");
});

it("rejects expired and forged sessions on admin loads and API writes", async () => {
  const cookie = await login();
  await env.DB.prepare("UPDATE admin_sessions SET expires_at='2000-01-01T00:00:00.000Z'").run();
  const response = await SELF.fetch(`${origin}/api/posts`, { method: "POST", headers: sessionHeaders(cookie), body: JSON.stringify({ title: "Never", body: "no" }) });
  expect(response.status).toBe(401);
  await expect(loadAdmin(new Request(`${origin}/admin/news`, { headers: { cookie } }), env as AppEnv)).rejects.toMatchObject({ status: 302 });
  expect(await browserUser(new Request(origin, { headers: { cookie: `${SESSION_COOKIE}=${"a".repeat(64)}` } }), env as AppEnv)).toBeNull();
});

it("requires same-origin mutations for cookies while preserving bearer clients", async () => {
  const cookie = await login();
  for (const path of ["/api/posts", "/api/auth/logout"]) {
    const response = await SELF.fetch(origin + path, { method: "POST", headers: { ...sessionHeaders(cookie), origin: "https://evil.test" }, body: JSON.stringify({ title: "Blocked", body: "no" }) });
    expect(response.status).toBe(403);
  }
  await createPost("Bearer still works");
  await createPost("Cookie works", false, sessionHeaders(cookie));
});

it("never falls back to cookies when an invalid bearer token is supplied", async () => {
  const cookie = await login();
  const response = await SELF.fetch(`${origin}/api/posts`, { method: "POST", headers: { ...sessionHeaders(cookie), authorization: "Bearer wrong" }, body: JSON.stringify({ title: "Blocked", body: "no" }) });
  expect(response.status).toBe(401);
});

it("keeps drafts private without changing public validators, and publishes edited metadata", async () => {
  const cookie = await login();
  const first = await SELF.fetch(`${origin}/feed.json`);
  const { slug } = await createPost("Draft canary", true, sessionHeaders(cookie));
  const edit = await SELF.fetch(`${origin}/api/posts/${slug}`, { method: "PATCH", headers: sessionHeaders(cookie), body: JSON.stringify({ title: "Edited draft", body: "updatedcanary", kind: "milestone", author: "Editor" }) });
  expect(edit.status).toBe(200);
  for (const path of ["/feed.json", "/llms.txt", "/llms-full.txt", "/api/posts", "/api/search?q=canary", "/api/search?q=u"]) expect(await (await SELF.fetch(origin + path)).text()).not.toContain(slug);
  expect((await SELF.fetch(`${origin}/news/${slug}.md`)).status).toBe(404);
  expect((await SELF.fetch(`${origin}/api/posts/${slug}`)).status).toBe(404);
  expect((await SELF.fetch(`${origin}/feed.json`, { headers: { "if-none-match": first.headers.get("etag")! } })).status).toBe(304);
  const privateRead = await SELF.fetch(`${origin}/api/posts/${slug}`, { headers: { cookie } });
  expect(privateRead.headers.get("cache-control")).toBe("private, no-store");
  expect((await privateRead.json<{ kind: string }>()).kind).toBe("milestone");
  expect((await SELF.fetch(`${origin}/api/posts/${slug}/publish`, { method: "POST", headers: sessionHeaders(cookie) })).status).toBe(200);
  expect((await getPublishedPost(env.DB, slug))?.author).toBe("Editor");
  expect(await (await SELF.fetch(`${origin}/news/${slug}.md`)).text()).toContain("updatedcanary");
  const revision = await env.DB.prepare("SELECT saved_by FROM revisions WHERE entity_ref=?").bind(slug).first<{ saved_by: string }>();
  expect(revision?.saved_by).toBe("jon");
});

it("trashes and restores published posts across every public data surface", async () => {
  const { slug, id } = await createPost();
  const before = await SELF.fetch(`${origin}/feed.json`);
  expect((await SELF.fetch(`${origin}/api/posts/${slug}`, { method: "DELETE", headers: bearer })).status).toBe(200);
  for (const path of ["/feed.json", "/llms.txt", "/llms-full.txt", "/api/posts", "/api/search?q=zzcanarynews", "/api/search?q=z"]) {
    const response = await SELF.fetch(origin + path);
    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain(slug);
  }
  expect((await SELF.fetch(`${origin}/api/posts/${slug}`, { headers: bearer })).status).toBe(404);
  expect((await SELF.fetch(`${origin}/news/${slug}.md`)).status).toBe(404);
  expect((await SELF.fetch(`${origin}/api/posts/${slug}/publish`, { method: "POST", headers: bearer })).status).toBe(404);
  expect((await SELF.fetch(`${origin}/feed.json`, { headers: { "if-none-match": before.headers.get("etag")! } })).status).toBe(200);
  const collision = await createPost();
  expect(collision.slug).not.toBe(slug);
  await SELF.fetch(`${origin}/api/posts/${slug}/restore`, { method: "POST", headers: bearer });
  expect((await getPublishedPost(env.DB, slug))?.id).toBe(id);
  expect(await (await SELF.fetch(`${origin}/api/search?q=zzcanarynews`)).text()).toContain(slug);
});

it("restores drafts without publishing them", async () => {
  const { slug } = await createPost("Private draft", true);
  await SELF.fetch(`${origin}/api/posts/${slug}`, { method: "DELETE", headers: bearer });
  await SELF.fetch(`${origin}/api/posts/${slug}/restore`, { method: "POST", headers: bearer });
  expect(await getPublishedPost(env.DB, slug)).toBeNull();
  expect((await SELF.fetch(`${origin}/news/${slug}.md`)).status).toBe(404);
});

it("saves handbook metadata, clears owner, and prevents creation over an existing slug", async () => {
  const rule = await createRule();
  const cookie = await login();
  const input = { title: "Updated rule", body: "new rule body", category: "verification", owner: "", effective_at: "2027-01-01T00:00:00.000Z" };
  const update = await SELF.fetch(`${origin}/api/handbook/${rule.slug}`, { method: "PUT", headers: sessionHeaders(cookie), body: JSON.stringify(input) });
  expect(update.status).toBe(200);
  expect(await update.json()).toMatchObject({ rule_id: rule.rule_id, owner: "", effective_at: input.effective_at, category: "verification" });
  const collision = await SELF.fetch(`${origin}/api/handbook/${rule.slug}`, { method: "PUT", headers: { ...bearer, "if-none-match": "*" }, body: JSON.stringify({ ...input, title: "Should not replace" }) });
  expect(collision.status).toBe(409);
  expect((await getRule(env.DB, rule.slug))?.title).toBe("Updated rule");
});

it("hides trashed handbook entries and preserves identifiers on restoration", async () => {
  const rule = await createRule();
  await SELF.fetch(`${origin}/api/handbook/${rule.slug}`, { method: "DELETE", headers: bearer });
  expect(await getRule(env.DB, rule.slug)).toBeNull();
  expect(await getRuleById(env.DB, rule.rule_id)).toBeNull();
  for (const path of ["/api/handbook", "/llms.txt", "/llms-full.txt", "/api/search?q=zzcanaryrule", "/api/search?q=z"]) expect(await (await SELF.fetch(origin + path)).text()).not.toContain(rule.slug);
  expect((await SELF.fetch(`${origin}/handbook/${rule.slug}.md`)).status).toBe(404);
  const newer = await createRule("second-rule");
  expect(newer.rule_id).not.toBe(rule.rule_id);
  await SELF.fetch(`${origin}/api/handbook/${rule.slug}/restore`, { method: "POST", headers: bearer });
  expect((await getRule(env.DB, rule.slug))?.rule_id).toBe(rule.rule_id);
});

it("round-trips org exports through uploads, retaining identity and keeping all org surfaces synchronized", async () => {
  const chart = "```mermaid\ngraph TD\n  A[Jon] --> B[Team]\n```\n";
  await SELF.fetch(`${origin}/api/handbook/org-chart`, { method: "PUT", headers: bearer, body: JSON.stringify({ title: "Organization", body: chart, category: "org", owner: "Jon", rule_id: "ORG-001" }) });
  const previous = (await getOrgRule(env.DB))!;
  const exported = await (await SELF.fetch(`${origin}/org.md`)).text();
  const changed = exported.replace("B[Team]", "B[Updated Team]").replace("owner: Jon", "owner: Ignored");
  const cookie = await login();
  const upload = new FormData(); upload.set("file", new File([changed], "org.md", { type: "text/markdown" }));
  const response = await SELF.fetch(`${origin}/api/org`, { method: "PUT", headers: { cookie, origin }, body: upload });
  expect(response.status).toBe(200);
  const current = (await getOrgRule(env.DB))!;
  expect(current).toMatchObject({ id: previous.id, slug: previous.slug, rule_id: "ORG-001", owner: "Jon" });
  expect(current.body_md).not.toContain("canonical:");
  expect(current.body_md).toContain("Updated Team");
  for (const path of ["/org.md", "/org.mmd", "/handbook/org-chart.md", "/llms-full.txt"]) expect(await (await SELF.fetch(origin + path)).text()).toContain("Updated Team");
  expect((await env.DB.prepare("SELECT body_md,saved_by FROM revisions WHERE entity_ref='org-chart'").first())).toMatchObject({ body_md: chart, saved_by: "jon" });
  await SELF.fetch(`${origin}/api/handbook/org-chart`, { method: "DELETE", headers: bearer });
  for (const path of ["/org.md", "/org.mmd"]) expect((await SELF.fetch(origin + path)).status).toBe(404);
  expect(await (await SELF.fetch(`${origin}/llms.txt`)).text()).not.toContain("/org.md");
  const replacement = new FormData(); replacement.set("file", new File([chart], "org.md"));
  expect((await SELF.fetch(`${origin}/api/org`, { method: "PUT", headers: { authorization: "Bearer test-token" }, body: replacement })).status).toBe(409);
});

it("rejects invalid org files without changing the stored chart", async () => {
  const chart = "```mermaid\ngraph TD\nA-->B\n```";
  await SELF.fetch(`${origin}/api/handbook/org-chart`, { method: "PUT", headers: bearer, body: JSON.stringify({ title: "Org", body: chart, category: "org" }) });
  for (const file of [new File([""], "empty.md"), new File(["no diagram"], "org.md"), new File([chart], "org.txt"), new File([new Uint8Array([0xff])], "bad.md"), new File(["x".repeat(65537)], "large.md"), new File(["```mermaid\n \n```"], "empty-chart.md")]) {
    const body = new FormData(); body.set("file", file);
    expect((await SELF.fetch(`${origin}/api/org`, { method: "PUT", headers: { authorization: "Bearer test-token" }, body })).status).toBe(400);
    expect((await getOrgRule(env.DB))?.body_md).toBe(chart);
  }
});

it("paginates private lists and includes drafts and trash only in the matching admin view", async () => {
  for (let i = 0; i < 27; i++) await createPost(`Entry ${i}`, i % 2 === 0);
  const cookie = await login();
  const request = (path: string) => new Request(origin + path, { headers: { cookie } });
  const first = await loadAdmin(request("/admin/news"), env as AppEnv);
  expect(first.items).toHaveLength(25); expect(first.more).toBe(true);
  expect(first.items.some((entry) => entry.status === "draft")).toBe(true);
  const second = await loadAdmin(request("/admin/news?page=2"), env as AppEnv);
  expect(second.items).toHaveLength(2); expect(second.more).toBe(false);
  const slug = first.items[0].slug;
  await SELF.fetch(`${origin}/api/posts/${slug}`, { method: "DELETE", headers: bearer });
  const trash = await loadAdmin(request("/admin/trash"), env as AppEnv);
  expect(trash.items.map((entry) => entry.slug)).toEqual([slug]);
});

it("rejects invalid edits and rolls back revisions on a failed database write", async () => {
  const { slug } = await createPost();
  for (const body of [{ kind: "invalid" }, { author: 3 }, { body: null }, { title: "" }]) {
    expect((await SELF.fetch(`${origin}/api/posts/${slug}`, { method: "PATCH", headers: bearer, body: JSON.stringify(body) })).status).toBe(400);
  }
  await env.DB.prepare("CREATE TRIGGER reject_test_update BEFORE UPDATE ON posts BEGIN SELECT RAISE(ABORT, 'forced failure'); END").run();
  try {
    const response = await SELF.fetch(`${origin}/api/posts/${slug}`, { method: "PATCH", headers: bearer, body: JSON.stringify({ body: "lost" }) });
    expect(response.status).toBe(500);
    expect((await getPublishedPost(env.DB, slug))?.body_md).toBe("zzcanarynews");
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM revisions").first<{ n: number }>())!.n).toBe(0);
  } finally { await env.DB.prepare("DROP TRIGGER reject_test_update").run(); }
});
