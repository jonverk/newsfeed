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

it("extracts a trashed chart and removes inactive rules without changing news", async () => {
  const trim = (await import("../../migrations/0005_trim_content.sql?raw")).default;
  const v3 = (await import("../../migrations/0006_agent_context.sql?raw")).default;
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(schema); db.exec(seed); db.exec(orgCorrection); db.exec(admin); db.exec(trim);
    db.exec("UPDATE rules SET deleted_at=CURRENT_TIMESTAMP WHERE slug='org-chart'");
    const chart = db.prepare("SELECT title,body_md FROM rules WHERE slug='org-chart'").get();
    const posts = db.prepare("SELECT * FROM posts ORDER BY id").all();
    const active = db.prepare("SELECT slug,body_md FROM rules WHERE status='active' AND slug <> 'org-chart' AND rule_id <> 'ORG-001' ORDER BY slug").all();
    db.exec(v3);
    expect(db.prepare("SELECT title,body_md FROM org_chart WHERE id=1").get()).toEqual(chart);
    expect(db.prepare("SELECT * FROM posts ORDER BY id").all()).toEqual(posts);
    expect(db.prepare("SELECT slug,body_md FROM rules ORDER BY slug").all()).toEqual(active);
    expect(db.prepare("SELECT count(*) AS n FROM tags").get()).toMatchObject({n:0});
    expect(db.prepare("SELECT tag FROM agent_profiles WHERE tag='URS'").get()).toMatchObject({tag:'URS'});
    expect(db.prepare("SELECT body_md FROM agent_profiles WHERE tag='SIN'").get()).toMatchObject({body_md: expect.stringContaining("orchestration of work")});
  } finally { db.close(); }
});

it("retired migration 0005 leaves all existing content untouched", async () => {
  const trim = (await import("../../migrations/0005_trim_content.sql?raw")).default;
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(schema); db.exec(seed); db.exec(orgCorrection); db.exec(admin);
    const before = [db.prepare("SELECT * FROM rules ORDER BY id").all(), db.prepare("SELECT * FROM posts ORDER BY id").all(), db.prepare("SELECT * FROM search_index ORDER BY rowid").all()];
    db.exec(trim);
    const after = [db.prepare("SELECT * FROM rules ORDER BY id").all(), db.prepare("SELECT * FROM posts ORDER BY id").all(), db.prepare("SELECT * FROM search_index ORDER BY rowid").all()];
    expect(after).toEqual(before);
  } finally { db.close(); }
});
