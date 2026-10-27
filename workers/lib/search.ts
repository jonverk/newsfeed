import { getPublishedPost, getPostForAdmin, getRule } from "./content";

export type SearchHit = { kind: "post" | "rule"; slug: string; title: string; snippet: string; url: string; md_url: string };

export async function indexDocument(db: D1Database, doc: { kind: "post" | "rule"; slug: string; title: string; body: string }): Promise<void> {
  try {
    await db.prepare("DELETE FROM search_index WHERE slug = ? AND kind = ?").bind(doc.slug, doc.kind).run();
  } catch {}
  try {
    await db.prepare("INSERT INTO search_index (kind, slug, title, body) VALUES (?,?,?,?)").bind(doc.kind, doc.slug, doc.title, doc.body).run();
  } catch {}
}

export async function removeFromIndex(db: D1Database, kind: "post" | "rule", slug: string): Promise<void> {
  try {
    await db.prepare("DELETE FROM search_index WHERE slug = ? AND kind = ?").bind(slug, kind).run();
  } catch {}
}

export function sanitizeSnippet(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/&lt;mark&gt;/g, "<mark>")
    .replace(/&lt;\/mark&gt;/g, "</mark>");
}

export async function searchContent(db: D1Database, q: string, kind?: "post" | "rule"): Promise<SearchHit[]> {
  const query = (q || "").trim();
  if (!query) {
    return [];
  }
  if (query.length < 2) {
    // fallback to LIKE
    return fallbackSearch(db, query, kind);
  }
  try {
    const sanitized = query.replace(/[^a-zA-Z0-9\s]/g, " ").trim();
    if (!sanitized) return fallbackSearch(db, query, kind);
    const terms = sanitized.split(/\s+/).filter((t) => t.length > 0);
    if (terms.length === 0) return fallbackSearch(db, query, kind);
    const match = terms.map((t) => `"${t.replace(/"/g, '""')}"`).join(" AND ");
    let sql = `SELECT search_index.kind, search_index.slug, search_index.title, snippet(search_index, 3, '<mark>', '</mark>', '…', 24) as snippet
FROM search_index
JOIN (
  SELECT 'post' as kind, slug FROM posts WHERE deleted_at IS NULL AND status = 'published'
  UNION ALL
  SELECT 'rule' as kind, slug FROM rules WHERE deleted_at IS NULL AND status IN ('active', 'superseded')
) valid ON search_index.kind = valid.kind AND search_index.slug = valid.slug
WHERE search_index MATCH ?`;
    if (kind) sql += " AND search_index.kind = ?";
    sql += " LIMIT 20";

    const stmt = kind ? db.prepare(sql).bind(match, kind) : db.prepare(sql).bind(match);
    const { results } = await stmt.all();
    const hits: SearchHit[] = [];
    for (const r of (results || []) as any[]) {
      const url = r.kind === "post" ? `/news/${r.slug}` : `/rules/${r.slug}`;
      const md_url = `${url}.md`;
      hits.push({
        kind: r.kind,
        slug: r.slug,
        title: r.title,
        snippet: sanitizeSnippet(r.snippet || ""),
        url,
        md_url,
      });
    }
    return hits;
  } catch {
    return fallbackSearch(db, query, kind);
  }
}

async function fallbackSearch(db: D1Database, q: string, kind?: "post" | "rule"): Promise<SearchHit[]> {
  const query = (q || "").trim();
  const stripped = query.replace(/[%_\s\\]/g, "");
  if (!stripped) return [];

  const escaped = query.replace(/[\\%_]/g, "\\$&");
  const pattern = `%${escaped}%`;

  const hits: SearchHit[] = [];
  if (!kind || kind === "post") {
    const { results } = await db
      .prepare("SELECT slug, title, body_md FROM posts WHERE deleted_at IS NULL AND status = 'published' AND (title LIKE ? ESCAPE '\\' OR body_md LIKE ? ESCAPE '\\') LIMIT 20")
      .bind(pattern, pattern)
      .all();
    for (const r of (results || []) as any[]) {
      hits.push({ kind: "post", slug: r.slug, title: r.title, snippet: "", url: `/news/${r.slug}`, md_url: `/news/${r.slug}.md` });
    }
  }
  if (!kind || kind === "rule") {
    const { results } = await db
      .prepare("SELECT slug, title, body_md FROM rules WHERE deleted_at IS NULL AND status IN ('active','superseded') AND (title LIKE ? ESCAPE '\\' OR body_md LIKE ? ESCAPE '\\') LIMIT 20")
      .bind(pattern, pattern)
      .all();
    for (const r of (results || []) as any[]) {
      hits.push({ kind: "rule", slug: r.slug, title: r.title, snippet: "", url: `/rules/${r.slug}`, md_url: `/rules/${r.slug}.md` });
    }
  }
  return hits;
}
