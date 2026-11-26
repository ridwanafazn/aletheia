import {
  context,
  metrics,
  SpanStatusCode,
  trace,
  type Attributes,
  type Span,
} from "@opentelemetry/api";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { ExpressInstrumentation } from "@opentelemetry/instrumentation-express";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { PgInstrumentation } from "@opentelemetry/instrumentation-pg";
import { PinoInstrumentation } from "@opentelemetry/instrumentation-pino";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ParentBasedSampler, TraceIdRatioBasedSampler } from "@opentelemetry/sdk-trace";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_NAMESPACE } from "@opentelemetry/semantic-conventions";

const TRACER_NAME = "@aletheia/observability";
let sdk: NodeSDK | undefined;

function otlpEndpoint(): string | null {
  const value = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  return value === undefined || value.length === 0 ? null : value.replace(/\/$/, "");
}

function samplerArg(): number {
  const parsed = Number(process.env.OTEL_TRACES_SAMPLER_ARG ?? "1");
  if (!Number.isFinite(parsed)) {
    return 1;
  }
  return Math.min(1, Math.max(0, parsed));
}

export function initTelemetry(serviceName: string): void {
  const endpoint = otlpEndpoint();
  if (endpoint === null || sdk !== undefined) {
    return;
  }

  const headers: Record<string, string> = {};
  for (const entry of (process.env.OTEL_EXPORTER_OTLP_HEADERS ?? "").split(",")) {
    const separator = entry.indexOf("=");
    if (separator > 0) {
      headers[entry.slice(0, separator).trim()] = entry.slice(separator + 1).trim();
    }
  }

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_NAMESPACE]: process.env.OTEL_SERVICE_NAMESPACE ?? "aletheia",
      "deployment.environment": process.env.NODE_ENV ?? "development",
      "service.version": process.env.SERVICE_VERSION ?? process.env.GIT_SHA ?? "local",
    }),
    traceExporter: new OTLPTraceExporter({
      url: `${endpoint}/v1/traces`,
      headers,
    }),
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({
          url: `${endpoint}/v1/metrics`,
          headers,
        }),
        exportIntervalMillis: 5_000,
        exportTimeoutMillis: 4_000,
      }),
    ],
    instrumentations: [
      new HttpInstrumentation({
        ignoreIncomingRequestHook: (request) => {
          const path = request.url?.split("?")[0] ?? "";
          return path === "/healthz" || path === "/readyz";
        },
      }),
      new ExpressInstrumentation(),
      new PgInstrumentation({ enhancedDatabaseReporting: false }),
      new PinoInstrumentation(),
    ],
    sampler: new ParentBasedSampler({
      root: new TraceIdRatioBasedSampler(samplerArg()),
    }),
  });

  sdk.start();
  process.once("SIGTERM", () => void shutdownTelemetry());
  process.once("SIGINT", () => void shutdownTelemetry());
}

export async function shutdownTelemetry(): Promise<void> {
  if (sdk === undefined) {
    return;
  }
  const active = sdk;
  sdk = undefined;
  await active.shutdown().catch(() => undefined);
}

export function getTracer() {
  return trace.getTracer(TRACER_NAME);
}

export function currentTraceFields(): { trace_id?: string; span_id?: string } {
  const span = trace.getSpan(context.active());
  if (span === undefined) {
    return {};
  }
  const spanContext = span.spanContext();
  if (!spanContext.traceId || !spanContext.spanId) {
    return {};
  }
  return { trace_id: spanContext.traceId, span_id: spanContext.spanId };
}

export async function withSpan<T>(
  name: string,
  attributes: Attributes,
  fn: (span: Span) => T | Promise<T>,
): Promise<T> {
  return getTracer().startActiveSpan(name, { attributes }, async (span) => {
    try {
      return await fn(span);
    } catch (error) {
      span.recordException(error instanceof Error ? error : String(error));
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : "unknown",
      });
      throw error;
    } finally {
      span.end();
    }
  });
}

export type MetricAttributes = Record<string, string | number | boolean>;

type CounterLike = { add: (value: number, attributes?: Attributes) => void };
type HistogramLike = { record: (value: number, attributes?: Attributes) => void };

const counters = new Map<string, CounterLike>();
const histograms = new Map<string, HistogramLike>();
const HISTOGRAM_BOUNDARIES_SECONDS = [
  0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1, 2.5, 5, 7.5, 10,
];

function meter() {
  return metrics.getMeter(TRACER_NAME);
}

export function incrementCounter(name: string, attributes: MetricAttributes = {}, value = 1): void {
  let counter = counters.get(name);
  if (counter === undefined) {
    counter = meter().createCounter(name, { description: `Aletheia counter ${name}` });
    counters.set(name, counter);
  }
  counter.add(value, attributes);
}

export function observeHistogram(
  name: string,
  value: number,
  attributes: MetricAttributes = {},
): void {
  let histogram = histograms.get(name);
  if (histogram === undefined) {
    histogram = meter().createHistogram(name, {
      description: `Aletheia histogram ${name}`,
      unit: name.endsWith("_seconds") ? "s" : "1",
      advice: { explicitBucketBoundaries: HISTOGRAM_BOUNDARIES_SECONDS },
    });
    histograms.set(name, histogram);
  }
  histogram.record(value, attributes);
}

interface PoolMetricsSource {
  readonly totalCount: number;
  readonly idleCount: number;
  readonly waitingCount: number;
}

export function registerPoolMetrics(pool: PoolMetricsSource): void {
  const gauge = meter().createObservableGauge("db_pool_connections", {
    description: "Koneksi pool database per state",
  });
  gauge.addCallback((result) => {
    result.observe(pool.totalCount, { state: "total" });
    result.observe(pool.idleCount, { state: "idle" });
    result.observe(pool.waitingCount, { state: "waiting" });
  });
}

const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

export function normalizeHttpRoute(route: string): string {
  return (
    route
      .replace(UUID_PATTERN, ":id")
      .replace(/\/\d+(?=\/|$)/g, "/:id")
      .replace(/\/+$/, "") || "/"
  );
}

interface HttpMetricsRequest {
  method: string;
  baseUrl?: string;
  path: string;
  route?: { path?: string };
}

interface HttpMetricsResponse {
  statusCode: number;
  once: (event: "finish", listener: () => void) => void;
}

export function httpMetricsMiddleware(
  request: HttpMetricsRequest,
  response: HttpMetricsResponse,
  next: () => void,
): void {
  const startedAt = process.hrtime.bigint();
  const method = request.method.toUpperCase();
  response.once("finish", () => {
    const routePath = request.route?.path;
    const route =
      routePath === undefined
        ? normalizeHttpRoute(
            request.baseUrl === undefined ? request.path : `${request.baseUrl}${request.path}`,
          )
        : normalizeHttpRoute(`${request.baseUrl ?? ""}${routePath}`);
    const statusCode = response.statusCode;
    const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
    const attributes: MetricAttributes = {
      "http.method": method,
      "http.route": route,
      "http.status_code": statusCode,
    };
    incrementCounter("http_requests_total", attributes);
    observeHistogram("http_request_duration_seconds", durationSeconds, {
      "http.method": method,
      "http.route": route,
    });
    if (statusCode >= 500) {
      incrementCounter("http_errors_total", {
        ...attributes,
        error_type: "server",
      });
    } else if (statusCode === 429) {
      incrementCounter("http_errors_total", {
        ...attributes,
        error_type: "rate_limit",
      });
    }
  });
  next();
}
