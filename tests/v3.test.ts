import { beforeEach, expect, it } from "vitest";
import { env, SELF } from "cloudflare:test";
const origin = "https://x.test";
const auth = { authorization: "Bearer test-token", "content-type": "application/json" };
const call = (path: string, method: string, body?: unknown, headers = auth) => SELF.fetch(origin + path, {method, headers, body: body === undefined ? undefined : JSON.stringify(body)});
beforeEach(async () => {
  for (const table of ["entry_tags", "tags", "agent_profiles", "org_chart", "posts", "rules", "search_index"]) await env.DB.prepare(`DELETE FROM ${table}`).run();
});
it("manages shared tags on rules and drafts without deleting entries", async () => {
  expect((await call("/api/tags", "POST", {name:"ops"}, {"content-type":"application/json"})).status).toBe(401);
  expect((await call("/api/tags", "POST", {name:"ops"})).status).toBe(201);
  expect((await call("/api/rules/example", "PUT", {title:"Example", body:"Content"})).status).toBe(200);
  const post = await (await call("/api/posts", "POST", {title:"Draft",body:"Draft body",draft:true})).json<{slug:string}>();
  for (const [kind,slug] of [["rule","example"],["post",post.slug]]) expect((await call(`/api/tags/${kind}/${slug}`,"PUT",{tags:["ops"]})).status).toBe(200);
  const hits = await (await SELF.fetch(origin + "/api/search?q=ops")).json<any>();
  expect(hits.hits).toEqual(expect.arrayContaining([expect.objectContaining({url:"/rules/example"})]));
  expect(hits.hits).not.toEqual(expect.arrayContaining([expect.objectContaining({url:`/news/${post.slug}`})]));
  const rule = await (await SELF.fetch(origin + "/api/rules/example")).json<any>();
  expect(rule.tags).toEqual(["ops"]); expect(rule).not.toHaveProperty("rule_id"); expect(rule).not.toHaveProperty("owner"); expect(rule).not.toHaveProperty("status");
  expect((await call("/api/tags/ops", "DELETE")).status).toBe(200);
  expect((await (await SELF.fetch(origin + "/api/rules/example")).json<any>()).tags).toEqual([]);
  expect(await env.DB.prepare("SELECT 1 FROM posts WHERE slug=?").bind(post.slug).first()).toBeTruthy();
});
it("manages agent profiles, validates tags, and updates public exports and search", async () => {
  expect((await call("/api/agents/ABC", "PUT", {body:"agent canary"}, {"content-type":"application/json"})).status).toBe(401);
  expect((await call("/api/agents/ab1", "PUT", {body:"bad"})).status).toBe(400);
  expect((await call("/api/agents/ABC", "PUT", {body:"agent canary"}, {...auth,"if-none-match":"*"})).status).toBe(200);
  expect((await call("/api/agents/ABC", "PUT", {body:"duplicate"}, {...auth,"if-none-match":"*"})).status).toBe(409);
  const initial = await SELF.fetch(origin + "/orglist.md"); const etag = initial.headers.get("etag"); expect(await initial.text()).toContain("agent canary");
  expect((await (await SELF.fetch(origin + "/api/search?q=canary")).json<any>()).hits).toEqual(expect.arrayContaining([expect.objectContaining({url:"/org/ABC"})]));
  expect((await call("/api/agents/ABC", "PUT", {body:"changed"})).status).toBe(200);
  expect((await SELF.fetch(origin + "/orglist.md", {headers:{"if-none-match":etag!}})).status).toBe(200);
  expect((await call("/api/agents/ABC", "DELETE")).status).toBe(200);
  expect(await (await SELF.fetch(origin + "/orglist.md")).text()).not.toContain("changed");
});
it("uploads and exports the independent chart without rule metadata", async () => {
  const file = new FormData(); file.set("file", new File(["```mermaid\ngraph TD\nA-->B\n```"], "org.md"));
  expect((await SELF.fetch(origin + "/api/org", {method:"PUT",headers:{authorization:"Bearer test-token"},body:file})).status).toBe(200);
  const md = await (await SELF.fetch(origin + "/org.md")).text();
  expect(md).toContain("graph TD"); expect(md).not.toMatch(/rule_id|owner|status|category|updated_at/);
  expect(await (await SELF.fetch(origin + "/org.mmd")).text()).toContain("A-->B");
});
