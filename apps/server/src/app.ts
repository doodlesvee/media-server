import "dotenv/config";
import { buildApp } from "./buildApp.js";
import { purgeExpiredSessions } from "./auth/sessions.js";
import { startScanSchedule } from "./scanner/schedule.js";
import { runMigrations } from "./db/client.js";
import { seed, seedCategories } from "./db/seed.js";

// The entry point owns everything that changes state on boot. buildApp only
// wires routes, so tests can build the same server without a scan schedule
// starting or the seed running underneath them.
await runMigrations();
await seed();
await seedCategories();
await purgeExpiredSessions();
await startScanSchedule();

const app = await buildApp({ logger: true });
const port = Number(process.env.PORT ?? 3000);

app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
