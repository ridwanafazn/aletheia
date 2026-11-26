import { httpMetricsMiddleware } from "@aletheia/observability";
import express, { type Request } from "express";

import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { gatewayAuth } from "./middleware/gateway-auth.js";
import { requestContext } from "./middleware/context.js";
import { requestLogger } from "./middleware/request-logger.js";
import { tenantContext } from "./middleware/tenant-context.js";
import { claimsRouter } from "./routes/claims.js";
import { healthRouter } from "./routes/health.js";

export function createApp(): express.Express {
  const app = express();
  app.disable("x-powered-by");

  app.use(httpMetricsMiddleware);
  app.use(requestContext);
  app.use(requestLogger);
  app.use(
    express.json({
      limit: "1mb",
      verify: (request, _response, buffer) => {
        (request as Request).rawBody = Buffer.from(buffer);
      },
    }),
  );
  app.use(gatewayAuth);
  app.use(tenantContext);

  app.use(healthRouter);
  app.use("/api/v1/claims", claimsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
