import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import * as schema from "./schema.js";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// An idle client losing its connection — Postgres restarting under us, a
// container being recreated — emits 'error' on the pool. Unhandled, that is an
// uncaught exception that takes the whole server down while it is otherwise
// healthy. The pool discards the dead client either way, so logging is enough:
// the next query opens a fresh connection.
pool.on("error", (err) => {
  console.warn("db: idle client error:", err.message);
});

export const db = drizzle(pool, { schema });

export async function checkDbConnection(): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

const CONNECT_ATTEMPTS = 30;
const CONNECT_RETRY_MS = 1000;

/**
 * Blocks until Postgres accepts a connection, or gives up after ~30s.
 *
 * Compose's `depends_on: service_healthy` only orders the *first* start, so
 * restarting this container alone — or recreating Postgres underneath it —
 * can land us here before the `postgres` host even resolves. Letting that
 * reject killed the process for good: `tsx watch` keeps the container alive,
 * so Docker's `restart: unless-stopped` never fired and nothing listened on
 * 3000 until someone touched a file.
 */
async function waitForDb(): Promise<void> {
  for (let attempt = 1; attempt <= CONNECT_ATTEMPTS; attempt++) {
    if (await checkDbConnection()) return;
    if (attempt === CONNECT_ATTEMPTS) break;
    console.warn(
      `db: unreachable (attempt ${attempt}/${CONNECT_ATTEMPTS}), retrying in ${CONNECT_RETRY_MS}ms`
    );
    await new Promise((resolve) => setTimeout(resolve, CONNECT_RETRY_MS));
  }
  throw new Error(
    `db: unreachable after ${CONNECT_ATTEMPTS} attempts over ` +
      `${(CONNECT_ATTEMPTS * CONNECT_RETRY_MS) / 1000}s — is Postgres running?`
  );
}

export async function runMigrations(): Promise<void> {
  // Only the connection is retried. Once Postgres answers, a failing migration
  // is a real defect in the SQL and must surface immediately rather than being
  // replayed until the attempts run out.
  await waitForDb();
  const migrationsFolder = path.resolve(import.meta.dirname, "migrations");
  await migrate(db, { migrationsFolder });
}
