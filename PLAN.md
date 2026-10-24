# Newsfeed + Handbook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `newsfeed.jonverk.online` into an announcement feed plus a citable handbook, with agent-facing markdown/JSON surfaces and a `newsfeed` CLI that publishes.

**Architecture:** One Cloudflare Worker. Hono owns `/api/*`, the `.md` twins, `/feed.json`, `/llms.txt`, `/llms-full.txt`, `/org.mmd`; React Router (SSR) owns the HTML pages and reads through the same content module. All content lives in D1 (`DB`). Writes are bearer-token authenticated; reads are public.

**Tech Stack:** Cloudflare Workers, Hono 4, React Router 7 (SSR), Tailwind 4, D1, TypeScript, `marked` 18, `highlight.js` 11, Vitest 4 + `@cloudflare/vitest-pool-workers` 0.23.

**Spec:** `docs/superpowers/specs/2026-10-24-newsfeed-design.md`

## Global Constraints

- Database binding name is `DB`, database `d1-db-newsletter`, id `39f557f4-a961-428d-814e-36bf90470ff9`.
- Read side is public and unauthenticated. Write side requires `Authorization: Bearer $NEWSFEED_TOKEN`, compared in fixed time.
- Drafts are never public: every public query constrains posts to `status = 'published'` and rules to `status IN ('active','superseded')`.
- Body markdown ≤ 64 KB (65,536 bytes). Title ≤ 120 characters. Slug matches `^[a-z0-9][a-z0-9-]{0,80}$`.
- Post kinds: `announcement`, `milestone`, `kudos`. Rule categories: `rules`, `org`, `logging`, `verification`, `process`, `other`. Post status: `draft`, `published`. Rule status: `active`, `superseded`, `draft`.
- Rule id prefixes: `RULE`, `ORG`, `LOG`, `VERIFY`, `PROC`, `MISC` (for `other`), then `-` and a zero-padded 3-digit sequence. Rule ids never change and are never reused.
- Feed `summary` is derived: first paragraph of the body, markdown stripped, cut to 280 chars at a word boundary. No summary column, no CLI flag.
- Agent surfaces and `.md` twins send `ETag`, `Last-Modified`, `Cache-Control: public, max-age=60, stale-while-revalidate=300`, answer `If-None-Match` with `304`, and support `HEAD`.
- Raw HTML in markdown is escaped, never rendered.
- No client-side JavaScript except a progressive-enhancement mermaid render on `/org`; with scripts off, the source is visible.
- Timestamps are ISO 8601 UTC strings (`new Date().toISOString()`).
- Package manager: `npm` (the tracked lockfile is `package-lock.json`).

## Review Focus

1. **Oversized or empty input** — a 65 KB+ body or a missing title must return `400` with a field name, never a 500 or a truncated write.
2. **Draft leakage** — a draft slug must `404` on `/news/:slug`, its `.md`, `/api/posts`, search, `/feed.json`, and `/llms-full.txt`, and must not be reachable by guessing.
3. **Stale conditional GET** — after content changes, an `If-None-Match` with the old ETag must return `200` and the new body, never `304`.
4. **Raw HTML in markdown** — `<script>alert(1)</script>` and `<img onerror=...>` in a body must appear escaped in HTML output.
5. **Unknown slug** — `/handbook/nope`, `/news/nope` and their `.md` twins must return 404, not a stack trace or an empty 200.

---

### Task 1: Test harness, D1 binding, first migration, health endpoint

**Files:**
- Create: `vitest.config.ts`
- Create: `tests/worker.ts`
- Create: `tests/setup.ts`
- Create: `tests/health.test.ts`
- Create: `migrations/0001_init.sql`
- Create: `workers/api/app.ts`
- Create: `workers/lib/env.ts`
- Modify: `wrangler.jsonc`
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `Env` augmented as `AppEnv` (`DB: D1Database`, `NEWSFEED_TOKEN: string`) from `workers/lib/env.ts`; `api: Hono<{ Bindings: AppEnv }>` from `workers/api/app.ts`, later mounted by `workers/app.ts`.

- [ ] **Step 1: Add dependencies**

Run:
```bash
npm i marked@18.1.1 highlight.js@11.12.0
npm i -D vitest@^4.1.0 @cloudflare/vitest-pool-workers@0.23.0
```

- [ ] **Step 2: Write `migrations/0001_init.sql`**

```sql
CREATE TABLE posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  body_md TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'announcement',
  author TEXT NOT NULL DEFAULT 'Jon',
  status TEXT NOT NULL DEFAULT 'draft',
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX posts_status_published ON posts(status, published_at DESC);

CREATE TABLE rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  body_md TEXT NOT NULL,
  category TEXT NOT NULL,
  owner TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  effective_at TEXT,
  superseded_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX rules_status_category ON rules(status, category);

CREATE TABLE revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_ref TEXT NOT NULL,
  title TEXT NOT NULL,
  body_md TEXT NOT NULL,
  saved_at TEXT NOT NULL,
  saved_by TEXT NOT NULL DEFAULT ''
);
CREATE INDEX revisions_ref ON revisions(entity_type, entity_ref, saved_at DESC);

CREATE TABLE idempotency (
  key TEXT PRIMARY KEY,
  status INTEGER NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE VIRTUAL TABLE search_index USING fts5(
  kind UNINDEXED, slug UNINDEXED, title, body
);
```

