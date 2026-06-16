import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    // Unit tests next to lib code; the eval harness entry; and every eval case.
    include: ["lib/**/*.test.ts", "evals/run.ts", "evals/cases/**/*.case.ts"],
  },
  resolve: {
    alias: {
      "@": root.replace(/\/$/, ""),
    },
  },
});
