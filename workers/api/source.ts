import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { AppEnv } from "../lib/env";
import { PRIVATE_CACHE, requireToken, writer } from "../lib/auth";
import { getPostForAdmin, getRuleForAdmin } from "../lib/content";
import { mutateContent, publicChange } from "../lib/mutations";
import { readMarkdownUpload } from "../lib/markdown-upload";
import { toMarkdownDocument } from "../lib/render";

export const source = new Hono<{Bindings: AppEnv}>();
source.use("*", async (c,next) => { const denied = await requireToken(c.req.raw,c.env); if (denied) return denied; await next(); });
source.use("*", bodyLimit({maxSize: 80*1024,onError:c => c.json({message:"Upload is too large",field:"file"},413)}));
source.get("/:kind/:id", async c => {
  const kind = c.req.param("kind"), id = c.req.param("id");
  if (kind === "agent") {
    const p = await c.env.DB.prepare("SELECT tag,body_md FROM agent_profiles WHERE tag=?").bind(id).first<{tag:string;body_md:string}>();
    if (!p) return c.json({message:"Not found"},404);
    return new Response(p.body_md, {headers:{"Content-Type":"text/markdown; charset=utf-8","Cache-Control":PRIVATE_CACHE}});
  }
  if (kind !== "post" && kind !== "rule") return c.json({message:"Not found"},404);
  const entry = kind === "post" ? await getPostForAdmin(c.env.DB,id) : await getRuleForAdmin(c.env.DB,id);
  if (!entry || entry.deleted_at) return c.json({message:"Not found"},404);
  return new Response(toMarkdownDocument({frontmatter:{title:entry.title,slug:entry.slug},body:entry.body_md}), {headers:{"Content-Type":"text/markdown; charset=utf-8","Cache-Control":PRIVATE_CACHE}});
});
source.put("/:kind/:id", async c => {
  const kind = c.req.param("kind"), id = c.req.param("id");
  if (!["post","rule","agent"].includes(kind)) return c.json({message:"Not found"},404);
  const parsed = await readMarkdownUpload(c.req.raw); if ("error" in parsed) return c.json({message:parsed.error,field:"file"},400);
  const timestamp = new Date().toISOString();
  if (kind === "agent") {
    if (!/^[A-Z]{3}$/.test(id) || !await c.env.DB.prepare("SELECT 1 FROM agent_profiles WHERE tag=?").bind(id).first()) return c.json({message:"Not found"},404);
    await c.env.DB.batch([c.env.DB.prepare("UPDATE agent_profiles SET body_md=? WHERE tag=?").bind(parsed.body,id),publicChange(c.env.DB,timestamp)]);
  } else {
    const entry = kind === "post" ? await getPostForAdmin(c.env.DB,id) : await getRuleForAdmin(c.env.DB,id);
    if (!entry || entry.deleted_at) return c.json({message:"Not found"},404);
    await mutateContent(c.env.DB,kind === "post" ? "post" : "rule",id,(await writer(c.req.raw,c.env))!,c.env.DB.prepare(`UPDATE ${kind === "post" ? "posts" : "rules"} SET body_md=?,updated_at=? WHERE slug=? AND deleted_at IS NULL`).bind(parsed.body,timestamp,id),{public:kind === "rule" || entry.status === "published"});
  }
  return c.json({ok:true});
});
