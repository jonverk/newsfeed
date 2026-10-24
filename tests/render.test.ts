import { expect, it } from "vitest";
import { deriveSummary, renderMarkdown, toMarkdownDocument } from "../workers/lib/render";
import { conditionalResponse } from "../workers/lib/http";
import { slugify } from "../workers/lib/slug";

it("escapes raw HTML instead of rendering it", () => {
  const html = renderMarkdown("<script>alert(1)</script>\n\n<img src=x onerror=alert(2)>");
  expect(html).not.toContain("<script>");
  expect(html).not.toContain("<img src=x");
  expect(html).toContain("&lt;script&gt;");
});

it("derives a 280 char summary from the first paragraph", () => {
  const summary = deriveSummary("# Title\n\n" + "word ".repeat(200));
  expect(summary.length).toBeLessThanOrEqual(280);
  expect(summary.trim().endsWith("word")).toBe(true);
});

it("slugifies titles to the allowed pattern", () => {
  expect(slugify("Hello, World! 2")).toBe("hello-world-2");
  expect(slugify("  Ünïcode ✓  ")).toMatch(/^[a-z0-9][a-z0-9-]*$/);
});

it("writes frontmatter with stable key order and no undefined values", () => {
  const doc = toMarkdownDocument({ frontmatter: { title: "T", slug: "s", superseded_by: undefined }, body: "Body" });
  expect(doc.startsWith("---\ntitle: T\nslug: s\n---\n\nBody")).toBe(true);
});

it("returns 304 when the etag matches and 200 with the new body when it does not", async () => {
  const first = await conditionalResponse(new Request("https://x.test/doc"), "one", { contentType: "text/plain", updatedAt: "2026-10-24T00:00:00.000Z" });
  const etag = first.headers.get("etag")!;
  const cached = await conditionalResponse(new Request("https://x.test/doc", { headers: { "if-none-match": etag } }), "one", { contentType: "text/plain", updatedAt: "2026-10-24T00:00:00.000Z" });
  expect(cached.status).toBe(304);
  const changed = await conditionalResponse(new Request("https://x.test/doc", { headers: { "if-none-match": etag } }), "two", { contentType: "text/plain", updatedAt: "2026-10-24T00:01:00.000Z" });
  expect(changed.status).toBe(200);
  expect(await changed.text()).toBe("two");
});
