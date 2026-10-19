import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["packages/*", "examples/sandbox"],
    passWithNoTests: true,
  },
});
