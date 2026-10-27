import { beforeAll } from "vitest";
import { applyD1Migrations, env } from "cloudflare:test";
import initSql from "../migrations/0001_init.sql?raw";
import adminSql from "../migrations/0004_browser_admin.sql?raw";

let applied = false;

export default async function setup() {
  if (applied) return;
  const queriesFor = (sql: string) => sql.replace(/--.*$/gm, "")
    .split(";")
    .map((q) => q.trim())
    .filter((q) => q.length > 0);

  try {
    await applyD1Migrations(env.DB, [
      { name: "0001_init.sql", queries: queriesFor(initSql) },
      { name: "0004_browser_admin.sql", queries: queriesFor(adminSql) },
    ]);
  } catch {
    // Fallback if applyD1Migrations is not supported in the test environment
    for (const q of [...queriesFor(initSql), ...queriesFor(adminSql)]) {
      await env.DB.prepare(q).run();
    }
  }
  applied = true;
}

beforeAll(async () => {
  await setup();
});

export { setup };

