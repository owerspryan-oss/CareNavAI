import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@config": fileURLToPath(new URL("./config", import.meta.url)),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Route tests import a lot on first use; 5 s isn't enough on a busy Windows machine.
    testTimeout: 20_000,
    env: { LOG_LEVEL: "silent" },
  },
});
