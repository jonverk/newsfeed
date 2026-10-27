export type EntityKind = "post" | "rule";

export function indexStatements(db: D1Database, kind: EntityKind, slug: string): D1PreparedStatement[] {
  const table = kind === "post" ? "posts" : "rules";
  const visible = kind === "post" ? "status = 'published'" : "status IN ('active','superseded')";
  return [
    db.prepare("DELETE FROM search_index WHERE kind = ? AND slug = ?").bind(kind, slug),
    db.prepare(`INSERT INTO search_index (kind,slug,title,body) SELECT ?,slug,title,body_md FROM ${table} WHERE slug = ? AND deleted_at IS NULL AND ${visible}`).bind(kind, slug),
  ];
}

export function revisionStatement(db: D1Database, kind: EntityKind, slug: string, actor: string, timestamp: string): D1PreparedStatement {
  const table = kind === "post" ? "posts" : "rules";
  return db.prepare(`INSERT INTO revisions (entity_type,entity_ref,title,body_md,saved_at,saved_by)
    SELECT ?,slug,title,body_md,?,? FROM ${table} WHERE slug = ?`).bind(kind, timestamp, actor, slug);
}

export function publicChange(db: D1Database, timestamp: string): D1PreparedStatement {
  return db.prepare("UPDATE content_state SET changed_at = ?, version = version + 1 WHERE id = 1").bind(timestamp);
}

export async function mutateContent(db: D1Database, kind: EntityKind, slug: string, actor: string, statement: D1PreparedStatement,
  options: { revision?: boolean; public?: boolean } = {}): Promise<void> {
  const timestamp = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  if (options.revision !== false) statements.push(revisionStatement(db, kind, slug, actor, timestamp));
  statements.push(statement, ...indexStatements(db, kind, slug));
  if (options.public !== false) statements.push(publicChange(db, timestamp));
  await db.batch(statements);
}
