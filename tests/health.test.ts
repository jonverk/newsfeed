import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("api", () => {
  it("answers health with the worker env", async () => {
    const res = await SELF.fetch("https://example.com/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
  it("confirms FTS5 is available on this D1", async () => {
    const res = await SELF.fetch("https://example.com/api/health/fts");
    expect(await res.json()).toEqual({ fts5: true });
  });
});