- [ ] **Step 3: Add the D1 binding to `wrangler.jsonc`**

Insert before `"observability"`:
```jsonc
"d1_databases": [
  { "binding": "DB", "database_name": "d1-db-newsletter", "database_id": "39f557f4-a961-428d-814e-36bf90470ff9", "migrations_dir": "migrations" }
],
```

- [ ] **Step 4: Write `workers/lib/env.ts`**

```ts
export type AppEnv = Env & { NEWSFEED_TOKEN: string };
export const tokenFor = (env: AppEnv) => env.NEWSFEED_TOKEN;
```

- [ ] **Step 5: Write the failing test `tests/health.test.ts`**

```ts
import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("api", () => {
  it("answers health with the worker env", async () => {
    const res = await SELF.fetch("https://example.com/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
  it("confirms FTS5 is available on this D1", async () => {
    const res = await SELF.fetch("https://example.com/api/health/fts");
    expect(await res.json()).toEqual({ fts5: true });
  });
});
```

- [ ] **Step 6: Run it and watch it fail**

Run: `npx vitest run tests/health.test.ts`
Expected: FAIL — no `workers/api/app.ts`, endpoint 404.

- [ ] **Step 7: Write `workers/api/app.ts` with `api` and the two health routes**

`/api/health` returns `{ ok: true }`; `/api/health/fts` runs `CREATE VIRTUAL TABLE IF NOT EXISTS __fts_probe USING fts5(x)` in a `try` and returns `{ fts5: true }` or `{ fts5: false }`. Signature: `export const api = new Hono<{ Bindings: AppEnv }>()`.

- [ ] **Step 8: Write `vitest.config.ts`, `tests/worker.ts`, `tests/setup.ts`**

`tests/worker.ts`: `export default { fetch: api.fetch } as ExportedHandler<AppEnv>`.
`vitest.config.ts`: `defineWorkersConfig({ test: { setupFiles: ["./tests/setup.ts"], poolOptions: { workers: { main: "./tests/worker.ts", singleWorker: true, wrangler: { configPath: "./wrangler.jsonc" }, miniflare: { bindings: { NEWSFEED_TOKEN: "test-token" } } } } } })`.
`tests/setup.ts`: in `beforeAll`, import the migration with `import initSql from "../migrations/0001_init.sql?raw"` and call `applyD1Migrations(env.DB, [{ name: "0001_init.sql", queries: initSql.split(";").filter(q => q.trim()) }])` from `cloudflare:test`, guarding with a module-level boolean so repeated files are safe.

- [ ] **Step 9: Add `"test": "vitest run"` to `package.json` scripts, run the tests**

Run: `npm test`
Expected: PASS, both tests.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json wrangler.jsonc vitest.config.ts tests workers/lib/env.ts workers/api/app.ts migrations
git commit -m "feat: d1 binding, test harness, health endpoint"
```

---

### Task 2: Content queries that refuse to leak drafts

**Files:**
- Create: `workers/lib/content.ts`
- Test: `tests/content.test.ts`

**Interfaces:**
- Consumes: `env.DB` from `cloudflare:test` in tests.
- Produces (all from `workers/lib/content.ts`):
  - `type Post = { id: number; slug: string; title: string; body_md: string; kind: PostKind; author: string; status: "draft" | "published"; published_at: string | null; created_at: string; updated_at: string }`
  - `type Rule = { id: number; rule_id: string; slug: string; title: string; body_md: string; category: Category; owner: string; status: "active" | "superseded" | "draft"; effective_at: string | null; superseded_by: string | null; created_at: string; updated_at: string }`
  - `listPublishedPosts(db: D1Database, opts?: { limit?: number; offset?: number }): Promise<Post[]>`
  - `getPublishedPost(db: D1Database, slug: string): Promise<Post | null>`
  - `getPostForAdmin(db: D1Database, slug: string): Promise<Post | null>`
  - `listRules(db: D1Database, opts?: { statuses?: Array<"active" | "superseded"> }): Promise<Rule[]>`
  - `getRule(db: D1Database, slug: string): Promise<Rule | null>`

- [ ] **Step 1: Write the failing test**

```ts
import { env } from "cloudflare:test";
import { expect, it } from "vitest";
import { getPostForAdmin, getPublishedPost, listPublishedPosts, listRules } from "../workers/lib/content";

