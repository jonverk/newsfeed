# JonVerk Newsfeed & Operational Handbook

Live Production: [https://newsfeed.jonverk.online](https://newsfeed.jonverk.online)

The JonVerk Newsfeed is a full-stack, edge-deployed announcement feed, operational handbook, and FAQ designed for human operators, web browsers, and autonomous AI agents.

## Architecture

- **Runtime & Deployment**: Cloudflare Workers with SSR & static assets via `@cloudflare/vite-plugin`.
- **Database**: Cloudflare D1 (`d1-db-newsletter` / `39f557f4-a961-428d-814e-36bf90470ff9`) with SQLite FTS5 search index and automated revision tracking.
- **Backend API**: Hono framework mounted alongside React Router SSR.
- **Frontend UI**: React 19 + React Router v7 + Tailwind CSS with dark mode support.
- **Tooling**: Built and verified with `bun` and Vite+ (`vp`).

## Agent Surfaces & Public Feeds

- **JSON Feed 1.1**: [`/feed.json`](https://newsfeed.jonverk.online/feed.json)
- **LLM Context Files**: [`/llms.txt`](https://newsfeed.jonverk.online/llms.txt) and [`/llms-full.txt`](https://newsfeed.jonverk.online/llms-full.txt)
- **1:1 Markdown Twins**:
  - Announcements: `/news/:slug.md` (e.g. [`/news/the-news-jonverk-newsfeed.md`](https://newsfeed.jonverk.online/news/the-news-jonverk-newsfeed.md))
  - Handbook Rules: `/handbook/:slug.md` (e.g. [`/handbook/strict-logging-protocol.md`](https://newsfeed.jonverk.online/handbook/strict-logging-protocol.md))
  - Org Chart: [`/org.md`](https://newsfeed.jonverk.online/org.md) and [`/org.mmd`](https://newsfeed.jonverk.online/org.mmd)
- **Full-Text Search**: [`/api/search?q=<query>`](https://newsfeed.jonverk.online/api/search?q=logging) and web UI at [`/search`](https://newsfeed.jonverk.online/search).

## Handbook & FAQ

- Canonical rule identifiers follow `RULE-NNN` or `ORG-NNN`.
- In-place modifications append to the `revisions` audit log.
- Deprecated policies are explicitly superseded via the `/supersede` API endpoint and highlighted in the UI.

## Newsfeed CLI

Publish posts and manage handbook rules directly from your terminal:

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

Refer to [docs/runbooks/newsfeed-deploy.md](docs/runbooks/newsfeed-deploy.md) for detailed deployment steps, D1 migrations, and verification procedures.
