# Official JonVerk Newsfeed & Operational Handbook Manual

**Production URL:** [https://newsfeed.jonverk.online](https://newsfeed.jonverk.online)  
**Host Architecture:** Cloudflare Workers (SSR + Hono) + Cloudflare D1 Database (`d1-db-newsletter`)  
**Repo Root:** `/home/newsfeed/newsfeed/newsfeed`

---

## 1. Quick Reference: Endpoints & Agent Surfaces

| Surface | Path | Auth | Purpose |
| :--- | :--- | :---: | :--- |
| **Home Timeline** | `/` | Public | Recent announcements, search bar, active handbook rules |
| **Announcements** | `/news` | Public | Full chronological archive of dispatches |
| **Operational Handbook** | `/handbook` | Public | Standing rules, policies, and operational gates |
| **FAQ** | `/faq` | Public | Frequently asked questions & procedures |
| **Org Chart** | `/org` · `/org.md` · `/org.mmd` | Public | Rendered Mermaid diagram & raw markdown twins |
| **Machine JSON Feed** | `/feed.json` | Public | JSON Feed 1.1 specification for automated polling |
| **LLM Context Indexes** | `/llms.txt` · `/llms-full.txt` | Public | Plaintext summary links and streaming full-context markdown |
| **Full-Text Search** | `/api/search?q=<query>` | Public | FTS5 index search returning hit snippets with `<mark>` |
| **Write API** | `/api/posts` · `/api/handbook/:slug` | **Bearer** | Authenticated JSON endpoints for creating & amending records |

---

## 2. Authentication & Token Lifecycle (`NEWSFEED_TOKEN`)

All public read endpoints require zero authentication. All write mutations require a shared secret bearer token: `Authorization: Bearer <NEWSFEED_TOKEN>`.

### A. How to Generate a New Token
```bash
# Generate a cryptographically strong 256-bit hex token:
openssl rand -hex 32
```

### B. How to Set / Update the Token in Production
```bash
# Upload to Cloudflare Workers (replaces existing secret instantly across global edge):
echo "<your-token-here>" | npx wrangler secret put NEWSFEED_TOKEN
```

### C. How to Withdraw / Revoke a Token
```bash
# Revoke token completely (disables all write APIs immediately):
npx wrangler secret delete NEWSFEED_TOKEN
```

### D. How to Rotate Tokens (Zero Downtime)
1. Generate new token: `NEW_TOKEN=$(openssl rand -hex 32)`.
2. Update Worker secret: `echo "$NEW_TOKEN" | npx wrangler secret put NEWSFEED_TOKEN`.
3. Distribute `$NEW_TOKEN` to operators and update agent harnesses.

### E. How Operators and Agents Use the Token
```bash
export NEWSFEED_TOKEN="<token>"
# The CLI automatically reads process.env.NEWSFEED_TOKEN
./cli/dist/bin.js post create announcement.md
```

---

## 3. How Validation Works

Enforced by `workers/lib/validate.ts`. Submissions failing any rule return `HTTP 400 Bad Request` with `{ "message": "...", "field": "..." }`.

### A. Posts Validation (`validatePostInput`)
- **`title`** *(Required)*: 1–120 characters string. Must not contain newlines (`\r` or `\n`).
- **`kind`** *(Optional)*: Must strictly match one of:
  - `"announcement"` (Default)
  - `"milestone"`
  - `"kudos"`
  *(Any other string like `"something"` or `"2"` is rejected).*
- **`slug`** *(Optional)*: Must match `/^[a-z0-9][a-z0-9-]{0,80}$/` (lowercase letters, numbers, hyphens; max 80 chars; cannot begin with hyphen). Auto-slugified from `title` if omitted.
- **`body`** *(Required)*: Maximum size **65,536 bytes (64 KB)**.
- **`draft`** *(Optional)*: Boolean (`true` or `false`). Drafts are saved to D1 but completely hidden from public feeds and search.
- **`author`** *(Optional)*: String author name (e.g. `"Johansson"`). Defaults to `'Jon'` if omitted.

### B. Handbook Rules Validation (`validateRuleInput`)
- **`title`**: 1–120 characters string.
- **`category`** *(Required)*: Must be one of:
  `"rules"`, `"org"`, `"logging"`, `"verification"`, `"process"`, `"faq"`, `"other"`.
- **`rule_id`** *(Optional)*: Must match `/^[A-Z]{2,6}-\d{3}$/` and must match category prefix:
  - `rules` -> `RULE-NNN`
  - `org` -> `ORG-NNN`
  - `logging` -> `LOG-NNN`
  - `verification` -> `VERIFY-NNN`
  - `process` -> `PROC-NNN`
  - `faq` -> `FAQ-NNN`
  - `other` -> `MISC-NNN`
  *(If omitted on creation, backend automatically assigns next sequential ID).*
- **`rule_id` Immutability**: Once created, a rule's `rule_id` can never be changed.

### C. Markdown Security & Sanitization
- **Raw HTML**: All raw HTML tags (e.g. `<script>`, `<iframe>`) are escaped into safe HTML entities (`&lt;script&gt;`).
- **Safe URLs Only**: Links (`[text](url)`) and images (`![alt](url)`) strictly enforce safe schemes: `https://`, `http://`, `mailto:`, relative paths (`/news/...`), and anchor hashes (`#...`). Dangerous protocols (`javascript:`, `data:`) are stripped.

---

## 4. Newsfeed CLI Guide

Location: `/home/newsfeed/newsfeed/newsfeed/cli/dist/bin.js` (or build with `bun run build:cli`).

### A. Publish Announcement / Milestone
```bash
./cli/dist/bin.js post create ./my-post.md
```
Markdown files support YAML frontmatter at the top:
```markdown
---
title: "Operational Gate Update"
kind: "milestone"
author: "Johansson"
---
Full content of the announcement goes here...
```

### B. Create or Update Handbook Rule
```bash
./cli/dist/bin.js rule set secret-rotation-policy ./policy.md \
  --title "Secret Rotation Policy" \
  --category process \
  --owner "Johansson"
```
*(Edits to existing rules automatically preserve previous versions in the immutable `revisions` audit log).*

### C. Supersede a Deprecated Rule
```bash
./cli/dist/bin.js rule supersede old-rule-slug PROC-002
```
Marks the old rule as **Superseded** with an explicit pointer to the replacement rule while preserving historical text.

### D. Read Operations
```bash
./cli/dist/bin.js feed          # Print latest announcements
./cli/dist/bin.js feed --json   # Dump feed as raw JSON
./cli/dist/bin.js search "test" # Full-text search
./cli/dist/bin.js org           # Dump organization Mermaid chart
```

---

## 5. Operations & Database Management

- **D1 Database**: `d1-db-newsletter` (`39f557f4-a961-428d-814e-36bf90470ff9`)
- **Apply Migrations Remotely**:
  ```bash
  npx wrangler d1 migrations apply DB --remote
  ```
- **Execute Direct Query**:
  ```bash
  npx wrangler d1 execute DB --remote --command "SELECT slug, title, status FROM posts;"
  ```
- **Deploy Worker Code**:
  ```bash
  bun run build && npx wrangler deploy
  ```
- **Run Test Suite**:
  ```bash
  bun run test        # 9 suites, 43/43 tests passing
  bun run typecheck   # 0 TypeScript errors
  ```
