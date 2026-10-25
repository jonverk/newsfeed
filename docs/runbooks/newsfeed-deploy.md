# Newsfeed Deployment Runbook

This runbook covers how to develop, test, migrate, and deploy the JonVerk Newsfeed & Operational Handbook (`newsfeed.jonverk.online`).

## Prerequisites

- **Runtime**: Bun (`bun --version`) or Node.js via Vite+ (`vp`).
- **Cloudflare Credentials**: `CLOUDFLARE_API_TOKEN` exported in the environment.
- **Database**: Cloudflare D1 Database `d1-db-newsletter` (`39f557f4-a961-428d-814e-36bf90470ff9`).

## 1. Running Tests

```bash
# Backend unit & integration test suites
bun run test

# Type-check
bun run typecheck
```

## 2. Applying D1 Migrations

### Local (Miniflare / Dev)
```bash
npx wrangler d1 migrations apply DB --local
```

### Remote (Production)
```bash
npx wrangler d1 migrations apply DB --remote
```

## 3. Configuring Production Secrets

Write APIs require `NEWSFEED_TOKEN`:
```bash
# Upload secret to production worker
echo "<generated-secret>" | npx wrangler secret put NEWSFEED_TOKEN
```

## 4. Building and Deploying Worker

```bash
# Build React Router client & SSR bundles
bun run build

# Deploy to Cloudflare Workers
npx wrangler deploy
```

The worker is deployed to `https://newsfeed.jonverk.online` and `https://newsfeed.rin-btbj.workers.dev`.

## 5. Verification Checklist

Verify endpoints using curl:
```bash
# Public HTML pages
curl -I https://newsfeed.jonverk.online/
curl -I https://newsfeed.jonverk.online/news
curl -I https://newsfeed.jonverk.online/handbook
curl -I https://newsfeed.jonverk.online/faq
curl -I https://newsfeed.jonverk.online/org

# Agent feeds & markdown twins
curl -sS https://newsfeed.jonverk.online/feed.json
curl -sS https://newsfeed.jonverk.online/llms.txt
curl -sS https://newsfeed.jonverk.online/llms-full.txt
curl -sS https://newsfeed.jonverk.online/org.md
curl -sS https://newsfeed.jonverk.online/org.mmd

# Search API
curl -sS "https://newsfeed.jonverk.online/api/search?q=logging"

# Write Auth
curl -I -X POST https://newsfeed.jonverk.online/api/posts # Must return 401
```

## 6. Using the CLI

```bash
# Build the CLI
bun --cwd cli run build

# Set environment
export NEWSFEED_URL="https://newsfeed.jonverk.online"
export NEWSFEED_TOKEN="<token>"

# Publish
./cli/dist/bin.js post create post.md --title "Update" --kind announcement
```
