import { SELF } from "cloudflare:test";
import { expect, it } from "vitest";
const auth = { authorization: "Bearer test-token", "content-type": "application/json" };
it("creates and edits a rule without exposing invented metadata", async () => {
  const write = (title: string) => SELF.fetch("https://x.test/api/handbook/logging-manual", {method:"PUT",headers:auth,body:JSON.stringify({title,body:"log"})});
  expect((await write("Logging")).status).toBe(200);
  expect((await write("Updated")).status).toBe(200);
  const rule = await (await SELF.fetch("https://x.test/api/rules/logging-manual")).json<any>();
  expect(rule).toMatchObject({title:"Updated",body_md:"log"});
  for (const key of ["id","rule_id","owner","status","category","superseded_by"]) expect(rule).not.toHaveProperty(key);
  expect((await SELF.fetch("https://x.test/handbook/logging-manual.md")).status).toBe(200);
  expect((await SELF.fetch("https://x.test/api/handbook/logging-manual/supersede", {method:"POST",headers:auth})).status).toBe(404);
});
