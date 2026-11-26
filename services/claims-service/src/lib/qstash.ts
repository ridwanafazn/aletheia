import { incrementCounter, withSpan } from "@aletheia/observability";

import { env } from "../config.js";
import { logger } from "./logger.js";

export const CLAIM_RISK_EVENT = "CLAIM_SUBMITTED_EVALUATE" as const;

export interface ClaimRiskEvent {
  event_type: typeof CLAIM_RISK_EVENT;
  tenant_id: string;
  claim_id: string;
  policy_version_id: string;
  correlation_id: string;
  requested_at: string;
}

export function buildClaimRiskEvent(input: Omit<ClaimRiskEvent, "event_type" | "requested_at">) {
  return {
    event_type: CLAIM_RISK_EVENT,
    ...input,
    requested_at: new Date().toISOString(),
  } satisfies ClaimRiskEvent;
}

export function qstashDestination(): string {
  return `${env.WORKER_URL.replace(/\/$/, "")}/internal/v1/qstash/consume`;
}

export async function publishClaimRiskEvent(event: ClaimRiskEvent): Promise<boolean> {
  if (env.QSTASH_TOKEN === undefined) {
    logger.info(
      { claim_id: event.claim_id, event_type: event.event_type },
      "qstash token absent, risk event not enqueued",
    );
    incrementCounter("queue_publish_total", {
      event_type: event.event_type,
      outcome: "skipped",
    });
    return false;
  }

  const destination = qstashDestination();
  try {
    const response = await withSpan(
      "queue.publish",
      { "queue.event_type": event.event_type, "queue.topic": "claims-risk" },
      () =>
        fetch(`${env.QSTASH_URL.replace(/\/$/, "")}/v2/publish/${destination}`, {
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
      logger.warn(
        { status: response.status, claim_id: event.claim_id },
        "qstash risk event rejected",
      );
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
      {
        claim_id: event.claim_id,
        error: error instanceof Error ? error.message : "unknown",
      },
      "qstash risk event failed",
    );
    incrementCounter("queue_publish_total", {
      event_type: event.event_type,
      outcome: "error",
    });
    return false;
  }
}
