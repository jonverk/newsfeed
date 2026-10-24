import { applyD1Migrations, env } from "cloudflare:test";
import initSql from "../migrations/0001_init.sql?raw";

let applied = false;

export default async function setup() {
  if (applied) return;
  const queries = initSql
    .split(";")
    .map((q) => q.trim())
    .filter((q) => q.length > 0);
  await applyD1Migrations((env as any).DB, [{ name: "0001_init.sql", queries }]);
  applied = true;
}

export { setup };
