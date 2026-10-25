import { SELF, env } from "cloudflare:test";
import { expect, it } from "vitest";
import { nextRuleId } from "../workers/lib/slug";

const auth = { authorization: "Bearer test-token", "content-type": "application/json" };

it("assigns sequential prefixed rule ids per category", async () => {
  expect(await nextRuleId(env.DB, "logging")).toBe("LOG-001");
  await SELF.fetch("https://x.test/api/handbook/logging-manual", { method: "PUT", headers: auth, body: JSON.stringify({ title: "Logging", body: "log", category: "logging", owner: "Jon" }) });
  expect(await nextRuleId(env.DB, "logging")).toBe("LOG-002");
  expect(await nextRuleId(env.DB, "other")).toBe("MISC-001");
  expect(await nextRuleId(env.DB, "faq")).toBe("FAQ-001");
});

it("serves a rule at a stable url and id", async () => {
  const res = await SELF.fetch("https://x.test/api/handbook/logging-manual");
  expect(res.status).toBe(200);
  expect((await res.json<{ rule_id: string }>()).rule_id).toBe("LOG-001");
  expect((await SELF.fetch("https://x.test/handbook/logging-manual.md")).status).toBe(200);
});

it("keeps the old text and points at the replacement when superseded", async () => {
  await SELF.fetch("https://x.test/api/handbook/logging-v2", { method: "PUT", headers: auth, body: JSON.stringify({ title: "Logging v2", body: "new text", category: "logging", owner: "Jon" }) });
  const v2 = await (await SELF.fetch("https://x.test/api/handbook/logging-v2")).json<{ rule_id: string }>();
  await SELF.fetch("https://x.test/api/handbook/logging-manual/supersede", { method: "POST", headers: auth, body: JSON.stringify({ superseded_by: v2.rule_id }) });
  const old = await (await SELF.fetch("https://x.test/handbook/logging-manual.md")).text();
  expect(old).toContain("status: superseded");
  expect(old).toContain(`superseded_by: ${v2.rule_id}`);
  expect(old).toContain("log");
  expect(old).not.toContain("new text");
});

it("keeps the rule id when a rule is recategorised", async () => {
  await SELF.fetch("https://x.test/api/handbook/logging-manual", { method: "PUT", headers: auth, body: JSON.stringify({ title: "Logging", body: "log", category: "verification", owner: "Jon" }) });
  expect((await (await SELF.fetch("https://x.test/api/handbook/logging-manual")).json<{ rule_id: string; category: string }>()).rule_id).toBe("LOG-001");
});

it("rejects an unknown category and an explicit bad rule id", async () => {
  const bad = await SELF.fetch("https://x.test/api/handbook/bad", { method: "PUT", headers: auth, body: JSON.stringify({ title: "B", body: "b", category: "nonsense" }) });
  expect(bad.status).toBe(400);
  const badId = await SELF.fetch("https://x.test/api/handbook/bad2", { method: "PUT", headers: auth, body: JSON.stringify({ title: "B", body: "b", category: "logging", rule_id: "nope" }) });
  expect(badId.status).toBe(400);
  expect((await badId.json<{ field: string }>()).field).toBe("rule_id");
  const mismatchedPrefix = await SELF.fetch("https://x.test/api/handbook/bad3", { method: "PUT", headers: auth, body: JSON.stringify({ title: "B", body: "b", category: "logging", rule_id: "RULE-001" }) });
  expect(mismatchedPrefix.status).toBe(400);
  expect((await mismatchedPrefix.json<{ field: string }>()).field).toBe("rule_id");

  const validFaq = await SELF.fetch("https://x.test/api/handbook/faq-test", { method: "PUT", headers: auth, body: JSON.stringify({ title: "FAQ Test", body: "answering questions", category: "faq", rule_id: "FAQ-005" }) });
  expect(validFaq.status).toBe(200);
  expect((await validFaq.json<{ rule_id: string }>()).rule_id).toBe("FAQ-005");
});
