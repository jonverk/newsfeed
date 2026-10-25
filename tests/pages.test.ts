import { SELF } from "cloudflare:test";
import { expect, it } from "vitest";

it("404s an unknown handbook slug", async () => {
  expect((await SELF.fetch("https://x.test/handbook/nope.md")).status).toBe(404);
  expect((await SELF.fetch("https://x.test/news/nope.md")).status).toBe(404);
});
