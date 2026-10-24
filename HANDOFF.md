# Handoff — newsfeed build, context cleared 2026-10-24

You are picking this up cold. Everything below is what you cannot infer from the code.

## Where things stand

- Working dir / repo root: `/home/newsfeed/newsfeed/newsfeed` (remote `git@github.com:jonverk/newsfeed.git`).
- Live site https://newsfeed.jonverk.online is **still the stock React Router + Hono template**. Nothing built yet.
- Design approved, plan approved. Execution method: **subagent-driven via `agy`**.
- `PLAN.md` (repo root) is the human's copy; canonical plan is
  `docs/superpowers/plans/2026-10-24-newsfeed-plan.md`. Keep them identical.
- Spec: `docs/superpowers/specs/2026-10-24-newsfeed-design.md` (read it before implementing).
- Last commits: design `b06cfb6`, plan `361d400`, plus AGENTS.md-era logging commits.
- **Start at Task 1 of the plan.** No code from the plan exists yet.

## Environment facts (verified, don't re-derive)

- D1 database already exists: `d1-db-newsletter`, id `39f557f4-a961-428d-814e-36bf90470ff9`, **0 tables**.
- `d1-template/` (one level up, `/home/newsfeed/newsfeed/d1-template`) is Cloudflare's stock D1 sample with its own git repo. Reference only — do not deploy it.
- `llms-full/llms-full.txt` (one level up) is a 69 MB local dump of Cloudflare docs. Reference only.
- `ORG.md` (one level up, `/home/newsfeed/newsfeed/ORG.md`) is a **valid** fenced Mermaid block (line 1 ```` ```mermaid ````, line 34 closing fence). I once wrongly called it truncated — it renders. 14 nodes, no human/agent distinction anywhere, `DVIMD` marked `VACANT!`.
- `token.txt` at repo root was deleted by the user. Generate a fresh `NEWSFEED_TOKEN`.
- wrangler is **not** authenticated on this host (`wrangler whoami` → not authenticated); `CLOUDFLARE_API_TOKEN` lives in a project `.env` and the Cloudflare MCP works. Prefer the MCP/API token for remote ops if wrangler fights you.
- Package manager: **npm** (tracked `package-lock.json`). A stray untracked `bun.lock` exists — ignore it.
- OpenCode service runs in background; config hot-reloads. `opencode mcp list` should show `cloudflare-api` and `cloudflare-docs` connected.
- Installed: skill `antigravity-cli` (global, `~/.config/opencode/skills/antigravity-cli/SKILL.md`), superpowers plugin, `agy` 1.4.7 at `/home/newsfeed/.local/bin/agy`.

## Hard rules from AGENTS.md (project root)

1. After **every** finished task (or when blocked) create and **fill**:
   `mkdir -p logs; f="logs/NEWSFEED_$(date +%d%H%M).log"` with the four sections: work done + how verified, significant issues, ways to be assisted, verification-unit confirmation.
2. Verification unit = exactly this, prompt must start with `Review`:
   `agy -p 'Review this diff for bugs and security issues' --model 'Gemini 3.8 Flash (High)' --dangerously-skip-permissions`
   It only speaks when it objects. Silence = keep going.
3. Subagent = same, prompt must start with `Perform`, one exact task, model and flag identical.
4. Model string verified present: `gemini-3.8-flash-high` → `Gemini 3.8 Flash (High)`.

## Decisions already made (don't relitigate)

- Reads public, writes bearer-token. No email/notifications anywhere.
- Drafts are invisible everywhere public (404 + absent from feed/search/llms/full).
- Superseded rule serves **its own** last text with a banner + `superseded_by`; old text also in `revisions`.
- Org chart = one handbook rule (`ORG-001`) whose body is the Mermaid fence verbatim; `/org` shows source in `<pre>` and enhances with mermaid.js. No `people` table. No human/agent field anywhere.
- Rule id prefixes: `RULE/ORG/LOG/VERIFY/PROC/MISC` + `-NNN`, immutable, never reused; recategorising keeps the old prefix.
- `feed.json` summary is derived (first paragraph, stripped, 280 chars). No summary column, no CLI flag.
- No delete endpoint in v1. No browser CMS. No read auth (the "classy gate" is deliberately deferred).
- Markdown: `marked@18` + `highlight.js@11`, raw HTML escaped. Tests: `vitest@^4` + `@cloudflare/vitest-pool-workers@0.23`.
- Seed = `ORG-001` + placeholder post `the-news-jonverk-newsfeed`. Nothing else invented.

## Traps I already hit or spotted

- `workers/app.ts` imports `virtual:react-router/server-build`, which does **not** resolve under a plain wrangler/vitest-pool build. Plan handles this: test the Hono `api` app via `tests/worker.ts`, and verify HTML pages with `curl` against `npm run dev`. Don't waste an hour trying to make RR pages run under `SELF`.
- Log filenames are minute-resolution: two tasks in one minute collide. Overwrite; don't accumulate.
- Keep `PLAN.md` and the canonical plan in sync — I copied once and told the user to say if they edit the root copy.
- Don't `git add -A`: repo has untracked `.agents/`, `.hermes/`, `.allowlist`, `bun.lock`, `skills-lock.json`, `autonomous-ai-agents-antigravity-cli.md`. Stage specific paths.
- `git commit` needs `-c user.name=... -c user.email=...` or config may be missing; previous commits used `Jon <jon@jonverk.online>`.

## First moves

1. Read spec + plan Task 1.
2. Dispatch `agy -p 'Perform Task 1 of PLAN.md exactly …'` with the model/flag above, or do Task 1 inline — but always run the `Review` verification at the boundary.
3. Log the task either way.

## Open questions for the human (ask, don't assume)

- Install skill scope: currently global; project-local preferred? (One move.)
- Whether the antigravity skill's `Gemini 3.1 Pro (High)` example should be rewritten to `3.8 Flash (High)` for consistency.
- Whether they want the CLI published beyond `npm i -g ./cli`.
