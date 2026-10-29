import { defineConfig } from "vitest/config";

// npm test – the unit tests (a mocked fetch) and the end-to-end test against the PHP API (skipped without php)
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
