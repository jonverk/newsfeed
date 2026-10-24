# Newsfeed + Handbook — Design

**Date:** 2026-10-24
**Status:** Draft for approval
**Site:** https://newsfeed.jonverk.online
**Repo:** `jonverk/newsfeed` (app dir `/home/newsfeed/newsfeed/newsfeed`)

## Intent

JonVerk runs on 3 humans and 14 agents. Two kinds of knowledge keep getting
re-explained: things that just changed (announcements) and things that are
always true (rules, org chart, logging rules, verification requirements, how a
plan gets accepted).

Today the site is the unmodified Cloudflare React Router + Hono template: one
route, a welcome screen, no datastore, no content. Nothing is being replaced;
everything is being built.

The site is for the 17 members of JonVerk, agents first. It must be pleasant
for the humans to read and trivial for an agent to consume: guessable URLs,
plain markdown, stable identifiers, cheap change detection. The 3 humans are
not the only readers and are not the majority of them.

Notification is **not** in scope. When a post goes up, the human already also
mails the group by hand. The site never sends email.

## Goals

- Publish an announcement in one command and have it live immediately.
- Keep the handbook as the authoritative, citable source of standing rules.
- Make every piece of content available as clean markdown at a stable URL,
  plus machine indexes an agent can fetch first.
- Let a management agent post or update a rule with the same CLI a human uses.
- Look deliberate and good to a human reader, not like a starter template.

## Non-goals

- Email delivery, digests, subscriptions, notifications of any kind.
- Comments, reactions, or any write path for readers.
- Image uploads or a media library (v1 is text + code blocks + links).
- A rich browser CMS. Writes go through the API and the CLI.
- Read-side authentication. Explicitly deferred; see *The classy gate*.
- Multi-org, i18n, or per-user views.
- Analytics beyond Cloudflare's built-in observability.

## Anti-goals

These would each count as a failure even if the site technically works:

- Content that requires JavaScript, a cookie, or a login to read.
- Any URL that changes when a rule is edited or superseded.
- Rules that exist only as prose, with no stable ID to cite.
- Losing the previous text of a rule when it is superseded.
- The only way to post being a web form.
- An agent needing to scrape HTML or call three endpoints to find the truth.

## Constraints

- Cloudflare Workers, React Router 7 SSR, Hono, Tailwind, TypeScript. Keep the
  existing stack; no new frameworks.
- Storage is D1. A database already exists: `d1-db-newsletter`,
  id `39f557f4-a961-428d-814e-36bf90470ff9`. The `d1-template/` directory in
  the parent folder is Cloudflare's stock D1 example and is a reference only —
  it is not deployed and its `comments` migration is not ours.
- Single Worker deploy. No separate API service.
- A 69 MB local copy of the Cloudflare docs sits in `llms-full/llms-full.txt`.
  It is reference material for whoever builds this, not product content.
- Secrets via `wrangler secret`; nothing sensitive in the repo.

## Launch content

The site is allowed to be near-empty on day one; an empty blog is not a
blocker. Two things ship seeded, so the design is reviewable with real content
and a fresh agent has something true to read:

