import { randomUUID } from "node:crypto";

import type { WhatIfSimulationRequest } from "@aletheia/shared-contracts";

import { incrementCounter, withSpan } from "@aletheia/observability";

import { env } from "../config.js";
import { logger } from "./logger.js";

interface WhatIfEvent {
  event_id: string;
  event_type: "WHAT_IF_SIMULATION_RUN";
  tenant_id: string;
  correlation_id: string;
  requested_by: string;
  requested_at: string;
  simulation_name: string;
  base_policy_version_id: string;
  simulated_rules_payload: Record<string, unknown>;
  target_period_start: string;
  target_period_end: string;
  branch_id: string;
}

export function buildWhatIfEvent(input: {
  tenantId: string;
  correlationId: string;
  requestedBy: string;
  request: WhatIfSimulationRequest;
}): WhatIfEvent {
  return {
    event_id: randomUUID(),
    event_type: "WHAT_IF_SIMULATION_RUN",
    tenant_id: input.tenantId,
    correlation_id: input.correlationId,
    requested_by: input.requestedBy,
    requested_at: new Date().toISOString(),
    simulation_name: input.request.simulation_name,
    base_policy_version_id: input.request.base_policy_version_id,
    simulated_rules_payload: input.request.simulated_rules_payload,
    target_period_start: input.request.target_period_start,
    target_period_end: input.request.target_period_end,
    branch_id: input.request.branch_id ?? "",
  };
}

export async function publishWhatIfEvent(
  event: WhatIfEvent,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (env.QSTASH_TOKEN === undefined) {
    logger.info(
      { event_id: event.event_id, event_type: event.event_type },
      "qstash token absent, what-if event not enqueued",
    );
    incrementCounter("queue_publish_total", {
      event_type: event.event_type,
      outcome: "skipped",
    });
    return false;
  }
  try {
    const destination = `${env.WORKER_URL.replace(/\/$/, "")}/internal/v1/qstash/consume`;
    const response = await withSpan(
      "queue.publish",
      { "queue.event_type": event.event_type, "queue.topic": "analytics-what-if" },
      () =>
        fetchImpl(`${env.QSTASH_URL.replace(/\/$/, "")}/v2/publish/${destination}`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${env.QSTASH_TOKEN}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(event),
          signal: AbortSignal.timeout(3_000),
        }),
    );
    if (!response.ok) {
      logger.warn({ status: response.status, event_id: event.event_id }, "qstash what-if rejected");
      incrementCounter("queue_publish_total", {
        event_type: event.event_type,
        outcome: "error",
      });
      return false;
    }
    incrementCounter("queue_publish_total", {
      event_type: event.event_type,
      outcome: "success",
    });
    return true;
  } catch (error) {
    logger.warn(
      { event_id: event.event_id, error: error instanceof Error ? error.message : "unknown" },
      "qstash what-if failed",
    );
    incrementCounter("queue_publish_total", {
      event_type: event.event_type,
      outcome: "error",
    });
    return false;
  }
}