const now = "2026-10-24T00:00:00.000Z";
async function seed() {
  await env.DB.prepare("INSERT INTO posts (slug,title,body_md,kind,author,status,published_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .bind("live", "Live", "hi", "announcement", "Jon", "published", now, now, now).run();
  await env.DB.prepare("INSERT INTO posts (slug,title,body_md,kind,author,status,published_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .bind("hidden", "Hidden", "secret", "announcement", "Jon", "draft", null, now, now).run();
  await env.DB.prepare("INSERT INTO rules (rule_id,slug,title,body_md,category,owner,status,effective_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .bind("LOG-001", "logging", "Logging", "log it", "logging", "Jon", "active", now, now, now).run();
}

it("lists only published posts, newest first", async () => {
  await seed();
  const posts = await listPublishedPosts(env.DB);
  expect(posts.map((p) => p.slug)).toContain("live");
  expect(posts.map((p) => p.slug)).not.toContain("hidden");
});

it("does not resolve a draft by slug publicly, but does for admin", async () => {
  await seed();
  expect(await getPublishedPost(env.DB, "hidden")).toBeNull();
  expect((await getPostForAdmin(env.DB, "hidden"))?.status).toBe("draft");
});

it("excludes draft rules from public listings", async () => {
  await seed();
  const rules = await listRules(env.DB);
  expect(rules.every((r) => r.status !== "draft")).toBe(true);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/content.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `workers/lib/content.ts`**

Each query uses explicit column lists (no `SELECT *`), binds parameters, and constrains status in SQL. `listPublishedPosts` orders by `published_at DESC`, defaults `limit` 20 and caps at 200. `listRules` defaults to `['active','superseded']`, orders by `category, rule_id`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/content.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add workers/lib/content.ts tests/content.test.ts
git commit -m "feat: content queries with draft-safe reads"
```

---

### Task 3: Markdown, summaries, slugs, markdown twins, conditional responses

**Files:**
- Create: `workers/lib/render.ts`
- Create: `workers/lib/slug.ts`
- Create: `workers/lib/http.ts`
- Test: `tests/render.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `renderMarkdown(md: string): string`
  - `deriveSummary(md: string, maxChars?: number): string`
  - `slugify(input: string): string`
  - `toMarkdownDocument(doc: { frontmatter: Record<string, string | number | boolean | null | undefined>; body: string }): string`
  - `etagFor(body: string, updatedAt: string): Promise<string>`
  - `conditionalResponse(request: Request, body: string, init: { contentType: string; updatedAt: string }): Promise<Response>`

- [ ] **Step 1: Write the failing tests**

```ts
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
  expect(summary.endsWith("word")).toBe(true);
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
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/render.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the three modules**

`renderMarkdown`: `new Marked({ gfm: true })` with `renderer.html` returning the escaped `token.text`, `renderer.code` highlighting via `hljs.highlight` when `hljs.getLanguage(lang)` matches, and `renderer.heading` adding `id={slugify(text)}`. `deriveSummary`: strip headings/fences/emphasis, collapse whitespace, take up to the first blank line, cut at 280 on a word boundary. `slugify`: lowercase, NFKD, strip non `[a-z0-9]` to `-`, trim `-`, cap 80, fall back to `post`. `toMarkdownDocument`: `---\n` + `key: value` for defined values only, `---\n\n` + body. `etagFor`: `"` + first 16 hex chars of SHA-256 of `body + updatedAt` + `"`. `conditionalResponse`: if `if-none-match` includes the etag → `304` with `ETag`/`Last-Modified`/`Cache-Control` and no body; otherwise `200` with `Content-Type`, `ETag`, `Last-Modified`, `Cache-Control: public, max-age=60, stale-while-revalidate=300`; for `HEAD` omit the body.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/render.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add workers/lib/render.ts workers/lib/slug.ts workers/lib/http.ts tests/render.test.ts
git commit -m "feat: markdown rendering, summaries, etags"
```

---

### Task 4: Auth guard and post write API (create, draft, publish, edit, revisions, idempotency)

**Files:**
- Create: `workers/lib/auth.ts`
- Create: `workers/lib/validate.ts`
- Create: `workers/api/posts.ts`
- Modify: `workers/api/app.ts`
- Test: `tests/posts-api.test.ts`

**Interfaces:**
- Consumes: `api`, `AppEnv`, `listPublishedPosts`, `getPublishedPost`, `getPostForAdmin`, `slugify`, `validatePostInput`.
- Produces:
  - `requireToken(request: Request, env: AppEnv): Promise<Response | null>`
  - `validatePostInput(input: unknown): { ok: true; value: NewPost } | { ok: false; field: string; message: string }`
  - Hono routes `POST /api/posts`, `POST /api/posts/:slug/publish`, `PATCH /api/posts/:slug`, `GET /api/posts`, `GET /api/posts/:slug`.

- [ ] **Step 1: Write the failing tests**

```ts
import { SELF } from "cloudflare:test";
import { expect, it } from "vitest";

const auth = { authorization: "Bearer test-token", "content-type": "application/json" };

it("rejects writes without the token", async () => {
  const res = await SELF.fetch("https://x.test/api/posts", { method: "POST", body: JSON.stringify({ title: "T", body: "B" }) });
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
  const md = await (await SELF.fetch(`https://x.test/api/posts/${created.slug}`)).json<{ body_md: string }>();
  expect(md.body_md).toBe("v2");
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/posts-api.test.ts`
Expected: FAIL — routes 404.

- [ ] **Step 3: Implement `workers/lib/validate.ts`**

`validatePostInput` returns field-level failures for: non-object input, title missing/empty/over 120, body missing/over 65,536 bytes, `kind` not in the allowed set, `slug` not matching the regex, `draft` not boolean. Unknown keys are ignored. It also exports `validateRuleInput` with the same shape, used in Task 6.

- [ ] **Step 4: Implement `workers/lib/auth.ts`**

`requireToken` returns `null` when `Authorization` is exactly `Bearer <token>` (compare SHA-256 digests byte by byte over a fixed loop, no early return) and a `401` JSON response otherwise.

- [ ] **Step 5: Implement `workers/api/posts.ts` and mount it**

Routes return `{ slug, url, md_url, id }` on create (`url` is `/news/<slug>`, `md_url` is `/news/<slug>.md`). Slug defaults to `slugify(title)`; on collision append `-2`, `-3`. A post created without `draft` is published with `published_at = now`. `PATCH` writes the previous title/body into `revisions` (`entity_type: 'post'`) before updating, and never moves `published_at`. `GET /api/posts` accepts `limit` (default 20, max 200), `since` (ISO), and `status`; `status=draft` or any non-published value requires the token. `GET /api/posts/:slug` serves published anonymously, drafts only with the token. Mount with `api.route("/api/posts", posts)`.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/posts-api.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add workers/lib/auth.ts workers/lib/validate.ts workers/api/posts.ts workers/api/app.ts tests/posts-api.test.ts
git commit -m "feat: authenticated post API with drafts and revisions"
```

---

### Task 5: Agent surfaces — feed, markdown twins, llms indexes

**Files:**
- Create: `workers/api/surfaces.ts`
- Modify: `workers/api/app.ts`
- Test: `tests/surfaces.test.ts`

**Interfaces:**
- Consumes: `listPublishedPosts`, `getPublishedPost`, `listRules`, `getRule`, `deriveSummary`, `toMarkdownDocument`, `conditionalResponse`.
- Produces:
  - `GET /feed.json` → `{ version: 1, updated_at, items: Array<{ id, slug, title, kind, author, published_at, updated_at, summary, url, md_url }> }`
  - `GET /news/:slug.md`, `GET /handbook/:slug.md`, `GET /org.md`
  - `GET /llms.txt`, `GET /llms-full.txt`

- [ ] **Step 1: Write the failing tests**

```ts
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
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/surfaces.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `workers/api/surfaces.ts`**

Feed: 50 items by default, `?limit=` up to 200, ETag derived from the JSON body plus the newest `updated_at`. Markdown twins: frontmatter keys in fixed order — `title`, `slug`, `id` (posts) or `rule_id` (rules), `status`, `kind` or `category`, `author` or `owner`, `published_at` or `effective_at`, `updated_at`, `superseded_by`, `canonical`. `/org.md` resolves the `ORG-001` rule; if absent, `404`. `/llms.txt`: H1 `# JonVerk Newsfeed`, one-paragraph description, then `## Announcements` (newest 20, `- [title](/news/slug.md) — one-line summary (updated YYYY-MM-DD)`), `## Handbook` (active rules grouped by category, with `rule_id`, plus a `superseded by` note for superseded ones), `## Org` (link to `/org.md`). `/llms-full.txt`: every published post and every rule (`active` and `superseded`, the latter with a `> SUPERSEDED by X` line), each as its markdown document separated by `\n\n---\n\n`, streamed with `ReadableStream` in chunks of 20 documents. All responses through `conditionalResponse`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/surfaces.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add workers/api/surfaces.ts workers/api/app.ts tests/surfaces.test.ts
git commit -m "feat: feed, markdown twins, llms indexes"
```

---

### Task 6: Handbook API — create, update, supersede, rule ids

**Files:**
- Create: `workers/api/handbook.ts`
- Modify: `workers/lib/slug.ts`
- Modify: `workers/lib/validate.ts`
- Modify: `workers/api/app.ts`
- Test: `tests/handbook-api.test.ts`

**Interfaces:**
- Consumes: `validateRuleInput`, `getRule`, `listRules`, `toMarkdownDocument`.
- Produces:
  - `nextRuleId(db: D1Database, category: Category): Promise<string>`
  - `PUT /api/handbook/:slug`, `POST /api/handbook/:slug/supersede`
  - `GET /api/handbook`, `GET /api/handbook/:slug`

- [ ] **Step 1: Write the failing tests**

```ts
import { SELF, env } from "cloudflare:test";
import { expect, it } from "vitest";
import { nextRuleId } from "../workers/lib/slug";

const auth = { authorization: "Bearer test-token", "content-type": "application/json" };

it("assigns sequential prefixed rule ids per category", async () => {
  expect(await nextRuleId(env.DB, "logging")).toBe("LOG-001");
  await SELF.fetch("https://x.test/api/handbook/logging-manual", { method: "PUT", headers: auth, body: JSON.stringify({ title: "Logging", body: "log", category: "logging", owner: "Jon" }) });
  expect(await nextRuleId(env.DB, "logging")).toBe("LOG-002");
  expect(await nextRuleId(env.DB, "other")).toBe("MISC-001");
});

it("serves a rule at a stable url and id", async () => {
  const res = await SELF.fetch("https://x.test/api/handbook/logging-manual");
  expect(res.status).toBe(200);
  expect((await res.json<{ rule_id: string }>()).rule_id).toBe("LOG-001");
  expect((await SELF.fetch("https://x.test/handbook/logging-manual.md")).status).toBe(200);
});

it("keeps the old text and points at the replacement when superseded", async () => {
  await SELF.fetch("https://x.test/api/handbook/logging-v2", { method: "PUT", headers: auth, body: JSON.stringify({ title: "Logging v2", body: "new text", category: "logging", owner: "Jon" }) });
  const v2 = await (await SELF.fetch("https://x.test/api/handbook/logging-v2")).json<{ rule_id: string }>();
  await SELF.fetch("https://x.test/api/handbook/logging-manual/supersede", { method: "POST", headers: auth, body: JSON.stringify({ superseded_by: v2.rule_id }) });
  const old = await (await SELF.fetch("https://x.test/handbook/logging-manual.md")).text();
  expect(old).toContain("status: superseded");
  expect(old).toContain(`superseded_by: ${v2.rule_id}`);
  expect(old).toContain("log");
  expect(old).not.toContain("new text");
});

it("keeps the rule id when a rule is recategorised", async () => {
  await SELF.fetch("https://x.test/api/handbook/logging-manual", { method: "PUT", headers: auth, body: JSON.stringify({ title: "Logging", body: "log", category: "verification", owner: "Jon" }) });
  expect((await (await SELF.fetch("https://x.test/api/handbook/logging-manual")).json<{ rule_id: string; category: string }>()).rule_id).toBe("LOG-001");
});

it("rejects an unknown category and an explicit bad rule id", async () => {
  const bad = await SELF.fetch("https://x.test/api/handbook/bad", { method: "PUT", headers: auth, body: JSON.stringify({ title: "B", body: "b", category: "nonsense" }) });
  expect(bad.status).toBe(400);
  const badId = await SELF.fetch("https://x.test/api/handbook/bad2", { method: "PUT", headers: auth, body: JSON.stringify({ title: "B", body: "b", category: "logging", rule_id: "nope" }) });
  expect(badId.status).toBe(400);
  expect((await badId.json<{ field: string }>()).field).toBe("rule_id");
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/handbook-api.test.ts`
Expected: FAIL — `nextRuleId` missing.

- [ ] **Step 3: Implement `nextRuleId` and the prefix rules in `workers/lib/slug.ts`**

`PREFIX_BY_CATEGORY` maps the six categories to `RULE`, `ORG`, `LOG`, `VERIFY`, `PROC`, `MISC`. `nextRuleId` selects the highest sequence for the prefix with `ORDER BY rule_id DESC LIMIT 1`, increments it, formats with `padStart(3, "0")`.

- [ ] **Step 4: Implement `workers/api/handbook.ts`**

`PUT` creates with `status: 'active'` and `effective_at = now` when omitted, or updates in place, always writing the previous title/body to `revisions` (`entity_type: 'rule'`). An explicit `rule_id` must match `^[A-Z]{2,6}-\d{3}$` and, on create, its prefix must match the category; on update, the stored `rule_id` is immutable and an explicit different value is a `400` on field `rule_id`. `supersede` requires the target rule to exist, refuses self-supersession and cycles (target already superseded), sets `status='superseded'` and `superseded_by`, and writes a revision row.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/handbook-api.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add workers/api/handbook.ts workers/lib/slug.ts workers/lib/validate.ts workers/api/app.ts tests/handbook-api.test.ts
git commit -m "feat: handbook api with stable rule ids and supersession"
```

---

### Task 7: Search — FTS5 index, `?q=` API, HTML results

**Files:**
- Create: `workers/lib/search.ts`
- Create: `workers/api/search.ts`
- Create: `app/routes/search.tsx`
- Modify: `workers/lib/content.ts`
- Modify: `workers/api/posts.ts`
- Modify: `workers/api/handbook.ts`
- Modify: `workers/api/app.ts`
- Modify: `app/routes.ts`
- Test: `tests/search.test.ts`

**Interfaces:**
- Consumes: `listPublishedPosts`, `getPublishedPost`, `listRules`, `getRule`, `renderMarkdown`.
- Produces:
  - `indexDocument(db: D1Database, doc: { kind: "post" | "rule"; slug: string; title: string; body: string }): Promise<void>`
  - `removeFromIndex(db: D1Database, kind: "post" | "rule", slug: string): Promise<void>`
  - `searchContent(db: D1Database, q: string, kind?: "post" | "rule"): Promise<SearchHit[]>` where `SearchHit = { kind, slug, title, snippet, url, md_url }`
  - `GET /api/search?q=&kind=`

- [ ] **Step 1: Write the failing tests**

```ts
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

it("escapes fts operators in a query instead of erroring", async () => {
  const res = await SELF.fetch("https://x.test/api/search?q=" + encodeURIComponent('" OR *'));
  expect(res.status).toBe(200);
});

it("renders search results as html", async () => {
  const res = await SELF.fetch("https://x.test/search?q=checks");
  expect(res.status).toBe(200);
  expect(await res.text()).toContain("Verification");
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/search.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `workers/lib/search.ts`**

`indexDocument` deletes the existing row then inserts into `search_index` (`kind`, `slug`, `title`, `body`). `searchContent` sanitizes the query by keeping word characters and spaces, splits into terms, joins as `"term" AND "term"` for `MATCH`, uses `snippet(search_index, 3, '<mark>', '</mark>', '…', 24)`, filters drafts by joining back to the source tables (`posts.status='published'`, `rules.status IN ('active','superseded')`), and falls back to a `LIKE` query over the same tables when `q` is shorter than 2 characters or the FTS query throws.

- [ ] **Step 4: Call the index from the write paths**

In `posts.ts`: index after create/publish/edit; `removeFromIndex` when a post is turned into a draft. In `handbook.ts`: index after create/update, re-index on supersede (status is not in the index, the join enforces visibility).

- [ ] **Step 5: Add `workers/api/search.ts` and mount it; add the RR route**

`/api/search` returns `{ q, hits }` with 20 results max and a `conditionalResponse` on `q`. `app/routes/search.tsx` is a loader page: reads `q` from the URL, calls `searchContent` through the loader's `context.cloudflare.env.DB`, renders a plain form plus the results (Task 8 styles it).

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/search.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add workers/lib/search.ts workers/api/search.ts app/routes/search.tsx app/routes.ts workers/api/posts.ts workers/api/handbook.ts workers/api/app.ts tests/search.test.ts
git commit -m "feat: search across posts and rules"
```

---

### Task 8: HTML pages and the visual design

**Files:**
- Create: `app/components/Layout.tsx`
- Create: `app/components/Markdown.tsx`
- Create: `app/routes/home.tsx` (replace)
- Create: `app/routes/news-index.tsx`, `app/routes/news-detail.tsx`
- Create: `app/routes/handbook-index.tsx`, `app/routes/handbook-detail.tsx`
- Create: `app/routes/org.tsx`
- Create: `app/components/OrgChart.tsx`
- Modify: `app/routes.ts`, `app/root.tsx`, `app/app.css`
- Modify: `workers/api/surfaces.ts` (serve `/org.mmd`)
- Delete: `app/welcome/welcome.tsx`, `app/welcome/logo-*.svg`

**Interfaces:**
- Consumes: `listPublishedPosts`, `getPublishedPost`, `listRules`, `getRule`, `renderMarkdown`, `deriveSummary`, `searchContent`.
- Produces: routes `/`, `/news`, `/news/:slug`, `/handbook`, `/handbook/:slug`, `/org`, `/search` (already created), and `GET /org.mmd`.

- [ ] **Step 1: Write the failing smoke tests**

`tests/pages.test.ts` — these hit the RR pages through `SELF`, so they double as the "no stack trace" check:
```ts
import { SELF } from "cloudflare:test";
import { expect, it } from "vitest";

it("renders the home page without javascript-dependent markup", async () => {
  const res = await SELF.fetch("https://x.test/");
  expect(res.status).toBe(200);
  expect(await res.text()).toContain("JonVerk");
});

it("404s an unknown handbook slug", async () => {
  expect((await SELF.fetch("https://x.test/handbook/nope")).status).toBe(404);
  expect((await SELF.fetch("https://x.test/news/nope.md")).status).toBe(404);
});
```
If `SELF` does not route RR pages under the test harness (it may not, because `workers/app.ts` imports `virtual:react-router/server-build`), keep these tests for `/news/:slug.md` and `/handbook/nope.md` only and note in the commit message that HTML pages are verified by the `curl` checks in Step 6. Do not delete the assertion; move it.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/pages.test.ts`
Expected: FAIL (404/absent routes).

- [ ] **Step 3: Build the pages**

Route table in `app/routes.ts`: `index("routes/home.tsx")`, `route("news", "routes/news-index.tsx")`, `route("news/:slug", "routes/news-detail.tsx")`, `route("handbook", "routes/handbook-index.tsx")`, `route("handbook/:slug", "routes/handbook-detail.tsx")`, `route("org", "routes/org.tsx")`, `route("search", "routes/search.tsx")`. Loaders throw `new Response("Not found", { status: 404 })` for unknown slugs. Each page exports `meta` with title and description.

Visual direction: a serif display face for headings (e.g. `Fraunces` or `Newsreader`) against Inter for body, warm off-white paper and a deep ink in light mode, dimmed slate in dark; announcements as a dated timeline with a kind tag (`kudos` in a green tint, `milestone` in amber, `announcement` neutral); the handbook index as a dense two-column reference list with monospace `rule_id` chips; the handbook page as a single readable column with a "cite this" footer showing the canonical and `.md` URLs. No card grids, no gradients, no emoji.

- [ ] **Step 4: Add the org page**

`OrgChart.tsx` renders `<pre className="mermaid">{source}</pre>` server-side, plus a `<script type="module">` that imports mermaid from a CDN only when `navigator.onLine` and `matchMedia("(prefers-reduced-motion: no-preference)")` allow, calling `mermaid.run()`; on failure it leaves the `<pre>` untouched. The page also links `/org.md` and `/org.mmd`.

- [ ] **Step 5: Serve `/org.mmd` and run the type check**

Add the route in `workers/api/surfaces.ts` returning `text/plain` with `conditionalResponse`.
Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 6: Verify by running the dev server**

Run in one shell: `npm run dev`; in another:
```bash
curl -sS localhost:5173/ | grep -o "JonVerk" | head -1
curl -sS -o /dev/null -w "%{http_code}\n" localhost:5173/handbook/nope
curl -sS localhost:5173/llms.txt | head -5
```
Expected: `JonVerk`, `404`, a markdown index.

- [ ] **Step 7: Commit**

```bash
git add app
git commit -m "feat: newsfeed pages and visual design"
```

---

### Task 9: The `newsfeed` CLI

**Files:**
- Create: `cli/package.json`, `cli/tsconfig.json`, `cli/README.md`
- Create: `cli/src/client.ts`, `cli/src/commands.ts`, `cli/src/bin.ts`
- Test: `cli/test/client.test.ts`, `cli/test/commands.test.ts`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: the HTTP API from Tasks 4, 6, 7.
- Produces: `Client` class — `constructor(opts: { baseUrl: string; token: string; fetchImpl?: typeof fetch })`, methods `createPost(input: PostInput): Promise<Created>`, `publishPost(slug: string): Promise<void>`, `listPosts(opts: { since?: string; limit?: number }): Promise<FeedItem[]>`, `getPost(slug: string): Promise<PostDoc>`, `putRule(slug: string, input: RuleInput): Promise<RuleDoc>`, `supersede(slug: string, by: string): Promise<void>`, `search(q: string): Promise<SearchHit[]>`; plus a `run(argv: string[], io: { stdout: (s: string) => void; stderr: (s: string) => void; env: NodeJS.ProcessEnv }): Promise<number>` dispatcher.

- [ ] **Step 1: Write the failing tests**

`cli/test/commands.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import { run } from "../src/commands";

function io() {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, stdout: (s: string) => out.push(s), stderr: (s: string) => err.push(s) };
}

it("posts with a body file and prints the live and md urls", async () => {
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ slug: "hello", url: "/news/hello", md_url: "/news/hello.md" }), { status: 201 }));
  const out = io();
  const code = await run(["post", "Hello", "--body", "hi"], { ...out, env: { NEWSFEED_URL: "https://x.test", NEWSFEED_TOKEN: "t" }, fetchImpl });
  expect(code).toBe(0);
  expect(out.out.join("")).toContain("https://x.test/news/hello");
  expect(out.out.join("")).toContain("https://x.test/news/hello.md");
  expect(fetchImpl).toHaveBeenCalledWith("https://x.test/api/posts", expect.objectContaining({ method: "POST" }));
});

it("exits non-zero with the server message on failure", async () => {
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ message: "bad token", field: "authorization" }), { status: 401 }));
  const out = io();
  const code = await run(["post", "Hello", "--body", "hi"], { ...out, env: { NEWSFEED_URL: "https://x.test", NEWSFEED_TOKEN: "nope" }, fetchImpl });
  expect(code).toBe(1);
  expect(out.err.join("")).toContain("bad token");
});

