import { SELF, env } from "cloudflare:test";
import { expect, it } from "vitest";
import { searchContent } from "../workers/lib/search";

const auth = { authorization: "Bearer test-token", "content-type": "application/json" };

it("indexes on write and finds by body text", async () => {
  await SELF.fetch("https://x.test/api/posts", { method: "POST", headers: auth, body: JSON.stringify({ title: "Verification", body: "Run the checks before claiming done." }) });
  const hits = await searchContent(env.DB, "checks");
  expect(hits.map((h) => h.slug)).toContain("verification");
  expect(hits[0].url).toBe("/news/verification");
});

it("never returns drafts", async () => {
  await SELF.fetch("https://x.test/api/posts", { method: "POST", headers: auth, body: JSON.stringify({ title: "Secret plan", body: "classified", draft: true }) });
  expect(await searchContent(env.DB, "classified")).toEqual([]);
});

it("returns empty array for empty search queries", async () => {
  expect(await searchContent(env.DB, "")).toEqual([]);
  expect(await searchContent(env.DB, "   ")).toEqual([]);
});

it("escapes fts operators in a query instead of erroring", async () => {
  const res = await SELF.fetch("https://x.test/api/search?q=" + encodeURIComponent('" OR *'));
  expect(res.status).toBe(200);
});

it("returns search hits via the api", async () => {
  const res = await SELF.fetch("https://x.test/api/search?q=checks");
  expect(res.status).toBe(200);
  const data = await res.json<{ q: string; hits: Array<{ slug: string }> }>();
  expect(data.hits.map((h) => h.slug)).toContain("verification");
});
