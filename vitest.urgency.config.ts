import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The urgency matrix runs against live models when OPENAI_API_KEY is set, so it is kept out of `npm test`.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@config": fileURLToPath(new URL("./config", import.meta.url)),
    },
  },
  test: { include: ["tests/urgency/matrix.urgency.ts"], environment: "node", env: { LOG_LEVEL: "silent" } },
});
