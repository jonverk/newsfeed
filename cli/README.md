# Newsfeed CLI

Command-line client and publishing interface for the JonVerk Newsfeed and Operational Rules.

## Installation

```bash
# Build locally
bun run --cwd cli build
# or run via bun/node
bun run cli/dist/bin.js --help
```

## Environment Variables

- `NEWSFEED_URL`: Target base URL (default: `https://newsfeed.jonverk.online`).
- `NEWSFEED_TOKEN`: Bearer token for write operations (`POST`, `PUT`).

## Commands

### Inspect Feed
```bash
newsfeed feed
newsfeed feed --json
```

### Search Content
```bash
newsfeed search "verification"
```

### Publish a News Entry or Milestone
```bash
newsfeed post create ./post.md --title "Q4 System Update" --kind milestone
```
Supports YAML frontmatter in markdown files:
```markdown
---
title: "Q4 System Update"
kind: "milestone"
slug: "q4-system-update"
---
Full content goes here...
```

### Update or Create an Operational Rule
```bash
newsfeed rule set rule-slug ./rule.md --title "Rule Title" --category logging --rule-id RULE-010
```

### Supersede a Rule
```bash
newsfeed rule supersede old-rule-slug RULE-011
```

### View Org Chart
```bash
newsfeed org
```
