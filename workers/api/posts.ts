import { Hono } from "hono";
import type { AppEnv } from "../lib/env";
import { requireToken } from "../lib/auth";
import { validatePostInput } from "../lib/validate";
import { slugify } from "../lib/slug";
import { getPostForAdmin, getPublishedPost, listPublishedPosts } from "../lib/content";
import { indexDocument, removeFromIndex } from "../lib/search";

export const posts = new Hono<{ Bindings: AppEnv }>();

function nowIso() {
  return new Date().toISOString();
}

posts.post("/", async (c) => {
  const auth = await requireToken(c.req.raw, c.env);
  if (auth) return auth;

  // idempotency
  const idemKey = c.req.header("idempotency-key");
  if (idemKey) {
    const existing = await c.env.DB.prepare("SELECT status, body FROM idempotency WHERE key = ?").bind(idemKey).first();
    if (existing) {
      return new Response(existing.body as string, { status: existing.status as number, headers: { "content-type": "application/json" } });
    }
  }

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ message: "Invalid JSON", field: "body" }, 400);
  }

  const v = validatePostInput(body);
  if (!v.ok) {
    return c.json({ message: v.message, field: v.field }, 400);
  }
  const input = v.value;

  let slug = input.slug || slugify(input.title);
  // ensure unique
  let slugToUse = slug;
  let n = 2;
  while (true) {
    const existing = await getPostForAdmin(c.env.DB, slugToUse);
    if (!existing) break;
    slugToUse = `${slug}-${n++}`;
    if (n > 100) break;
  }

  const ts = nowIso();
  const isDraft = input.draft === true;
  const status = isDraft ? "draft" : "published";
  const published_at = isDraft ? null : ts;

  await c.env.DB
    .prepare("INSERT INTO posts (slug,title,body_md,kind,author,status,published_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .bind(slugToUse, input.title, input.body, input.kind || "announcement", input.author || "Jon", status, published_at, ts, ts)
    .run();

  if (!isDraft) {
    await indexDocument(c.env.DB, { kind: "post", slug: slugToUse, title: input.title, body: input.body });
  }

  const res = { slug: slugToUse, url: `/news/${slugToUse}`, md_url: `/news/${slugToUse}.md`, id: 0 };
  const resBody = JSON.stringify(res);
  if (idemKey) {
    await c.env.DB.prepare("INSERT OR REPLACE INTO idempotency (key,status,body,created_at) VALUES (?,?,?,?)").bind(idemKey, 201, resBody, ts).run();
  }
  return c.json(res, 201);
});

posts.post("/:slug/publish", async (c) => {
  const auth = await requireToken(c.req.raw, c.env);
  if (auth) return auth;
  const slug = c.req.param("slug");
  const post = await getPostForAdmin(c.env.DB, slug);
  if (!post) return c.json({ message: "Not found" }, 404);
  if (post.status === "published") {
    await indexDocument(c.env.DB, { kind: "post", slug, title: post.title, body: post.body_md });
    return c.json({ ok: true });
  }
  const ts = nowIso();
  await c.env.DB.prepare("UPDATE posts SET status='published', published_at = COALESCE(published_at, ?), updated_at = ? WHERE slug = ?").bind(ts, ts, slug).run();
  await indexDocument(c.env.DB, { kind: "post", slug, title: post.title, body: post.body_md });
  return c.json({ ok: true });
});

posts.patch("/:slug", async (c) => {
  const auth = await requireToken(c.req.raw, c.env);
  if (auth) return auth;
  const slug = c.req.param("slug");
  const post = await getPostForAdmin(c.env.DB, slug);
  if (!post) return c.json({ message: "Not found" }, 404);
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ message: "Invalid JSON", field: "body" }, 400);
  }
  const ts = nowIso();
  // save revision
  await c.env.DB.prepare("INSERT INTO revisions (entity_type,entity_ref,title,body_md,saved_at,saved_by) VALUES (?,?,?,?,?,?)")
    .bind("post", slug, post.title, post.body_md, ts, "")
    .run();
  const newTitle = typeof body.title === "string" ? body.title : post.title;
  const newBody = typeof body.body === "string" ? body.body : post.body_md;
  if (typeof body.body === "string" && body.body.length > 65536) {
    return c.json({ message: "body too large", field: "body" }, 400);
  }
  if (typeof body.title === "string" && body.title.length > 120) {
    return c.json({ message: "title too long", field: "title" }, 400);
  }
  await c.env.DB.prepare("UPDATE posts SET title=?, body_md=?, updated_at=? WHERE slug = ?").bind(newTitle, newBody, ts, slug).run();
  if (post.status === "published") {
    await indexDocument(c.env.DB, { kind: "post", slug, title: newTitle, body: newBody });
  } else {
    await removeFromIndex(c.env.DB, "post", slug);
  }
  return c.json({ ok: true });
});

posts.get("/", async (c) => {
  const status = c.req.query("status");
  if (status && status !== "published") {
    const auth = await requireToken(c.req.raw, c.env);
    if (auth) return auth;
    // return drafts
    const { results } = await c.env.DB.prepare("SELECT id, slug, title, body_md, kind, author, status, published_at, created_at, updated_at FROM posts WHERE status = ? ORDER BY created_at DESC").bind(status).all();
    return c.json({ items: results || [] });
  }
  const posts = await listPublishedPosts(c.env.DB);
  return c.json({ items: posts });
});

posts.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const pub = await getPublishedPost(c.env.DB, slug);
  if (pub) return c.json(pub);
  const admin = await getPostForAdmin(c.env.DB, slug);
  if (!admin) return c.json({ message: "Not found" }, 404);
  if (admin.status === "draft") {
    const authCheck = await requireToken(c.req.raw, c.env);
    if (authCheck) {
      // requireToken returns null if valid, else Response(401)
      // but spec says "keeps drafts out of public reads and 404s their slug"
      // if no valid token, return 404
      return c.json({ message: "Not found" }, 404);
    }
    return c.json(admin);
  }
  const authCheck = await requireToken(c.req.raw, c.env);
  if (authCheck) {
    return c.json({ message: "Not found" }, 404);
  }
  return c.json(admin);
});
