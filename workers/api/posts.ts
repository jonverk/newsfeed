import { Hono } from "hono";
import type { AppEnv } from "../lib/env";
import { requireToken, writer, PRIVATE_CACHE } from "../lib/auth";
import { validatePostInput } from "../lib/validate";
import { slugify } from "../lib/slug";
import { getPostForAdmin, getPublishedPost, listPublishedPosts } from "../lib/content";
import { indexStatements, mutateContent, publicChange } from "../lib/mutations";
import { registerTrashRoutes } from "./trash";

export const posts = new Hono<{ Bindings: AppEnv }>();

posts.post("/", async (c) => {
  const auth = await requireToken(c.req.raw, c.env);
  if (auth) return auth;
  const idemKey = c.req.header("idempotency-key");
  if (idemKey) {
    const existing = await c.env.DB.prepare("SELECT status, body FROM idempotency WHERE key = ?").bind(idemKey).first<{ status: number; body: string }>();
    if (existing) return new Response(existing.body, { status: existing.status, headers: { "Content-Type": "application/json", "Cache-Control": PRIVATE_CACHE } });
  }
  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ message: "Invalid JSON", field: "body" }, 400); }
  const validation = validatePostInput(body);
  if (!validation.ok) return c.json({ message: validation.message, field: validation.field }, 400);
  const input = validation.value;
  const base = input.slug || slugify(input.title);
  let slug = base;
  for (let suffix = 2; await getPostForAdmin(c.env.DB, slug); suffix++) {
    if (suffix > 1000) return c.json({ message: "Choose a different title or slug", field: "slug" }, 409);
    const ending = `-${suffix}`;
    slug = `${base.slice(0, 81 - ending.length).replace(/-+$/, "")}${ending}`;
  }
  const ts = new Date().toISOString();
  const draft = input.draft === true;
  const statements = [c.env.DB.prepare("INSERT INTO posts (slug,title,body_md,kind,author,status,published_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .bind(slug, input.title, input.body, input.kind || "announcement", input.author ?? "Jon", draft ? "draft" : "published", draft ? null : ts, ts, ts),
    ...indexStatements(c.env.DB, "post", slug)];
  if (!draft) statements.push(publicChange(c.env.DB, ts));
  // Keep creation and the idempotency result atomic, including the generated ID.
  if (idemKey) statements.push(c.env.DB.prepare(`INSERT INTO idempotency (key,status,body,created_at)
    SELECT ?,201,json_object('slug',slug,'url','/news/'||slug,'md_url','/news/'||slug||'.md','id',id),? FROM posts WHERE slug = ?`).bind(idemKey, ts, slug));
  const results = await c.env.DB.batch(statements);
  return c.json({ slug, url: `/news/${slug}`, md_url: `/news/${slug}.md`, id: results[0].meta.last_row_id }, 201);
});

posts.post("/:slug/publish", async (c) => {
  const auth = await requireToken(c.req.raw, c.env);
  if (auth) return auth;
  const slug = c.req.param("slug");
  const post = await getPostForAdmin(c.env.DB, slug);
  if (!post || post.deleted_at) return c.json({ message: "Not found" }, 404);
  const ts = new Date().toISOString();
  await mutateContent(c.env.DB, "post", slug, (await writer(c.req.raw, c.env))!, c.env.DB.prepare(
    "UPDATE posts SET status='published', published_at=COALESCE(published_at,?), updated_at=? WHERE slug=? AND deleted_at IS NULL",
  ).bind(ts, ts, slug), { revision: post.status !== "published" });
  return c.json({ ok: true });
});

posts.patch("/:slug", async (c) => {
  const auth = await requireToken(c.req.raw, c.env);
  if (auth) return auth;
  const slug = c.req.param("slug");
  const post = await getPostForAdmin(c.env.DB, slug);
  if (!post || post.deleted_at) return c.json({ message: "Not found" }, 404);
  let body: Record<string, unknown>;
  try {
    const value: unknown = await c.req.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    body = value as Record<string, unknown>;
  } catch { return c.json({ message: "Invalid JSON", field: "body" }, 400); }
  if (body.slug !== undefined && body.slug !== slug) return c.json({ message: "slug is immutable", field: "slug" }, 400);
  const validation = validatePostInput({ title: post.title, body: post.body_md, kind: post.kind, author: post.author, ...body });
  if (!validation.ok) return c.json({ message: validation.message, field: validation.field }, 400);
  const value = validation.value;
  await mutateContent(c.env.DB, "post", slug, (await writer(c.req.raw, c.env))!, c.env.DB.prepare(
    "UPDATE posts SET title=?,body_md=?,kind=?,author=?,updated_at=? WHERE slug=? AND deleted_at IS NULL",
  ).bind(value.title, value.body, value.kind, value.author, new Date().toISOString(), slug), { public: post.status === "published" });
  return c.json({ ok: true });
});

registerTrashRoutes(posts, "post");

posts.get("/", async (c) => {
  const status = c.req.query("status");
  if (status && status !== "published") {
    const auth = await requireToken(c.req.raw, c.env);
    if (auth) return auth;
    if (status !== "draft") return c.json({ message: "Invalid status", field: "status" }, 400);
    c.header("Cache-Control", PRIVATE_CACHE);
    const { results } = await c.env.DB.prepare("SELECT * FROM posts WHERE status=? AND deleted_at IS NULL ORDER BY created_at DESC").bind(status).all();
    return c.json({ items: results });
  }
  return c.json({ items: await listPublishedPosts(c.env.DB) });
});

posts.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const published = await getPublishedPost(c.env.DB, slug);
  if (published) return c.json(published);
  const post = await getPostForAdmin(c.env.DB, slug);
  if (!post || post.deleted_at || await requireToken(c.req.raw, c.env)) return c.json({ message: "Not found" }, 404);
  c.header("Cache-Control", PRIVATE_CACHE);
  return c.json(post);
});
