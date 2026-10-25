import { SELF } from "cloudflare:test";
import { expect, it, beforeAll } from "vitest";
import initSql from "../migrations/0001_init.sql?raw";

const auth = { authorization: "Bearer test-token", "content-type": "application/json" };

beforeAll(async () => {
  const { env } = await import("cloudflare:test");
  const queries = initSql.split(";").map(q => q.trim()).filter(q => q && !q.startsWith("--"));
  for (const q of queries) {
    try {
      await env.DB.prepare(q).run();
    } catch {}
  }
});

it("rejects writes without the token", async () => {
  const res = await SELF.fetch("https://x.test/api/posts", { method: "POST", body: JSON.stringify({ title: "T", body: "B" }) });
  expect(res.status).toBe(401);
});

it("rejects empty Bearer auth header", async () => {
  const res = await SELF.fetch("https://x.test/api/posts", { method: "POST", headers: { authorization: "Bearer " }, body: JSON.stringify({ title: "T", body: "B" }) });
  expect(res.status).toBe(401);
});

it("creates a published post and exposes it in the list", async () => {
  const res = await SELF.fetch("https://x.test/api/posts", { method: "POST", headers: auth, body: JSON.stringify({ title: "Blocker cleared", body: "All free to work." }) });
  expect(res.status).toBe(201);
  const created = await res.json<{ slug: string; url: string; md_url: string }>();
  expect(created.slug).toBe("blocker-cleared");
  expect(created.url).toBe(`/news/${created.slug}`);
  const list = await (await SELF.fetch("https://x.test/api/posts")).json<{ items: Array<{ slug: string }> }>();
  expect(list.items.map((i) => i.slug)).toContain(created.slug);
});

it("keeps drafts out of public reads and 404s their slug", async () => {
  const res = await SELF.fetch("https://x.test/api/posts", { method: "POST", headers: auth, body: JSON.stringify({ title: "Draft", body: "hidden", draft: true }) });
  const { slug } = await res.json<{ slug: string }>();
  expect((await SELF.fetch(`https://x.test/api/posts/${slug}`)).status).toBe(404);
  const admin = await SELF.fetch(`https://x.test/api/posts/${slug}`, { headers: auth });
  expect(admin.status).toBe(200);
  expect((await admin.json<{ status: string }>()).status).toBe("draft");
});

it("rejects an empty title and an oversized body with a field name", async () => {
  const empty = await SELF.fetch("https://x.test/api/posts", { method: "POST", headers: auth, body: JSON.stringify({ title: "", body: "x" }) });
  expect(empty.status).toBe(400);
  expect((await empty.json<{ field: string }>()).field).toBe("title");
  const newline = await SELF.fetch("https://x.test/api/posts", { method: "POST", headers: auth, body: JSON.stringify({ title: "Bad\nTitle", body: "x" }) });
  expect(newline.status).toBe(400);
  expect((await newline.json<{ field: string }>()).field).toBe("title");
  const big = await SELF.fetch("https://x.test/api/posts", { method: "POST", headers: auth, body: JSON.stringify({ title: "Big", body: "x".repeat(65537) }) });
  expect(big.status).toBe(400);
  expect((await big.json<{ field: string }>()).field).toBe("body");
});

it("dedupes a retried create with the same Idempotency-Key", async () => {
  const key = "retry-1";
  const make = () => SELF.fetch("https://x.test/api/posts", { method: "POST", headers: { ...auth, "idempotency-key": key }, body: JSON.stringify({ title: "Once", body: "body" }) });
  const a = await make();
  const b = await make();
  expect(a.status).toBe(201);
  expect((await a.clone().json<{ slug: string }>()).slug).toBe((await b.json<{ slug: string }>()).slug);
});

it("publishes a draft and records a revision when edited", async () => {
  const created = await (await SELF.fetch("https://x.test/api/posts", { method: "POST", headers: auth, body: JSON.stringify({ title: "Later", body: "v1", draft: true }) })).json<{ slug: string }>();
  const published = await SELF.fetch(`https://x.test/api/posts/${created.slug}/publish`, { method: "POST", headers: auth });
  expect(published.status).toBe(200);
  await SELF.fetch(`https://x.test/api/posts/${created.slug}`, { method: "PATCH", headers: auth, body: JSON.stringify({ body: "v2" }) });
  const md = await (await SELF.fetch(`https://x.test/api/posts/${created.slug}`, { headers: auth })).json<{ body_md: string }>();
  expect(md.body_md).toBe("v2");
});
