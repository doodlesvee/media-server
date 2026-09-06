import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globalSetup: ["src/test/setup.ts"],
    // Integration tests share one database, so they must not run in parallel
    // files — two suites truncating each other's rows mid-test would fail at
    // random and teach you to distrust the suite.
    pool: "forks",
    maxWorkers: 1,
    minWorkers: 1,
    fileParallelism: false,
    env: {
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ?? "postgres://media:media@localhost:5432/media_test",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/**/*.ts"],
      // Route handlers and the scanner ARE covered — by integration tests
      // against a real Postgres, not mocks. Only generated migrations, the
      // entry point and the harness itself are excluded.
      exclude: ["src/db/migrations/**", "src/app.ts", "src/test/**", "src/**/*.test.ts"],
    },
  },
});
