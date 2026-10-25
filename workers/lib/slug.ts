export function slugify(input: string): string {
  let s = input
    .toString()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!s) s = "post";
  if (s.length > 80) s = s.slice(0, 80).replace(/-+$/g, "") || "post";
  return s;
}

export const PREFIX_BY_CATEGORY: Record<string, string> = {
  rules: "RULE",
  org: "ORG",
  logging: "LOG",
  verification: "VERIFY",
  process: "PROC",
  faq: "FAQ",
  other: "MISC",
};

export async function nextRuleId(db: D1Database, category: string): Promise<string> {
  const prefix = PREFIX_BY_CATEGORY[category] || "MISC";
  const { results } = await db
    .prepare("SELECT rule_id FROM rules WHERE rule_id LIKE ? ORDER BY rule_id DESC")
    .bind(prefix + "-%")
    .all();
  if (!results || results.length === 0) {
    return `${prefix}-001`;
  }
  // find max numeric suffix
  let max = 0;
  for (const r of results as any[]) {
    const m = String(r.rule_id).match(/-(\d+)$/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  const num = max + 1;
  return `${prefix}-${String(num).padStart(3, "0")}`;
}