it("refuses to run without a token", async () => {
  const out = io();
  const code = await run(["list"], { ...out, env: { NEWSFEED_URL: "https://x.test" } });
  expect(code).toBe(2);
  expect(out.err.join("")).toContain("NEWSFEED_TOKEN");
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run cli/test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the client, commands, and bin**

`Client` builds URLs from `baseUrl` (`https://newsfeed.jonverk.online` default), always sends `Authorization: Bearer <token>`, parses JSON, and throws `ApiError { status, message, field }` on non-2xx. `run` implements exactly: `post [title] (--body <text> | --body-file <path> | - ) [--kind] [--author] [--draft] [--json]`, `publish <slug>`, `list [--since] [--limit] [--json]`, `get <slug> [--json]`, `handbook set <slug> --file <path> --category <c> [--owner] [--title] [--json]`, `handbook supersede <slug> --by <RULE-ID>`, `search <query> [--json]`. Exit codes: `0` success, `1` API error, `2` usage/config error. `--json` prints the raw response.

- [ ] **Step 4: Wire the package**

`cli/package.json`: `"name": "@jonverk/newsfeed-cli"`, `"type": "module"`, `"bin": { "newsfeed": "dist/bin.js" }`, `"scripts": { "build": "tsc -p tsconfig.json", "prepare": "npm run build" }`, devDependency `typescript` reused from root. `cli/tsconfig.json`: `module: "NodeNext"`, `target: "ES2022"`, `outDir: "dist"`, `strict: true`. Add `cli/dist` to `.gitignore`. `cli/README.md` documents `npm i -g ./cli`, the two env vars, and the command list.

- [ ] **Step 5: Run the tests and the build**

Run: `npx vitest run cli/test && npm --prefix cli run build`
Expected: PASS, then `cli/dist/bin.js` exists.

- [ ] **Step 6: Commit**

```bash
git add cli .gitignore
git commit -m "feat: newsfeed cli"
```

---

### Task 10: Seed content, deploy, and verify live

**Files:**
- Create: `migrations/0002_seed.sql`
- Create: `docs/runbooks/newsfeed-deploy.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: everything above; `ORG.md` at `/home/newsfeed/newsfeed/ORG.md`.
- Produces: the live site with `ORG-001` and the first post.

- [ ] **Step 1: Write `migrations/0002_seed.sql`**

Insert `ORG-001` (`slug: org-chart`, category `org`, owner `Jon`, status `active`) whose `body_md` is exactly:

````
```mermaid
<paste the full fenced block from ORG.md, byte for byte>
```
````

Insert the placeholder post: slug `the-news-jonverk-newsfeed`, title `The news — JonVerk Newsfeed`, kind `announcement`, author `Jon`, status `published`, `published_at` equal to the migration's run date, body explaining what the site is, that announcements land here and in `/feed.json`, that the handbook is canon, and that this post is a placeholder to be replaced.

- [ ] **Step 2: Verify the seed parses and the app serves it locally**

Run: `npm run dev` in one shell, then:
```bash
curl -sS localhost:5173/org.md | head -20
curl -sS localhost:5173/llms.txt | head -20
```
Expected: the mermaid fence and an index naming Org chart and the placeholder post.

- [ ] **Step 3: Apply migrations and set the secret remotely**

```bash
npx wrangler d1 migrations apply DB --remote
openssl rand -hex 32   # NEWSFEED_TOKEN; store it, never commit it
npx wrangler secret put NEWSFEED_TOKEN
```
Expected: migrations apply cleanly; the secret uploads.

- [ ] **Step 4: Deploy**

Run: `npm run deploy`
Expected: `wrangler deploy` succeeds and prints the `newsfeed.jonverk.online` route.

- [ ] **Step 5: Verify the live site**

```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://newsfeed.jonverk.online/
curl -sS https://newsfeed.jonverk.online/llms.txt | head -20
curl -sS https://newsfeed.jonverk.online/feed.json | head -c 400
curl -sS -o /dev/null -w "%{http_code}\n" -X POST https://newsfeed.jonverk.online/api/posts -d '{"title":"x","body":"y"}'
curl -sS -H "Authorization: Bearer $NEWSFEED_TOKEN" https://newsfeed.jonverk.online/api/posts -d '{"title":"CLI smoke test","body":"posted by curl","draft":true}' -H "content-type: application/json"
```
Expected: `200`, an index, a feed, `401` for the anonymous write, `201` for the authenticated one. The smoke-test item is a draft, so it is invisible publicly; leave it (there is no delete endpoint in v1).

- [ ] **Step 6: Write the runbook and update the README**

`docs/runbooks/newsfeed-deploy.md`: how to rotate `NEWSFEED_TOKEN`, apply migrations, deploy, and where the CLI config lives. README: replace the template description with what the site is, the URL list (`/llms.txt` first), and `npm run dev | test | deploy`.

- [ ] **Step 7: Copy the plan to `PLAN.md` and commit**

```bash
cp docs/superpowers/plans/2026-10-24-newsfeed-plan.md PLAN.md
git add migrations/0002_seed.sql docs/runbooks README.md PLAN.md
git commit -m "feat: seed org rule and first post; deploy runbook"
```

---

## Self-review notes

- Spec coverage: intent/goals → Tasks 4–9; drafts → Tasks 2, 4, 5, 7; supersession and stable ids → Task 6; agent surfaces → Task 5; search → Task 7; org/mermaid → Tasks 5, 8, 10; CLI → Task 9; classy gate → deliberately out of scope (spec defers it); launch content → Task 10; `PLAN.md` → Task 10.
- The classy gate is not implemented by design. The seam exists because every public route passes through either the Hono `api` app or the React Router route table; adding middleware later is a single insertion point.
- Review Focus tests: oversized/empty input → Task 4; draft leakage → Tasks 2, 4, 5, 7; stale conditional GET → Task 3; raw HTML → Task 3; unknown slug → Task 8.
