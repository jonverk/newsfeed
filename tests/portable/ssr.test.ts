import { beforeEach, expect, it } from "vitest";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { env, executionCtx } from "./runtime";

// Exercise the actual production Worker + React Router SSR without a TCP server.
const bundle = pathToFileURL(resolve("build/server/index.js")).href;
const { default: worker } = await import(/* @vite-ignore */ bundle);
const origin = "https://x.test";
const bearer = { authorization: "Bearer test-token", "content-type": "application/json" };
const request = (path: string, init?: RequestInit): Promise<Response> => Promise.resolve(worker.fetch(new Request(origin + path, init), env, executionCtx));
let loginCount = 0;
async function login() {
  const response = await request("/api/auth/login", { method: "POST", headers: { origin, "content-type": "application/json", "cf-connecting-ip": `ssr-${++loginCount}` }, body: JSON.stringify({ username: "jon", password: "test-password" }) });
  expect(response.status).toBe(200);
  return response.headers.get("set-cookie")!.split(";")[0];
}

beforeEach(async () => {
  for (const table of ["posts", "rules", "search_index", "admin_sessions", "revisions"]) await env.DB.prepare(`DELETE FROM ${table}`).run();
});

it("serves login and redirects all anonymous admin documents and data requests", async () => {
  const response = await request("/login");
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  const html = await response.text();
  expect(html).toContain('name="username"'); expect(html).toContain('type="password"');
  for (const path of ["/admin/news", "/admin/news/new", "/admin/rules/new", "/admin/trash", "/admin/org"]) {
    const denied = await request(path);
    expect(denied.status).toBe(302);
    expect(denied.headers.get("location")).toBe("/login");
    expect(denied.headers.get("cache-control")).toBe("private, no-store");
  }
  const data = await request("/admin/news.data");
  expect(data.headers.get("cache-control")).toBe("private, no-store");
  expect(await data.text()).toContain("/login");
});

it("renders authenticated Markdown editors, lists, org upload, and trash from the production build", async () => {
  const cookie = await login();
  const headers = { cookie };
  for (const [path, text] of [["/admin/news", "Add entry"], ["/admin/news/new", "Save draft"], ["/admin/rules/new", "Body (Markdown)"], ["/admin/trash", "Trash is empty."]]) {
    const response = await request(path, { headers });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.text()).toContain(text);
  }
  const draft = await request("/api/posts", { method: "POST", headers: { ...bearer }, body: JSON.stringify({ title: "Private SSR canary", body: "private-ssr-body", draft: true }) });
  const { slug } = await draft.json() as { slug: string };
  const edit = await request(`/admin/news/${slug}/edit`, { headers });
  expect(edit.status).toBe(200);
  expect(await edit.text()).toContain("private-ssr-body");
  const data = await request(`/admin/news/${slug}/edit.data`, { headers });
  expect(data.status).toBe(200);
  expect(await data.text()).toContain("private-ssr-body");
  expect(data.headers.get("cache-control")).toBe("private, no-store");
  await request("/api/handbook/org-chart", { method: "PUT", headers: bearer, body: JSON.stringify({ title: "Org", body: "```mermaid\ngraph TD\nA-->B\n```", category: "org" }) });
  expect(await (await request("/admin/org", { headers })).text()).toContain('type="file"');
  await request(`/api/posts/${slug}`, { method: "DELETE", headers: bearer });
  expect(await (await request("/admin/trash", { headers })).text()).toContain("Private SSR canary");
  for (const path of ["/", "/news", `/news/${slug}`, "/search?q=private", "/rules"]) expect(await (await request(path)).text()).not.toContain("private-ssr-body");
});

it("keeps the chart independent when a rule is trashed", async () => {
  const file = new FormData(); file.set("file", new File(["```mermaid\ngraph TD\nA-->B\n```"], "org.md"));
  expect((await request("/api/org", {method:"PUT",headers:{authorization:"Bearer test-token"},body:file})).status).toBe(200);
  await request("/api/rules/example", {method:"PUT",headers:bearer,body:JSON.stringify({title:"Example",body:"rule-ssr-canary"})});
  await request("/api/rules/example", {method:"DELETE",headers:bearer});
  expect((await request("/rules/example")).status).toBe(404);
  expect((await request("/org")).status).toBe(200);
  expect((await (await request("/org.md")).text())).toContain("A-->B");
});

