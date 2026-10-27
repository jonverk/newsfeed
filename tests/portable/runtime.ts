import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { api } from "../../workers/api/app";

// A real SQLite/FTS5 database behind the subset of D1 used by this application.
// Native Workers behavior is still verified by `npm test` outside restricted sandboxes.
class Statement {
  constructor(readonly db: DatabaseSync, readonly sql: string, readonly values: SQLInputValue[] = []) {}
  bind(...values: SQLInputValue[]) { return new Statement(this.db, this.sql, values); }
  async first(column?: string) {
    const row = this.db.prepare(this.sql).get(...this.values) ?? null;
    return column ? row?.[column] ?? null : row;
  }
  async all() {
    const results = this.db.prepare(this.sql).all(...this.values);
    return { results, success: true, meta: { changes: 0, last_row_id: 0 } };
  }
  async run() {
    const result = this.db.prepare(this.sql).run(...this.values);
    return { success: true, results: [], meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
  }
}

class SQLiteD1 {
  readonly sqlite = new DatabaseSync(":memory:");
  prepare(sql: string) { return new Statement(this.sqlite, sql); }
  async batch(statements: Statement[]) {
    this.sqlite.exec("BEGIN");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.sqlite.exec("COMMIT");
      return results;
    } catch (error) { this.sqlite.exec("ROLLBACK"); throw error; }
  }
}

const counts = new Map<string, { start: number; count: number }>();
export const env = {
  DB: new SQLiteD1(), NEWSFEED_TOKEN: "test-token", ADMIN_USERNAME: "jon", ADMIN_PASSWORD: "test-password",
  LOGIN_RATE_LIMITER: {
    async limit({ key }: { key: string }) {
      const now = Date.now();
      let counter = counts.get(key);
      if (!counter || now - counter.start >= 60000) { counter = { start: now, count: 0 }; counts.set(key, counter); }
      return { success: ++counter.count <= 5 };
    },
  },
};

export const executionCtx = { waitUntil: (_promise: Promise<unknown>) => {}, passThroughOnException: () => {}, props: {} };
export const SELF = {
  fetch(input: string | Request, init?: RequestInit) {
    return api.fetch(new Request(input, init), env, executionCtx);
  },
};

export async function applyD1Migrations(db: SQLiteD1, migrations: { name: string; queries: string[] }[]) {
  for (const migration of migrations) await db.batch(migration.queries.map((sql) => db.prepare(sql)));
}
