import { Hono } from "hono";
import type { AppEnv } from "../lib/env";
import { listPublishedPosts, getPublishedPost, listRules, getRule, getOrgRule, listProfiles, getTags, getPublicState } from "../lib/content";
import { deriveSummary, toMarkdownDocument } from "../lib/render";
import { conditionalResponse, etagFor } from "../lib/http";

export const surfaces = new Hono<{ Bindings: AppEnv }>();

function nowIso() {
  return new Date().toISOString();
}

surfaces.get("/feed.json", async (c) => {
  const limitQ = c.req.query("limit");
  let limit = 50;
  if (limitQ) {
    const n = parseInt(limitQ);
    if (!isNaN(n)) limit = Math.min(Math.max(n, 1), 200);
  }
  const posts = await listPublishedPosts(c.env.DB, { limit });
  const items = await Promise.all(posts.map(async (p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    kind: p.kind,
    tags: await getTags(c.env.DB, "post", p.slug),
    author: p.author,
    published_at: p.published_at,
    updated_at: p.updated_at,
    summary: deriveSummary(p.body_md),
    url: `/news/${p.slug}`,
    md_url: `/news/${p.slug}.md`,
  })));
  const updated_at = (await getPublicState(c.env.DB)).changed_at;
  const body = JSON.stringify({ version: 1, updated_at, items }, null, 0);
  return conditionalResponse(c.req.raw, body, { contentType: "application/json", updatedAt: updated_at });
});

surfaces.get("/news/:file{[^/]+\\.md}", async (c) => {
  const file = c.req.param("file");
  const slug = file.slice(0, -3);
  const post = await getPublishedPost(c.env.DB, slug);
  if (!post) return c.json({ message: "Not found" }, 404);
  const doc = toMarkdownDocument({
    frontmatter: {
      title: post.title,
      slug: post.slug,
      id: post.id,
      status: post.status,
      tags: (await getTags(c.env.DB, "post", post.slug)).join(", "),
      kind: post.kind,
      author: post.author,
      published_at: post.published_at,
      updated_at: post.updated_at,
      canonical: `/news/${post.slug}`,
    },
    body: post.body_md,
  });
  return conditionalResponse(c.req.raw, doc, { contentType: "text/markdown; charset=utf-8", updatedAt: post.updated_at || post.created_at });
});

surfaces.on("GET", ["/rules/:file{[^/]+\\.md}", "/handbook/:file{[^/]+\\.md}"], async (c) => {
  const file = c.req.param("file")!;
  const slug = file.slice(0, -3);
  const rule = await getRule(c.env.DB, slug);
  if (!rule || rule.status === "draft") return c.json({ message: "Not found" }, 404);
  const doc = toMarkdownDocument({
    frontmatter: {
      title: rule.title,
      slug: rule.slug,
      tags: (await getTags(c.env.DB, "rule", rule.slug)).join(", "),
      canonical: `/rules/${rule.slug}`,
    },
    body: rule.body_md,
  });
  return conditionalResponse(c.req.raw, doc, { contentType: "text/markdown; charset=utf-8", updatedAt: rule.updated_at || rule.created_at });
});

// Old page URLs have one destination. Markdown aliases above remain readable
// for existing agents, with /rules URLs in their canonical metadata.
surfaces.on("GET", ["/handbook", "/handbook/*", "/faq", "/faq/"], (c) => {
  const url = new URL(c.req.url);
  const path = url.pathname.startsWith("/handbook") ? url.pathname.replace(/^\/handbook/, "/rules") : "/rules";
  return c.redirect(path + url.search, 308);
});

surfaces.get("/org.md", async (c) => {
  const ruleObj = await getOrgRule(c.env.DB);
  if (!ruleObj) return c.json({ message: "Not found" }, 404);
  const doc = toMarkdownDocument({
    frontmatter: { title: ruleObj.title, canonical: "/org" },
    body: ruleObj.body_md,
  });
  return conditionalResponse(c.req.raw, doc, { contentType: "text/markdown; charset=utf-8", updatedAt: ruleObj.updated_at });
});

