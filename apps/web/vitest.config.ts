import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/lib/**/*.ts"],
      // Components are excluded: they are overwhelmingly layout, and asserting
      // on their markup tests the JSX rather than any behaviour. The logic
      // worth testing was deliberately extracted into src/lib.
      exclude: ["src/**/*.test.*"],
    },
  },
});
