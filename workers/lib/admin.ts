import { redirect } from "react-router";
import type { AppEnv } from "./env";
import { browserUser, PRIVATE_CACHE } from "./auth";
import { getPostForAdmin, getRuleForAdmin, getOrgRule, getTags, listProfiles, type Post, type Rule } from "./content";

export const adminHeaders = { "Cache-Control": PRIVATE_CACHE };
export type AdminSection = "news" | "rules" | "org" | "trash";
export type AdminListItem = {
  slug: string; title: string; status: string; deleted_at: string | null;
  updated_at: string; entity: "post" | "rule";
};
export type AdminData = {
  username: string; section: AdminSection; page: number; more: boolean; tags: string[]; selectedTags: string[]; profiles: {tag:string; body_md:string}[];
  items: AdminListItem[]; item: Post | Rule | null; editing: boolean; creating: boolean;
};

export async function requireAdmin(request: Request, env: AppEnv): Promise<string> {
  const username = await browserUser(request, env);
  if (!username) throw redirect("/login", { headers: adminHeaders });
  return username;
}

export async function loadAdmin(request: Request, env: AppEnv): Promise<AdminData> {
  const username = await requireAdmin(request, env);
  const url = new URL(request.url);
  if (url.pathname === "/admin/handbook" || url.pathname.startsWith("/admin/handbook/")) {
    throw redirect(url.pathname.replace(/^\/admin\/handbook/, "/admin/rules") + url.search, { status: 308, headers: adminHeaders });
  }
  const segments = url.pathname.replace(/^\/admin\/?/, "").split("/").filter(Boolean);
  if (!segments.length) throw redirect("/admin/news", { headers: adminHeaders });
  const section = segments[0];
  if (!["news", "rules", "org", "trash"].includes(section) || segments.length > 3) throw new Response("Not found", { status: 404, headers: adminHeaders });
  const page = Math.min(100000, Math.max(1, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1));
  const result: AdminData = { username, section: section as AdminSection, page, more: false, items: [], item: null, editing: false, creating: false, tags: [], selectedTags: [], profiles: [] };
  const db = env.DB;
  result.tags = (await db.prepare("SELECT name FROM tags ORDER BY name").all<{name:string}>()).results.map(row => row.name);
  result.profiles = await listProfiles(db);
  if (section === "org") {
    if (segments.length !== 1) throw new Response("Not found", { status: 404, headers: adminHeaders });
    result.item = await getOrgRule(db) as unknown as Rule | null;
    return result;
  }
  if (segments.length >= 2) {
    if (!(segments.length === 2 && segments[1] === "new") && !(segments.length === 3 && segments[2] === "edit")) throw new Response("Not found", { status: 404, headers: adminHeaders });
    if (section === "trash") throw new Response("Not found", { status: 404, headers: adminHeaders });
    result.editing = true;
    result.creating = segments.length === 2;
    if (!result.creating) {
      result.item = section === "news" ? await getPostForAdmin(db, segments[1]) : await getRuleForAdmin(db, segments[1]);
      result.selectedTags = await getTags(db, section === "news" ? "post" : "rule", segments[1]);
      if (!result.item || result.item.deleted_at) throw new Response("Not found", { status: 404, headers: adminHeaders });
      if (section === "rules") {
        const { slug, title, body_md, deleted_at } = result.item as Rule;
        result.item = { slug, title, body_md, deleted_at } as Rule;
      }
    }
    return result;
  }
  const sql = section === "news" ? `SELECT slug,title,status,deleted_at,updated_at,'post' AS entity FROM posts WHERE deleted_at IS NULL ORDER BY created_at DESC,id DESC`
    : section === "rules" ? `SELECT slug,title,status,deleted_at,updated_at,'rule' AS entity FROM rules WHERE deleted_at IS NULL ORDER BY title,slug`
    : `SELECT slug,title,status,deleted_at,updated_at,'post' AS entity FROM posts WHERE deleted_at IS NOT NULL
       UNION ALL SELECT slug,title,status,deleted_at,updated_at,'rule' AS entity FROM rules WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC,slug`;
  const { results } = await db.prepare(`${sql} LIMIT 26 OFFSET ?`).bind((page - 1) * 25).all<AdminListItem>();
  result.more = results.length > 25;
  result.items = results.slice(0, 25);
  return result;
}