it("shows the requested navigation and combines the existing topics into one Rules page", async () => {
  for (const [slug, category] of [["core-example", "rules"], ["reference-example", "faq"]]) {
    const response = await request(`/api/rules/${slug}`, { method: "PUT", headers: bearer, body: JSON.stringify({ title: slug, body: `Content for ${slug}`, category }) });
    expect(response.status).toBe(200);
  }
  const response = await request("/rules");
  expect(response.status).toBe(200);
  const html = await response.text();
  expect(html).toContain("<title>Operational Rules — JonVerk</title>");
  const navigation = html.match(/<nav aria-label="Main navigation"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
  expect(navigation).toBeTruthy();
  for (const [path, label] of [["/news", "Newsfeed"], ["/rules", "Rules"], ["/org", "Organization"], ["https://memory.jonverk.online", "Memory"], ["https://projects.jonverk.online", "Projects"], ["/search", "Search"], ["/login", "Log in"]]) {
    expect(navigation).toContain(`href="${path}"`);
    expect(navigation).toContain(`>${label}</a>`);
  }
  expect(navigation).not.toMatch(/Handbook|FAQ|Announcements|href="\/handbook|href="\/faq/);
  expect(html.match(/href="\/rules\/core-example"/g)).toHaveLength(1);
  expect(html.match(/href="\/rules\/reference-example"/g)).toHaveLength(1);

  expect(html).not.toContain("Frequently Asked Questions");
  expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM rules").first())?.n).toBe(2);
  const home = await (await request("/")).text();
  expect(home).toContain('href="/rules/core-example"');
  expect(home).not.toContain('href="/handbook');
  expect(await (await request("/news")).text()).not.toContain("Announcements");
});

it("serves canonical rule details and preserves old page and admin bookmarks", async () => {
  await request("/api/rules/retained-entry", { method: "PUT", headers: bearer, body: JSON.stringify({ title: "Retained rule", body: "Same stored content", category: "rules" }) });
  const detail = await request("/rules/retained-entry");
  expect(detail.status).toBe(200);
  const html = await detail.text();
  expect(html).toContain("Same stored content");
  expect(html).toContain('href="/rules/retained-entry.md"');
  expect(html).not.toContain('href="/handbook/');
  for (const [path, target] of [["/handbook", "/rules"], ["/faq", "/rules"], ["/handbook/retained-entry", "/rules/retained-entry"]]) {
    const response = await request(path);
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(target);
  }
  const cookie = await login();
  const oldAdmin = await request("/admin/handbook?page=2", { headers: { cookie } });
  expect(oldAdmin.status).toBe(308);
  expect(oldAdmin.headers.get("location")).toBe("/admin/rules?page=2");
  expect(oldAdmin.headers.get("cache-control")).toBe("private, no-store");
  const oldEditor = await request("/admin/handbook/retained-entry/edit", { headers: { cookie } });
  expect(oldEditor.status).toBe(308);
  expect(oldEditor.headers.get("location")).toBe("/admin/rules/retained-entry/edit");
  const editor = await request("/admin/rules/retained-entry/edit", { headers: { cookie } });
  expect(editor.status).toBe(200);
  const editHtml = await editor.text();
  expect(editHtml).toContain("operational rule");
  expect(editHtml).not.toContain("Handbook");
  expect(editHtml).not.toContain('value="faq"');
});

it("offers Markdown sources on public pages and replacement uploads to editors", async () => {
  const cookie = await login();
  await request("/api/rules/source-rule", {method:"PUT", headers:bearer, body:JSON.stringify({title:"Source rule",body:"rule text"})});
  const post = await (await request("/api/posts", {method:"POST",headers:bearer,body:JSON.stringify({title:"Source news",body:"news text"})})).json() as {slug:string};
  await request("/api/agents/SRC", {method:"PUT",headers:bearer,body:JSON.stringify({body:"profile text"})});
  for (const [path, link] of [["/rules/source-rule","/rules/source-rule.md"],[`/news/${post.slug}`,`/news/${post.slug}.md`],["/org/SRC","/org/SRC.md"]]) {
    const html = await (await request(path)).text(); expect(html).toContain(`href="${link}"`); expect(html).toContain("View Markdown source");
  }
  for (const path of ["/admin/rules/source-rule/edit",`/admin/news/${post.slug}/edit`]) {
    const html = await (await request(path,{headers:{cookie}})).text(); expect(html).toContain("Upload replacement"); expect(html).toContain("View Markdown source");
  }
});

it("shows existing categories as selectable controls on rule and news editors", async () => {
  const cookie = await login();
  await request("/api/tags", {method:"POST",headers:bearer,body:JSON.stringify({name:"Operations"})});
  await request("/api/rules/category-rule", {method:"PUT",headers:bearer,body:JSON.stringify({title:"Category rule",body:"body"})});
  await request("/api/tags/rule/category-rule", {method:"PUT",headers:bearer,body:JSON.stringify({tags:["Operations"]})});
  const post = await (await request("/api/posts", {method:"POST",headers:bearer,body:JSON.stringify({title:"Category news",body:"body",draft:true})})).json() as {slug:string};
  for (const path of ["/admin/rules/category-rule/edit", `/admin/news/${post.slug}/edit`]) {
    const html = await (await request(path,{headers:{cookie}})).text();
    expect(html).toContain("Apply categories"); expect(html).toContain('type="checkbox"'); expect(html).toContain('value="Operations"');
  }
  const rule = await (await request("/admin/rules/category-rule/edit",{headers:{cookie}})).text();
  expect(rule.match(/<input[^>]*value="Operations"[^>]*>/)?.[0]).toContain("checked");
  const list = await (await request("/admin/news",{headers:{cookie}})).text(); expect(list).toContain(`/admin/news/${post.slug}/edit#categories`);
});
