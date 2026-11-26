import { pool } from "@aletheia/database";
import { Router, type Router as RouterType } from "express";

export const healthRouter: RouterType = Router();

healthRouter.get("/healthz", (_request, response) => {
  response.status(200).json({ status: "ok", service: "claims-service" });
});

healthRouter.get("/readyz", async (_request, response) => {
  try {
    await Promise.race([
      pool.query("select 1"),
      new Promise((_, reject) => {
        const timer = setTimeout(() => reject(new Error("database timeout")), 2000);
        timer.unref();
      }),
    ]);
    response.status(200).json({ status: "ready", service: "claims-service" });
  } catch {
    response.status(503).json({ status: "degraded", service: "claims-service" });
  }
});
