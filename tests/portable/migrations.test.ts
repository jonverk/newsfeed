import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import schema from "../../migrations/0001_init.sql?raw";
import seed from "../../migrations/0002_seed.sql?raw";
import orgCorrection from "../../migrations/0003_correct_org_leadership.sql?raw";
import admin from "../../migrations/0004_browser_admin.sql?raw";

it("upgrades the complete V1 schema without altering its content or identifiers", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(schema); db.exec(seed); db.exec(orgCorrection);
    const posts = db.prepare("SELECT * FROM posts ORDER BY id").all();
    const rules = db.prepare("SELECT * FROM rules ORDER BY id").all();
    db.exec(admin);
    const upgradedPosts = db.prepare("SELECT * FROM posts ORDER BY id").all();
    const upgradedRules = db.prepare("SELECT * FROM rules ORDER BY id").all();
    expect(upgradedPosts).toEqual(posts.map((row) => ({ ...row, deleted_at: null })));
    expect(upgradedRules).toEqual(rules.map((row) => ({ ...row, deleted_at: null })));
    expect(db.prepare("SELECT COUNT(*) AS n FROM admin_sessions").get()).toMatchObject({ n: 0 });
    expect(db.prepare("SELECT version FROM content_state WHERE id=1").get()).toMatchObject({ version: 0 });
  } finally { db.close(); }
});
