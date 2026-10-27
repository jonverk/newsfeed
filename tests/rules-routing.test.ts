import { SELF, env } from "cloudflare:test";
import { beforeEach, expect, it } from "vitest";

const origin = "https://x.test";
const headers = { authorization: "Bearer test-token", "content-type": "application/json" };

beforeEach(async () => {
  for (const table of ["rules", "posts", "search_index", "revisions"]) await env.DB.prepare(`DELETE FROM ${table}`).run();
});

it("redirects the two former page URLs to one rules page while preserving query parameters", async () => {
  for (const [path, target] of [["/handbook", "/rules"], ["/faq", "/rules"], ["/faq/", "/rules"], ["/handbook/", "/rules/"], ["/handbook/example?from=citation", "/rules/example?from=citation"], ["/faq?from=bookmark", "/rules?from=bookmark"]]) {
    const response = await SELF.fetch(origin + path, { redirect: "manual" });
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(target);
  }
});

it("uses the same content for canonical and legacy rule clients, including trash and restore", async () => {
  const denied = await SELF.fetch(`${origin}/api/rules/example`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "Example", body: "rulebody", category: "rules" }) });
  expect(denied.status).toBe(401);
  const created = await SELF.fetch(`${origin}/api/rules/example`, { method: "PUT", headers, body: JSON.stringify({ title: "Example", body: "rulebody", category: "rules", owner: "Jon" }) });
  expect(created.status).toBe(200);
  const { id, rule_id } = await created.json<{ id: number; rule_id: string }>();
  const rule = { id, rule_id, slug: "example", body_md: "rulebody", status: "active" };
  const legacy = await (await SELF.fetch(`${origin}/api/handbook/example`)).json();
  expect(legacy).toMatchObject(rule);
  for (const prefix of ["/rules", "/handbook"]) {
    const markdown = await SELF.fetch(`${origin}${prefix}/example.md`);
    expect(markdown.status).toBe(200);
    expect(await markdown.text()).toContain('canonical: "/rules/example"');
  }
  await SELF.fetch(`${origin}/api/rules/example`, { method: "DELETE", headers });
  for (const path of ["/api/rules/example", "/api/handbook/example", "/rules/example.md", "/handbook/example.md"]) expect((await SELF.fetch(origin + path)).status).toBe(404);
  await SELF.fetch(`${origin}/api/rules/example/restore`, { method: "POST", headers });
  expect(await (await SELF.fetch(`${origin}/api/rules/example`)).json()).toMatchObject(rule);
  expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM rules").first<{ n: number }>())?.n).toBe(1);
});

it("generates canonical rule URLs in both search paths and agent exports", async () => {
  await SELF.fetch(`${origin}/api/handbook/from-cli`, { method: "PUT", headers, body: JSON.stringify({ title: "Shared rule", body: "zzsharedcontent", category: "logging" }) });
  for (const query of ["zzsharedcontent", "z"]) {
    const search = await SELF.fetch(`${origin}/api/search?q=${query}`);
    const result = await search.json<{ hits: { url: string; md_url: string }[] }>();
    expect(result.hits).toEqual([expect.objectContaining({ url: "/rules/from-cli", md_url: "/rules/from-cli.md" })]);
  }
  const index = await (await SELF.fetch(`${origin}/llms.txt`)).text();
  expect(index).toContain("## Newsfeed");
  expect(index).toContain("## Operational Rules");
  expect(index).toContain("/rules/from-cli.md");
  expect(index).not.toContain("/handbook/");
  const full = await (await SELF.fetch(`${origin}/llms-full.txt`)).text();
  expect(full).toContain('canonical: "/rules/from-cli"');
});
