import type { Hono } from "hono";
import type { AppEnv } from "../lib/env";
import { requireToken, writer } from "../lib/auth";
import { mutateContent, type EntityKind } from "../lib/mutations";
import { getPostForAdmin, getRuleForAdmin } from "../lib/content";

export function registerTrashRoutes(app: Hono<{ Bindings: AppEnv }>, kind: EntityKind) {
  const table = kind === "post" ? "posts" : "rules";
  const load = kind === "post" ? getPostForAdmin : getRuleForAdmin;
  for (const restore of [false, true]) {
    app.on(restore ? "POST" : "DELETE", restore ? "/:slug/restore" : "/:slug", async (c) => {
      const auth = await requireToken(c.req.raw, c.env);
      if (auth) return auth;
      const slug = c.req.param("slug")!;
      const row = await load(c.env.DB, slug);
      if (!row) return c.json({ message: "Not found" }, 404);
      if (restore !== Boolean(row.deleted_at)) return c.json({ ok: true });
      const ts = new Date().toISOString();
      await mutateContent(c.env.DB, kind, slug, (await writer(c.req.raw, c.env))!,
        c.env.DB.prepare(`UPDATE ${table} SET deleted_at=?,updated_at=? WHERE slug=?`).bind(restore ? null : ts, ts, slug),
        { public: row.status !== "draft" });
      return c.json({ ok: true });
    });
  }
}