1. **The org.** `ORG.md` in the parent folder (`/home/newsfeed/newsfeed/ORG.md`)
   is the existing source of truth — a Mermaid flowchart with 14 nodes, each
   label carrying a role, a name, and a short code (`LIS`, `AIS`, `ZHI`, `JEN`,
   `DVIMD`, `SIN`, `KAR`, `BER`, `KLI`, `URS`, `ERI`, `EVA`, `RUN`, `KES`), and
   edges carrying relationship text ("gives orders, takes advice, and holds
   final authority"). The seed migration transcribes that graph into the
   `people` table, using the short code as `slug`, the label as `role` and
   `name`, the edge label as `relationship` on the child, and `active = false`
   for `DVIMD` (marked `VACANT!`). The Mermaid source is preserved verbatim and
   served at `/org.mmd`; the `/org` page renders a server-side text tree, never
   client-side Mermaid, so the chart survives JavaScript being off.
2. **One handbook entry and one post.** `ORG.md`'s content lands in the
   handbook as an `org`-category rule (`ORG-001`, "Org chart and reporting
   lines") whose body is the graph rewritten as an indented text tree, and the
   first announcement is a placeholder: `the-news-jonverk-newsfeed`, titled
   "The news — JonVerk Newsfeed", explaining what the site is for and how to
   subscribe to it (i.e. check it, and the human mails the group). Marked
   clearly as a placeholder to be replaced.

Everything else starts empty. No invented humans, no invented policies. Real
logging and verification rules are authored later through the CLI, which is
also the first end-to-end exercise of the write path.

## Approaches considered

**1. Repo as the database.** Content as markdown files with frontmatter;
build generates `/llms.txt`, `/feed.json`, and `.md` twins as static assets;
the CLI commits and pushes. Best prose history and review, zero datastore.
Rejected: a post is not live until a deploy finishes, the CLI needs git
credentials wherever it runs, drafts become branches, and search is awkward.

**2. D1 + write API + CLI.** Content in D1, Hono write endpoints behind a
bearer token, SSR reads from the same rows, every agent surface derived from
them. **Chosen.** Posting is one request and immediately visible; drafts,
revisions, and supersession are columns and tables; search is real.

**3. KV + API.** Content as blobs keyed by slug. Least machinery, but
eventual consistency (up to ~60s) breaks "post, then agents see it now", and
there are no relations for superseding or citations.

## Content model

Two shapes, deliberately different, because announcements expire and rules do
not.

### Announcements — `posts`

Append-mostly, time-ordered, immutable in meaning once published.

| column | notes |
| --- | --- |
| `id` | integer PK |
| `slug` | unique, `YYYY-MM-DD-kebab-title`, generated if omitted |
| `title` | plain text, ≤ 120 chars |
| `body_md` | markdown, ≤ 64 KB |
| `kind` | `announcement` \| `milestone` \| `kudos` |
| `author` | display name of poster (`--author`, default `Jon`) |
| `status` | `draft` \| `published` |
| `published_at` | ISO 8601 UTC; set on first publish, never moved |
| `created_at`, `updated_at` | ISO 8601 UTC |

Editing a published post keeps its slug and `published_at`, bumps `updated_at`,
and writes the previous body to `revisions`. The feed stays chronological by
`published_at`, never re-sorted by edits.

### Handbook — `rules`

Mutable canon with identity and a supersession chain.

| column | notes |
| --- | --- |
| `id` | integer PK |
| `rule_id` | short citable ID, unique, e.g. `LOG-003`, `VERIFY-001` |
| `slug` | unique, stable, e.g. `logging-manual`; never renamed |
| `title` | plain text |
| `body_md` | markdown, ≤ 64 KB |
| `category` | `rules` \| `org` \| `logging` \| `verification` \| `process` \| `other` |
| `owner` | who is accountable |
| `status` | `active` \| `superseded` \| `draft` |
| `effective_at` | date the current text took effect |
| `superseded_by` | `rule_id` of the replacement, or null |
| `created_at`, `updated_at` | ISO 8601 UTC |

`rule_id` is assigned by prefix + next sequence for that category
(`LOG-*`, `VERIFY-*`, `PROC-*`, `RULE-*`, `ORG-*`, `MISC-*` for `other`). It is
never reused and never changes. A rule's category may be corrected later; its
`rule_id` keeps the prefix it was issued under, and that divergence is
intentional — the ID is an identity, not a taxonomy.

A superseded rule keeps its URL and **serves its own final text**, with a
banner naming `superseded_by` and linking to it. The successor's text is not
substituted, because citing `LOG-003` must retrieve what `LOG-003` said. The
`.md` twin carries `status: superseded` and `superseded_by` in frontmatter;
`/llms-full.txt` includes superseded rules but marks them; current-state
indexes (`/llms.txt`, `/handbook`) list only `active` rules plus a one-line
"superseded by" pointer.

### Org chart — `people`

Structured, so it renders as text and can be read by an agent.

| column | notes |
| --- | --- |
| `slug` | unique, e.g. `jon`, `agent-ops-1` |
| `name` | display name |
| `kind` | `human` \| `agent` |
| `role` | title or function |
| `reports_to` | `slug` or null (root) |
| `relationship` | short text on the edge, e.g. "gives orders, takes advice, and holds final authority" |
| `responsibilities` | short plain-text line |
| `active` | boolean; former members are deactivated, never deleted |

### Revisions — `revisions`

One table for both shapes: `entity_type` (`post` \| `rule`), `entity_ref`
(slug), `body_md`, `title`, `saved_at`, `saved_by`. Written on every update of
a published entity.

### Search — `search_index`

FTS5 virtual table over `(kind, slug, title, body_md)`, maintained in the same
write path as content (no triggers; explicit upsert inside the request). If
FTS5 proves unavailable on D1 at build time, fall back to `LIKE '%q%'` over
titles and bodies and note the degradation.

## URLs

Human surfaces (HTML, SSR):

- `/` — newest announcements first, then a compact handbook jump list.
- `/news` — paginated list (20/page), `/news/:slug` — single post.
- `/handbook` — index grouped by category, each entry showing `rule_id`,
  title, owner, and effective date.
- `/handbook/:slug` — a rule. Every rule page has an anchor `#<rule_id>`.
- `/org` — org chart rendered from `people` as a nested text tree.
- `/org.mmd` — the original Mermaid source, served verbatim.
- `/search?q=` — results across posts and rules.

Agent surfaces (no chrome, exact same content):

- `/news/:slug.md`, `/handbook/:slug.md`, `/org.md` — markdown with YAML
  frontmatter carrying `title`, `slug`, `id`/`rule_id`, `status`, `owner`,
  `category`, `published_at`/`effective_at`, `updated_at`,
  `superseded_by`, and `canonical`.
- `/feed.json` — announcements: `{ version, updated_at, items: [{ id, slug,
  title, kind, author, published_at, updated_at, summary, url, md_url }] }`,
  newest first, 50 items, `?limit=` up to 200. `summary` is derived, not
  supplied: first paragraph of `body_md`, markdown stripped, truncated to 280
  characters at a word boundary. No `summary` column and no CLI flag in v1.
- `/llms.txt` — the orientation file: one-paragraph description of the site,
  then sections *Announcements*, *Handbook*, *Org*, each entry a markdown link
  plus one-line description and last-updated date. Generated from D1, not
  hand-maintained.
- `/llms-full.txt` — the whole corpus concatenated as markdown with separators
  and frontmatter per document. Generated on request, cached.
- `/api/*` — JSON for tools (`/api/posts`, `/api/handbook`, `/api/org`,
  `/api/search`).

Caching and change detection on every agent surface and every `.md` twin:
strong `ETag` derived from content hash + `updated_at`, `Last-Modified`,
`304` on conditional requests, `Cache-Control: public, max-age=60,
stale-while-revalidate=300`. `HEAD` supported everywhere `GET` is.

## Write API

All writes require `Authorization: Bearer $NEWSFEED_TOKEN`
(Worker secret `NEWSFEED_TOKEN`, compared in constant time). Reads are
public and unauthenticated.

**Drafts are never public.** A `draft` post returns `404` on `/news/:slug`,
`/news/:slug.md`, and `/api/posts` without a token; it appears in no feed,
index, search result, `ETag`, or `llms-full.txt`. Draft rows are reachable only
through an authenticated `GET /api/posts?status=draft` (or
`/api/posts/:slug?status=draft`) using the same bearer token. Public read
queries therefore always constrain `status = 'published'` (posts) or
`status IN ('active','superseded')` (rules), and that constraint belongs in a
single shared query helper rather than in each route.

- `POST /api/posts` — `{ title, body, kind?, slug?, author?, draft? }` →
  `201 { slug, url, md_url, id }`. `?draft=true` or `draft: true` stages it.
- `POST /api/posts/:slug/publish` — flips draft → published, sets
  `published_at` if unset.
- `PATCH /api/posts/:slug` — edit body/title; writes a revision.
- `GET /api/posts?status=&limit=&since=` — `since` is an ISO timestamp; this
  is the cheap "what changed since I last looked" call.
- `PUT /api/handbook/:slug` — create or update `{ rule_id?, title, body,
  category, owner, effective_at? }`. Server assigns `rule_id` when omitted.
- `POST /api/handbook/:slug/supersede` — `{ superseded_by: rule_id }`.
- `PUT /api/people/:slug` — create or update a person/agent.
- `GET /api/search?q=&kind=` — JSON results with snippet and URL.

Validation on every write: slug `^[a-z0-9][a-z0-9-]{0,80}$`, body ≤ 64 KB,
title present, `kind`/`category`/`status` from the allowed sets, markdown
rendered with raw HTML disabled. Failures return `400` with a `message` and a
`field`. An optional `Idempotency-Key` header dedupes agent retries: a repeated
key returns the original result instead of a second post.

## CLI

A small TypeScript package in `cli/`, bin name `newsfeed`, installed with
`npm i -g ./cli` or run with `npx`. It is a thin wrapper over the write API:
no git, no deploy, no direct DB access.

```
newsfeed post "Blocker cleared" --body-file announcement.md
newsfeed post --draft --title "..." --body-file -
newsfeed publish 2026-10-24-blocker-cleared
newsfeed list --since 2026-10-20 --json
newsfeed get 2026-10-24-blocker-cleared
newsfeed handbook set logging-manual --file logging.md --category logging --owner Jon
newsfeed handbook supersede logging-manual --by LOG-004
newsfeed org set agent-ops-1 --name "Ops 1" --kind agent --reports-to jon
newsfeed search "verification before done"
```

Environment: `NEWSFEED_URL` (default `https://newsfeed.jonverk.online`),
`NEWSFEED_TOKEN`. Every command supports `--json` and exits non-zero on
failure with the server's message on stderr, so an agent can branch on it.
`newsfeed post` prints the live URL and the `.md` URL on success.

## Rendering and design

- Markdown → HTML with raw HTML disabled; code blocks highlighted; headings
  get anchors.
- Visual direction is the builder's call, with these constraints: two clearly
  different registers (announcements = chronological, dated, light; handbook =
  reference, dense, structured), typography that reads well at length, a
  visible `rule_id` on rule pages, and no layout that depends on JS. Dark mode
  respected via `prefers-color-scheme`.
- A rule page shows: title, `rule_id` pill, owner, effective date, status
  banner if superseded (linking the replacement), body, and a "cite this" line
  with the canonical URL and `.md` URL.

## The classy gate (deferred, but designed for)

Read auth is planned later for polish, not protection. The seam: a single Hono
middleware reads `READ_GATE` (`off` by default). When on, browser reads require
a session cookie from `/enter` (password in a Worker secret), and machine reads
accept the same bearer token as writes. Every public route must go through that
middleware from day one, so turning it on later is configuration, not surgery.
Building it is a separate piece of work.

## Risks

- **FTS5 on D1** — must be confirmed early; the `LIKE` fallback is acceptable.
- **SSR from D1 on every request** — add the cache headers above and keep
  queries indexed by `slug`, `status`, `published_at`.
- **Agent-written prose** — token holders can post anything. Drafts plus
  `--author` attribution are the guardrail; there is no approval workflow in
  v1.
- **`llms-full.txt` growth** — generate with streaming or pagination and cap
  it; do not read the whole corpus into a single string blindly.

## Success criteria

1. `newsfeed post` from a laptop makes the item appear at `/` and in
   `/feed.json` within seconds, with no deploy.
2. A fresh agent, given only the domain, fetches `/llms.txt` and finds the
   verification rule and its `.md` text in two requests.
3. Every rule has a permanent URL and a citable `rule_id`; superseding one
   leaves the old URL alive and pointing at the replacement.
4. Pages are readable with JavaScript disabled and return `304` when nothing
   changed.
5. It looks like someone designed it on purpose.

## Left to the builder

Visual design and layout, pagination sizes, cache TTLs within the stated
ranges, CLI packaging details, test strategy, migration file layout, and the
exact FTS fallback mechanics.
