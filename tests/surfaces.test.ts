import { SELF } from "cloudflare:test";
import { expect, it } from "vitest";

const auth = { authorization: "Bearer test-token", "content-type": "application/json" };

it("serves a published post as markdown with frontmatter", async () => {
  await SELF.fetch("https://x.test/api/posts", { method: "POST", headers: auth, body: JSON.stringify({ title: "Markdown twin", body: "Hello **world**." }) });
  const res = await SELF.fetch("https://x.test/news/markdown-twin.md");
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/markdown");
  const text = await res.text();
  expect(text).toContain("title: Markdown twin");
  expect(text).toContain('canonical: "/news/markdown-twin"');
  expect(text).toContain("Hello **world**.");
});

it("404s the markdown twin of a draft", async () => {
  const { slug } = await (await SELF.fetch("https://x.test/api/posts", { method: "POST", headers: auth, body: JSON.stringify({ title: "Hidden md", body: "no", draft: true }) })).json<{ slug: string }>();
  expect((await SELF.fetch(`https://x.test/news/${slug}.md`)).status).toBe(404);
});

it("feeds newest first with a derived summary and supports 304", async () => {
  const res = await SELF.fetch("https://x.test/feed.json");
  const body = await res.json<{ items: Array<{ summary: string; published_at: string }> }>();
  expect(body.items.length).toBeGreaterThan(0);
  expect(body.items[0].summary.length).toBeLessThanOrEqual(280);
  const cached = await SELF.fetch("https://x.test/feed.json", { headers: { "if-none-match": res.headers.get("etag")! } });
  expect(cached.status).toBe(304);
});

it("lists content in llms.txt and includes it in llms-full.txt", async () => {
  const index = await (await SELF.fetch("https://x.test/llms.txt")).text();
  expect(index).toContain("# JonVerk Newsfeed");
  expect(index).toContain("/news/markdown-twin.md");
  const full = await (await SELF.fetch("https://x.test/llms-full.txt")).text();
  expect(full).toContain("Hello **world**.");
});

it("handles HEAD requests on /llms-full.txt", async () => {
  const res = await SELF.fetch("https://x.test/llms-full.txt", { method: "HEAD" });
  expect(res.status).toBe(200);
  expect(res.headers.get("etag")).toBeTruthy();
  expect(await res.text()).toBe("");
});
