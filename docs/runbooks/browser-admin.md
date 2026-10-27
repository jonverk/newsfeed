# Browser administration (V2)

Open `https://newsfeed.jonverk.online/login` and log in with the configured administrator username and password. `/admin` opens the news list.

## Editing content

- **News:** add an entry, enter Markdown, then save a draft or publish. Open an existing title to edit it. Published edits take effect when saved. Editing keeps the same URL.
- **Operational Rules:** add or edit an entry and save. Category, owner, and effective date are editable; URLs and rule IDs remain stable. A new title that conflicts with an existing URL is rejected rather than replacing it.
- **Org chart:** download `org.md`, edit its Mermaid block, and upload the `.md` replacement. The file must be UTF-8 and at most 64 KiB. Export frontmatter is ignored on upload: the existing record's identity and metadata remain intact. Uploads update the same operational rule record used by `/org`, `/org.md`, and `/org.mmd`.
- **Trash:** moving an entry to trash hides it from all public pages, feeds, Markdown, and search. Restore returns it to its former publication status. IDs and URLs remain reserved. Restore a trashed org entry before uploading a replacement.

The editor accepts plain Markdown without a preview. No content is automatically cleaned up or designated authoritative during this upgrade. Existing placeholder text is left for the administrator to edit or trash.

## Local development

Copy `.dev.vars.example` to `.dev.vars` and replace the example values. Keep this file private and untracked. Apply local migrations, then start the development server:

```bash
npx wrangler d1 migrations apply DB --local
npm run dev
```

Use `http://localhost:5173/login`. Session cookies are `Secure`, `HttpOnly`, and `SameSite=Strict`; modern browsers permit Secure cookies on localhost. Use HTTPS when testing on another hostname.

## Production release

### Navigation and naming update

The navigation uses Newsfeed and Rules, with Operational Rules at `/rules` and its editor at `/admin/rules`. The former `/handbook` and `/faq` pages redirect to `/rules`; old admin bookmarks redirect to `/admin/rules`. The Projects link opens `https://projects.jonverk.online`.

This update needs no database migration or credential changes on a working V2 deployment. Run the checks below and deploy:

```bash
npm run typecheck
npm test
npm run test:portable
npm run deploy
```

Existing stored content, slugs, and rule IDs are preserved. Previously categorized FAQ entries appear alongside Core Rules. `/api/rules` is the browser API; `/api/handbook` and the old Markdown URLs remain compatibility aliases for existing clients. All generated canonical links use `/rules`.

### Initial V2 release

Use the existing Cloudflare account and D1 database. The new `LOGIN_RATE_LIMITER` binding allows approximately five attempts per minute per source IP at each Cloudflare location. Its namespace is reserved for this application's login limiter.

1. Run `npm test`, `npm run typecheck`, and `npm run build` in an environment that permits Miniflare's local listener. Run `npm run test:portable` for the SQLite/FTS5 API suite and production SSR checks when loopback listeners are restricted. The portable runner requires Node 24 and does not replace native Workers verification.
2. Check the remote migration list and record a pre-migration D1 Time Travel bookmark. Review the pre-existing `0003_correct_org_leadership.sql` if it is pending; it belongs to V1 content work, not the V2 schema change. Keep historical migrations intact.

```bash
npx wrangler d1 migrations list DB --remote
mkdir -p /tmp/newsfeed-backup
npx wrangler d1 time-travel info DB --json > /tmp/newsfeed-backup/before-v2-bookmark.json
cat /tmp/newsfeed-backup/before-v2-bookmark.json
```

Continue only after the Time Travel command succeeds and the saved JSON contains a bookmark. Time Travel records an existing recovery point; this JSON is not a standalone SQL backup and its bookmark is usable only within the database's recovery retention window. Do not run a restore as part of deployment.

The site's FTS5 virtual search table prevents a normal D1 SQL export. Keep the table intact and use the Time Travel recovery point for this migration. See [D1 export limitations](https://developers.cloudflare.com/d1/best-practices/import-export-data/#known-limitations) and [Time Travel documentation](https://developers.cloudflare.com/d1/reference/time-travel/).

```bash
npx wrangler d1 migrations apply DB --remote
```

3. Set credentials through interactive prompts. Choose a long, unique password; do not put credentials in source, command arguments, or chat. The existing `NEWSFEED_TOKEN` remains the CLI credential.

```bash
npx wrangler secret put ADMIN_USERNAME
npx wrangler secret put ADMIN_PASSWORD
```

4. Build and deploy using the existing Worker configuration:

```bash
npm run deploy
```

5. Verify login/logout, create a draft, edit and publish it, move it to trash, then restore it. Check the same changes in `/feed.json`, the Markdown twin, search, and LLM exports. Verify operational rule changes and org download/upload. Content saves require no deployment.

Monitor Worker request errors after release. Authentication never logs credentials. The admin pages and authenticated responses use `private, no-store`; public dynamic responses revalidate using `public, no-cache` and existing ETags.

**Rollback:** once trash has been used, do not roll back to an unmodified V1 Worker: it ignores `deleted_at` and would expose trashed content. Roll back only to a release retaining trash filtering, or disable administration and fix forward. Keep the additive schema in place.

## Credentials and sessions

There is one configured administrator, no registration, and no password-reset UI. Credentials are held in Worker secrets, following V1's shared-secret authentication model. The browser receives only a random session token; D1 stores its SHA-256 hash. Sessions expire after 24 hours. Logout revokes the current session.

To rotate credentials, pause browser administration by removing the password secret, clear sessions, then set the new username/password. Clearing sessions is also the way to log out every browser:

```bash
npx wrangler secret delete ADMIN_PASSWORD
npx wrangler d1 execute DB --remote --command 'DELETE FROM admin_sessions'
npx wrangler secret put ADMIN_USERNAME
npx wrangler secret put ADMIN_PASSWORD
```

Revoke all sessions when changing credentials; changing only the password does not invalidate already-issued sessions. CLI access remains independent through `NEWSFEED_TOKEN`.

## API additions

- `POST /api/auth/login`: JSON `{ username, password }`; requires same-origin `Origin`, sets the session cookie.
- `POST /api/auth/logout`: revokes the current session and clears its cookie; requires same-origin `Origin`.
- Existing write APIs accept either the browser session or `Authorization: Bearer …`. Cookie-authenticated mutations require a same-origin `Origin`; bearer clients retain their existing behavior.
- `DELETE /api/posts/:slug`, `DELETE /api/rules/:slug`: move an entry to trash.
- `POST /api/posts/:slug/restore`, `POST /api/rules/:slug/restore`: restore its previous publication state.
- `PUT /api/org`: multipart form data with one `file` field containing a `.md` replacement. JSON content-type headers must not be supplied for multipart uploads.
- `PUT /api/rules/:slug` with `If-None-Match: *`: create only; returns `409` when the slug is already reserved, including by trash.

Admin lists and editor data are protected React Router loaders under `/admin/*`. Private content is never added to public lists. Trashed direct URLs return `404`, including for bearer clients; use Trash to restore first.
