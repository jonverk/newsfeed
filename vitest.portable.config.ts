import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Runs the same API tests without opening Miniflare's loopback listener.
export default defineConfig({
  resolve: { alias: { "cloudflare:test": fileURLToPath(new URL("./tests/portable/runtime.ts", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["tests/*.test.ts", "tests/portable/*.test.ts", "cli/test/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
    maxWorkers: 1,
  },
});
