import { getPublishedPost, getPostForAdmin, getRule } from "./content";

export type SearchHit = { kind: "post" | "rule"; slug: string; title: string; snippet: string; url: string; md_url: string };

export async function indexDocument(db: D1Database, doc: { kind: "post" | "rule"; slug: string; title: string; body: string }): Promise<void> {
  try {
    await db.prepare("DELETE FROM search_index WHERE slug = ?").bind(doc.slug).run();
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

export async function searchContent(db: D1Database, q: string, kind?: "post" | "rule"): Promise<SearchHit[]> {
  const query = (q || "").trim();
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
    let sql = `SELECT kind, slug, title, snippet(search_index, 3, '<mark>', '</mark>', '…', 24) as snippet FROM search_index WHERE search_index MATCH ?`;
    if (kind) sql += " AND kind = ?";
    const stmt = kind ? db.prepare(sql).bind(match, kind) : db.prepare(sql).bind(match);
    const { results } = await stmt.all();
    const hits: SearchHit[] = [];
    for (const r of (results || []) as any[]) {
      if (r.kind === "post") {
        const p = await getPublishedPost(db, r.slug);
        if (!p) continue;
        hits.push({ kind: "post", slug: r.slug, title: r.title, snippet: r.snippet || "", url: `/news/${r.slug}`, md_url: `/news/${r.slug}.md` });
      } else if (r.kind === "rule") {
        const rule = await getRule(db, r.slug);
        if (!rule || rule.status === "draft") continue;
        hits.push({ kind: "rule", slug: r.slug, title: rule.title, snippet: r.snippet || "", url: `/handbook/${r.slug}`, md_url: `/handbook/${r.slug}.md` });
      }
    }
    return hits;
  } catch {
    return fallbackSearch(db, query, kind);
  }
}

async function fallbackSearch(db: D1Database, q: string, kind?: "post" | "rule"): Promise<SearchHit[]> {
  const hits: SearchHit[] = [];
  if (!kind || kind === "post") {
    const { results } = await db.prepare("SELECT slug, title, body_md FROM posts WHERE status = 'published' AND (title LIKE ? OR body_md LIKE ?) LIMIT 20").bind(`%${q}%`, `%${q}%`).all();
    for (const r of (results || []) as any[]) {
      hits.push({ kind: "post", slug: r.slug, title: r.title, snippet: "", url: `/news/${r.slug}`, md_url: `/news/${r.slug}.md` });
    }
  }
  if (!kind || kind === "rule") {
    const { results } = await db.prepare("SELECT slug, title, body_md FROM rules WHERE status IN ('active','superseded') AND (title LIKE ? OR body_md LIKE ?) LIMIT 20").bind(`%${q}%`, `%${q}%`).all();
    for (const r of (results || []) as any[]) {
      hits.push({ kind: "rule", slug: r.slug, title: r.title, snippet: "", url: `/handbook/${r.slug}`, md_url: `/handbook/${r.slug}.md` });
    }
  }
  return hits;
}
