import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";

export default defineConfig({
  plugins: [
    cloudflareTest({
      main: "./tests/worker.ts",
      singleWorker: true,
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          NEWSFEED_TOKEN: "test-token",
          ADMIN_USERNAME: "jon",
          ADMIN_PASSWORD: "test-password",
        },
      },
    }),
  ],
  test: {
    setupFiles: ["./tests/setup.ts"],
    exclude: ["tests/portable/**", "**/node_modules/**"],
  },
});
