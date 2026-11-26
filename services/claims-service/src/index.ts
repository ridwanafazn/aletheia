import { closeDatabase, pool } from "@aletheia/database";
import { registerPoolMetrics, shutdownTelemetry } from "@aletheia/observability";

import { createApp } from "./app.js";
import { env } from "./config.js";
import { logger } from "./lib/logger.js";

registerPoolMetrics(pool);

const app = createApp();
const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "claims-service listening");
});

const shutdown = (signal: string) => {
  logger.info({ signal }, "claims-service shutting down");
  server.close(() => {
    void shutdownTelemetry()
      .then(() => closeDatabase())
      .finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

export { app, createApp };
