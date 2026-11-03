import type { PostKind, Category } from "./content";

const POST_KINDS: PostKind[] = ["announcement", "milestone", "kudos"];
const CATEGORIES: Category[] = ["rules", "org", "logging", "verification", "process", "faq", "other"];
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;
const RULE_ID_RE = /^[A-Z]{2,6}-\d{3}$/;

export type NewPost = {
  title: string;
  body: string;
  kind?: PostKind;
  slug?: string;
  author?: string;
  draft?: boolean;
};

export function validatePostInput(input: unknown): { ok: true; value: NewPost } | { ok: false; field: string; message: string } {
  if (typeof input !== "object" || input === null) {
    return { ok: false, field: "body", message: "Invalid body" };
  }
  const obj = input as any;
  const title = obj.title;
  if (typeof title !== "string" || title.trim() === "") {
    return { ok: false, field: "title", message: "title is required" };
  }
  if (/[\r\n]/.test(title)) {
    return { ok: false, field: "title", message: "newlines not allowed in title" };
  }
  if (title.length > 120) {
    return { ok: false, field: "title", message: "title too long" };
  }
  const body = obj.body;
  if (typeof body !== "string") {
    return { ok: false, field: "body", message: "body is required" };
  }
  if (new TextEncoder().encode(body).byteLength > 65536) {
    return { ok: false, field: "body", message: "body too large" };
  }
  if (obj.kind !== undefined) {
    if (!POST_KINDS.includes(obj.kind)) {
      return { ok: false, field: "kind", message: "invalid kind" };
    }
  }
  if (obj.slug !== undefined) {
    if (typeof obj.slug !== "string" || !SLUG_RE.test(obj.slug)) {
      return { ok: false, field: "slug", message: "invalid slug" };
    }
  }
  if (obj.draft !== undefined && typeof obj.draft !== "boolean") {
    return { ok: false, field: "draft", message: "invalid draft" };
  }
  if (obj.author !== undefined && (typeof obj.author !== "string" || obj.author.length > 120)) {
    return { ok: false, field: "author", message: "invalid author" };
  }
  return { ok: true, value: obj as NewPost };
}

export type NewRule = {
  title: string;
  body: string;
  category: Category;
  owner: string;
  rule_id?: string;
  effective_at?: string | null;
};

export function validateRuleInput(input: unknown): { ok: true; value: NewRule } | { ok: false; field: string; message: string } {
  if (typeof input !== "object" || input === null) {
    return { ok: false, field: "body", message: "Invalid body" };
  }
  const obj = input as any;
  const title = obj.title;
  if (typeof title !== "string" || title.trim() === "") {
    return { ok: false, field: "title", message: "title is required" };
  }
  if (/[\r\n]/.test(title)) {
    return { ok: false, field: "title", message: "newlines not allowed in title" };
  }
  if (title.length > 120) {
    return { ok: false, field: "title", message: "title too long" };
  }
  const body = obj.body;
  if (typeof body !== "string") {
    return { ok: false, field: "body", message: "body is required" };
  }
  if (new TextEncoder().encode(body).byteLength > 65536) {
    return { ok: false, field: "body", message: "body too large" };
  }
  return { ok: true, value: obj as NewRule };
}

export { SLUG_RE, RULE_ID_RE };
