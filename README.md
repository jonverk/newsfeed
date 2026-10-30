# JonVerk Newsfeed & Operational Rules

Live Production: [https://newsfeed.jonverk.online](https://newsfeed.jonverk.online)

The JonVerk Newsfeed is a full-stack, edge-deployed newsfeed and operational rules site designed for human operators, web browsers, and autonomous AI agents.

## Architecture

- **Runtime & Deployment**: Cloudflare Workers with SSR & static assets via `@cloudflare/vite-plugin`.
- **Database**: Cloudflare D1 (`d1-db-newsletter` / `39f557f4-a961-428d-814e-36bf90470ff9`) with SQLite FTS5 search index and automated revision tracking.
- **Backend API**: Hono framework mounted alongside React Router SSR.
- **Frontend UI**: React 19 + React Router v7 + Tailwind CSS with dark mode support.
- **Tooling**: Built and verified with `bun` and Vite+ (`vp`).

## Browser administration (V2)

Log in at [`/login`](https://newsfeed.jonverk.online/login) to manage news, operational rules, and org uploads at `/admin`. The editor uses plain Markdown without a preview. News supports drafts and publishing; operational rules and org saves take effect immediately. Deleted entries move into private trash and can be restored.

One administrator is configured through the `ADMIN_USERNAME` and `ADMIN_PASSWORD` Worker secrets. Existing CLI access through `NEWSFEED_TOKEN` continues to work. See [browser administration setup and release instructions](docs/runbooks/browser-admin.md), including migration, credential rotation, verification, and rollback requirements.

The upgrade preserves the existing placeholder content. It does not make that text authoritative or apply its instructions as policy.

The public navigation is **Newsfeed**, **Rules**, **Org**, **Projects**, **Search**, and **Log in**. Operational Rules live at `/rules`; `/handbook` and `/faq` redirect there. Rule pages and Markdown exports use `/rules/:slug` and `/rules/:slug.md`. Existing Markdown and write API clients retain their compatibility aliases. Projects links to `https://projects.jonverk.online`.

## Agent Surfaces & Public Feeds

- **JSON Feed 1.1**: [`/feed.json`](https://newsfeed.jonverk.online/feed.json)
- **LLM Context Files**: [`/llms.txt`](https://newsfeed.jonverk.online/llms.txt) and [`/llms-full.txt`](https://newsfeed.jonverk.online/llms-full.txt)
- **1:1 Markdown Twins**:
  - Newsfeed: `/news/:slug.md` (e.g. [`/news/the-news-jonverk-newsfeed.md`](https://newsfeed.jonverk.online/news/the-news-jonverk-newsfeed.md))
  - Operational Rules: `/rules/:slug.md` (e.g. [`/rules/strict-logging-protocol.md`](https://newsfeed.jonverk.online/rules/strict-logging-protocol.md))
  - Org Chart: [`/org.md`](https://newsfeed.jonverk.online/org.md) and [`/org.mmd`](https://newsfeed.jonverk.online/org.mmd)
- **Full-Text Search**: [`/api/search?q=<query>`](https://newsfeed.jonverk.online/api/search?q=logging) and web UI at [`/search`](https://newsfeed.jonverk.online/search).

## Operational Rules

- Canonical rule identifiers follow `RULE-NNN` or `ORG-NNN`.
- In-place modifications append to the `revisions` audit log.
- Deprecated policies are explicitly superseded via the `/supersede` API endpoint and highlighted in the UI.

## Newsfeed CLI

Publish posts and manage operational rules directly from your terminal:

```bash
# Build CLI
bun --cwd cli run build

# View feed
./cli/dist/bin.js feed

# Search
./cli/dist/bin.js search "protocol"

# Create announcement (requires NEWSFEED_TOKEN)
export NEWSFEED_TOKEN="<token>"
./cli/dist/bin.js post create ./announcement.md --kind milestone
```

See [cli/README.md](cli/README.md) for full CLI documentation.

## Deployment & Operations

Refer to [docs/runbooks/newsfeed-deploy.md](docs/runbooks/newsfeed-deploy.md) for comprehensive deployment steps, D1 migrations, and verification procedures.
