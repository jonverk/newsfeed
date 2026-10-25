import { describe, it, expect, vi } from "vitest";
import * as fs from "node:fs";
import { NewsfeedClient } from "../src/client.js";
import { handlePostCreate } from "../src/commands.js";

describe("NewsfeedClient", () => {
  it("defaults to production URL and reads token", () => {
    const client = new NewsfeedClient({ token: "test-token" });
    expect(client.baseUrl).toBe("https://newsfeed.jonverk.online");
    expect(client.token).toBe("test-token");
  });

  it("normalizes base URL trailing slashes", () => {
    const client = new NewsfeedClient({ baseUrl: "https://example.com///" });
    expect(client.baseUrl).toBe("https://example.com");
  });

  it("throws when write operation called without token", async () => {
    const client = new NewsfeedClient({ token: "" });
    await expect(
      client.createPost({ title: "Test", body: "Body" })
    ).rejects.toThrow("NEWSFEED_TOKEN is required");
  });

  it("performs feed fetching and search calls", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: 1, items: [] }),
    });
    globalThis.fetch = mockFetch;

    const client = new NewsfeedClient();
    const feed = await client.getFeed();
    expect(feed.version).toBe(1);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://newsfeed.jonverk.online/feed.json",
      expect.anything()
    );
  });

  it("respects frontmatter draft: true when cli draft flag is omitted", async () => {
    const tmpFile = "/tmp/test-frontmatter-draft.md";
    fs.writeFileSync(tmpFile, '---\ntitle: "Draft Post"\ndraft: "true"\n---\nDraft content');
    const client = new NewsfeedClient({ token: "test-token" });
    const createPostSpy = vi.spyOn(client, "createPost").mockResolvedValue({ id: 1, slug: "draft-post" });

    await handlePostCreate(client, { file: tmpFile });
    expect(createPostSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Draft Post",
        draft: true,
      })
    );
    fs.unlinkSync(tmpFile);
  });
});
