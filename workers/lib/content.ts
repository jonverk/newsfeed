export type PostKind = "announcement" | "milestone" | "kudos";
export type Category = "rules" | "org" | "logging" | "verification" | "process" | "faq" | "other";
export type PostStatus = "draft" | "published";
export type RuleStatus = "active" | "superseded" | "draft";

export type Post = {
  deleted_at: string | null;
  id: number;
  slug: string;
  title: string;
  body_md: string;
  kind: PostKind;
  author: string;
  status: PostStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Rule = {
  deleted_at: string | null;
  id: number;
  rule_id: string;
  slug: string;
  title: string;
  body_md: string;
  category: Category;
  owner: string;
  status: RuleStatus;
  effective_at: string | null;
  superseded_by: string | null;
  created_at: string;
  updated_at: string;
};

const POST_COLS = "id, slug, title, body_md, kind, author, status, published_at, created_at, updated_at, deleted_at";
const RULE_COLS = "id, rule_id, slug, title, body_md, category, owner, status, effective_at, superseded_by, created_at, updated_at, deleted_at";

export async function listPublishedPosts(db: D1Database, opts?: { limit?: number; offset?: number }): Promise<Post[]> {
  const limit = Math.min(opts?.limit ?? 20, 200);
  const offset = opts?.offset ?? 0;
  const { results } = await db
    .prepare(`SELECT ${POST_COLS} FROM posts WHERE deleted_at IS NULL AND status = 'published' ORDER BY published_at DESC LIMIT ? OFFSET ?`)
    .bind(limit, offset)
    .all();
  return (results || []) as Post[];
}

export async function getPublishedPost(db: D1Database, slug: string): Promise<Post | null> {
  const { results } = await db
    .prepare(`SELECT ${POST_COLS} FROM posts WHERE slug = ? AND deleted_at IS NULL AND status = 'published'`)
    .bind(slug)
    .all();
  return (results && results[0]) ? (results[0] as Post) : null;
}

export async function getPostForAdmin(db: D1Database, slug: string): Promise<Post | null> {
  const { results } = await db
    .prepare(`SELECT ${POST_COLS} FROM posts WHERE slug = ?`)
    .bind(slug)
    .all();
  return (results && results[0]) ? (results[0] as Post) : null;
}

export async function listRules(db: D1Database, opts?: { statuses?: Array<"active" | "superseded"> }): Promise<Rule[]> {
  const statuses = opts?.statuses ?? ["active", "superseded"];
  if (statuses.length === 0) return [];
  const placeholders = statuses.map(() => "?").join(",");
  const { results } = await db
    .prepare(`SELECT ${RULE_COLS} FROM rules WHERE deleted_at IS NULL AND status IN (${placeholders}) ORDER BY category, rule_id`)
    .bind(...statuses)
    .all();
  return (results || []) as Rule[];
}

export async function getRule(db: D1Database, slug: string): Promise<Rule | null> {
  const { results } = await db
    .prepare(`SELECT ${RULE_COLS} FROM rules WHERE slug = ? AND deleted_at IS NULL AND status IN ('active','superseded')`)
    .bind(slug)
    .all();
  return (results && results[0]) ? (results[0] as Rule) : null;
}

export async function getRuleById(db: D1Database, rule_id: string): Promise<Rule | null> {
  const { results } = await db
    .prepare(`SELECT ${RULE_COLS} FROM rules WHERE rule_id = ? AND deleted_at IS NULL AND status IN ('active','superseded')`)
    .bind(rule_id)
    .all();
  return (results && results[0]) ? (results[0] as Rule) : null;
}

export async function getRuleForAdmin(db: D1Database, slug: string): Promise<Rule | null> {
  return db.prepare(`SELECT ${RULE_COLS} FROM rules WHERE slug = ?`).bind(slug).first<Rule>();
}

export async function getOrgRule(db: D1Database): Promise<Rule | null> {
  return db.prepare(`SELECT ${RULE_COLS} FROM rules
    WHERE (slug = 'org-chart' OR rule_id = 'ORG-001') AND deleted_at IS NULL AND status IN ('active','superseded')
    ORDER BY CASE WHEN slug = 'org-chart' THEN 0 ELSE 1 END LIMIT 1`).first<Rule>();
}

export async function getPublicState(db: D1Database): Promise<{ changed_at: string; version: number }> {
  return (await db.prepare("SELECT changed_at, version FROM content_state WHERE id = 1").first<{ changed_at: string; version: number }>())!;
}
