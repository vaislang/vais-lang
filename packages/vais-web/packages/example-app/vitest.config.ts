import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["__tests__/**/*.test.ts", "__tests__/**/*.ts"],
    exclude: ["node_modules", "dist"],
  },
});