surfaces.get("/orglist.md", async c => {
  const profiles = await listProfiles(c.env.DB);
  const updated = (await getPublicState(c.env.DB)).changed_at;
  const body = "# Agent directory\n\n" + profiles.map(p => `## ${p.tag}\n\n${p.body_md}`).join("\n\n");
  return conditionalResponse(c.req.raw, body, { contentType: "text/markdown; charset=utf-8", updatedAt: updated });
});

surfaces.get("/llms.txt", async (c) => {
  const posts = await listPublishedPosts(c.env.DB, { limit: 20 });
  const rules = await listRules(c.env.DB);
  const updated = (await getPublicState(c.env.DB)).changed_at;
  let out = "# JonVerk Newsfeed\n\n";
  out += "JonVerk Newsfeed provides news and citable operational rules. Agents and humans can fetch clean markdown and machine indexes.\n\n";
  out += "## Newsfeed\n\n";
  for (const p of posts) {
    const summary = deriveSummary(p.body_md).replace(/\n/g, " ");
    const d = p.published_at ? p.published_at.slice(0, 10) : p.updated_at.slice(0, 10);
    out += `- [${p.title}](/news/${p.slug}.md) — ${summary} (${d})\n`;
  }
  out += "\n## Operational Rules\n\n";
  for (const r of rules) out += `- [${r.title}](/rules/${r.slug}.md)\n`;
  out += "\n## Org\n\n";
  if (await getOrgRule(c.env.DB)) out += "- [Org chart](/org.md)\n";
  out += "- [Agent directory](/orglist.md)\n";
  for (const profile of await listProfiles(c.env.DB)) out += `- [${profile.tag}](/org/${profile.tag})\n`;
  return conditionalResponse(c.req.raw, out, { contentType: "text/plain; charset=utf-8", updatedAt: updated || nowIso() });
});

surfaces.get("/llms-full.txt", async (c) => {
  const posts = await listPublishedPosts(c.env.DB, { limit: 200 });
  const rules = await listRules(c.env.DB);
  const updated = (await getPublicState(c.env.DB)).changed_at;
  const chunks: string[] = [];
  for (const p of posts) {
    const doc = toMarkdownDocument({
      frontmatter: {
        title: p.title,
        slug: p.slug,
        id: p.id,
        status: p.status,
        tags: (await getTags(c.env.DB, "post", p.slug)).join(", "),
        kind: p.kind,
        author: p.author,
        published_at: p.published_at,
        updated_at: p.updated_at,
        canonical: `/news/${p.slug}`,
      },
      body: p.body_md,
    });
    chunks.push(doc);
  }
  for (const r of rules) {
    if (r.status === "draft") continue;
    const doc = toMarkdownDocument({
      frontmatter: {
        title: r.title,
        slug: r.slug,
        tags: (await getTags(c.env.DB, "rule", r.slug)).join(", "),
        canonical: `/rules/${r.slug}`,
      },
      body: r.body_md,
    });
    chunks.push(doc);
  }
  for (const profile of await listProfiles(c.env.DB)) chunks.push(`## ${profile.tag}\n\n${profile.body_md}`);
  const out = chunks.join("\n\n---\n\n");
  const etag = await etagFor(out, updated);
  const ifNone = c.req.header("if-none-match");
  const headers = new Headers({ "Content-Type": "text/plain; charset=utf-8" });
  headers.set("ETag", etag);
  if (updated) {
    headers.set("Last-Modified", new Date(updated).toUTCString());
  }
  headers.set("Cache-Control", "public, no-cache");

  if (ifNone && ifNone.includes(etag)) {
    return new Response(null, { status: 304, headers });
  }

  if (c.req.method === "HEAD") {
    return new Response(null, { status: 200, headers });
  }

  // stream-like response
  let i = 0;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    pull(controller) {
      if (i >= chunks.length) {
        controller.close();
        return;
      }
      const isLast = i + 20 >= chunks.length;
      const batch = chunks.slice(i, i + 20).join("\n\n---\n\n") + (isLast ? "" : "\n\n---\n\n");
      controller.enqueue(encoder.encode(batch));
      i += 20;
    },
  });

  return new Response(stream, { status: 200, headers });
});
