import { randomUUID } from "node:crypto";

import { incrementCounter, withSpan } from "@aletheia/observability";

import { env } from "../config.js";
import { logger } from "./logger.js";

export const PAYROLL_EVENTS = {
  batchCalculate: "PAYROLL_BATCH_CALCULATE",
  payslipGenerate: "PAYSLIP_GENERATE",
  reportGenerate: "REPORT_GENERATE",
} as const;

export interface PayrollEventBase {
  event_id: string;
  event_type: (typeof PAYROLL_EVENTS)[keyof typeof PAYROLL_EVENTS];
  tenant_id: string;
  correlation_id: string;
  requested_by: string;
  requested_at: string;
}

export interface BatchCalculateEvent extends PayrollEventBase {
  event_type: typeof PAYROLL_EVENTS.batchCalculate;
  batch_id: string;
  policy_version_id: string;
  branch_id: string;
  period_start: string;
  period_end: string;
}

export interface PayslipGenerateEvent extends PayrollEventBase {
  event_type: typeof PAYROLL_EVENTS.payslipGenerate;
  batch_id: string;
  policy_version_id: string;
  period_month: string;
  item_count: number;
}

export interface ReportGenerateEvent extends PayrollEventBase {
  event_type: typeof PAYROLL_EVENTS.reportGenerate;
  report_id: string;
  report_type: string;
  policy_version_id: string;
  period_start: string;
  period_end: string;
  branch_id: string | null;
}

export type PayrollEvent = BatchCalculateEvent | PayslipGenerateEvent | ReportGenerateEvent;

function base<T extends PayrollEvent["event_type"]>(input: {
  eventType: T;
  tenantId: string;
  correlationId: string;
  requestedBy: string;
}): PayrollEventBase & { event_type: T } {
  return {
    event_id: randomUUID(),
    event_type: input.eventType,
    tenant_id: input.tenantId,
    correlation_id: input.correlationId,
    requested_by: input.requestedBy,
    requested_at: new Date().toISOString(),
  };
}

export function buildBatchCalculateEvent(input: {
  tenantId: string;
  correlationId: string;
  requestedBy: string;
  batchId: string;
  policyVersionId: string;
  branchId: string;
  periodStart: string;
  periodEnd: string;
}): BatchCalculateEvent {
  return {
    ...base({
      eventType: PAYROLL_EVENTS.batchCalculate,
      tenantId: input.tenantId,
      correlationId: input.correlationId,
      requestedBy: input.requestedBy,
    }),
    batch_id: input.batchId,
    policy_version_id: input.policyVersionId,
    branch_id: input.branchId,
    period_start: input.periodStart,
    period_end: input.periodEnd,
  };
}

export function buildPayslipGenerateEvent(input: {
  tenantId: string;
  correlationId: string;
  requestedBy: string;
  batchId: string;
  policyVersionId: string;
  periodMonth: string;
  itemCount: number;
}): PayslipGenerateEvent {
  return {
    ...base({
      eventType: PAYROLL_EVENTS.payslipGenerate,
      tenantId: input.tenantId,
      correlationId: input.correlationId,
      requestedBy: input.requestedBy,
    }),
    batch_id: input.batchId,
    policy_version_id: input.policyVersionId,
    period_month: input.periodMonth,
    item_count: input.itemCount,
  };
}

export function buildReportGenerateEvent(input: {
  tenantId: string;
  correlationId: string;
  requestedBy: string;
  reportId: string;
  reportType: string;
  policyVersionId: string;
  periodStart: string;
  periodEnd: string;
  branchId: string | null;
}): ReportGenerateEvent {
  return {
    ...base({
      eventType: PAYROLL_EVENTS.reportGenerate,
      tenantId: input.tenantId,
      correlationId: input.correlationId,
      requestedBy: input.requestedBy,
    }),
    report_id: input.reportId,
    report_type: input.reportType,
    policy_version_id: input.policyVersionId,
    period_start: input.periodStart,
    period_end: input.periodEnd,
    branch_id: input.branchId,
  };
}

export function qstashDestination(): string {
  return `${env.WORKER_URL.replace(/\/$/, "")}/internal/v1/qstash/consume`;
}

export async function publishPayrollEvent(
  event: PayrollEvent,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (env.QSTASH_TOKEN === undefined) {
    logger.info(
      { event_id: event.event_id, event_type: event.event_type },
      "qstash token absent, payroll event not enqueued",
    );
    incrementCounter("queue_publish_total", {
      event_type: event.event_type,
      outcome: "skipped",
    });
    return false;
  }

  try {
    const response = await withSpan(
      "queue.publish",
      { "queue.event_type": event.event_type, "queue.topic": "payroll" },
      () =>
        fetchImpl(`${env.QSTASH_URL.replace(/\/$/, "")}/v2/publish/${qstashDestination()}`, {
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
        { status: response.status, event_id: event.event_id },
        "qstash payroll event rejected",
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
        event_id: event.event_id,
        error: error instanceof Error ? error.message : "unknown",
      },
      "qstash payroll event failed",
    );
    incrementCounter("queue_publish_total", {
      event_type: event.event_type,
      outcome: "error",
    });
    return false;
  }
}
