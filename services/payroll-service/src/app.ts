import { httpMetricsMiddleware } from "@aletheia/observability";
import express, { type Request } from "express";

import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { gatewayAuth } from "./middleware/gateway-auth.js";
import { requestContext } from "./middleware/context.js";
import { requestLogger } from "./middleware/request-logger.js";
import { tenantContext } from "./middleware/tenant-context.js";
import { batchRouter, paymentRouter, payrollReferenceRouter } from "./routes/batches.js";
import {
  batchRetryRouter,
  paymentActionRouter,
  paymentWebhookRouter,
} from "./routes/payments-extra.js";
import { fileRouter } from "./routes/files.js";
import { healthRouter } from "./routes/health.js";
import { reconciliationRouter } from "./routes/reconciliations.js";
import { payslipRequestRouter, payslipRouter, reportRouter } from "./routes/reports.js";
import { attendanceRouter, employeeRouter, leaveRouter, salesRouter } from "./routes/workforce.js";

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
  app.use("/api/v1/payroll-files", fileRouter);
  app.use(gatewayAuth);
  app.use(tenantContext);

  app.use(healthRouter);
  app.use("/api/v1/employees", employeeRouter);
  app.use("/api/v1/attendance", attendanceRouter);
  app.use("/api/v1/sales-achievements", salesRouter);
  app.use("/api/v1/leave-requests", leaveRouter);
  app.use("/api/v1/payroll/reconciliations", reconciliationRouter);
  app.use("/api/v1/payroll", payrollReferenceRouter);
  app.use("/api/v1/payroll/batches", payslipRequestRouter);
  app.use("/api/v1/payroll/batches", batchRetryRouter);
  app.use("/api/v1/payroll/batches", batchRouter);
  app.use("/api/v1/payroll/payments", paymentWebhookRouter);
  app.use("/api/v1/payroll/payments", paymentActionRouter);
  app.use("/api/v1/payroll/payments", paymentRouter);
  app.use("/api/v1/payslips", payslipRouter);
  app.use("/api/v1/reports", reportRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
