import { beforeAll } from "vitest";
import { applyD1Migrations, env } from "cloudflare:test";
import initSql from "../migrations/0001_init.sql?raw";

let applied = false;

export default async function setup() {
  if (applied) return;
  const cleanSql = initSql.replace(/--.*$/gm, "");
  const queries = cleanSql
    .split(";")
    .map((q) => q.trim())
    .filter((q) => q.length > 0);

  try {
    await applyD1Migrations((env as any).DB, [{ name: "0001_init.sql", queries }]);
  } catch {
    // Fallback if applyD1Migrations is not supported in the test environment
    for (const q of queries) {
      await (env as any).DB.prepare(q).run();
    }
  }
  applied = true;
}

beforeAll(async () => {
  await setup();
});

export { setup };

