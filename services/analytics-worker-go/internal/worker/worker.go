package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/metric"
	"go.opentelemetry.io/otel/trace"
)

const (
	EventBatchCalculate  = "PAYROLL_BATCH_CALCULATE"
	EventClaimRisk       = "CLAIM_SUBMITTED_EVALUATE"
	EventWhatIf          = "WHAT_IF_SIMULATION_RUN"
	EventMISRefresh      = "MIS_VIEW_REFRESH"
	EventPayslipGenerate = "PAYSLIP_GENERATE"
	EventReportGenerate  = "REPORT_GENERATE"
	SystemActorID        = "019361a2-7c00-7000-8000-0000000000ff"
)

type Event struct {
	EventID             string          `json:"event_id"`
	EventType           string          `json:"event_type"`
	TenantID            string          `json:"tenant_id"`
	CorrelationID       string          `json:"correlation_id"`
	RequestedBy         string          `json:"requested_by"`
	RequestedAt         string          `json:"requested_at"`
	BatchID             string          `json:"batch_id"`
	ClaimID             string          `json:"claim_id"`
	PolicyVersionID     string          `json:"policy_version_id"`
	BranchID            string          `json:"branch_id"`
	PeriodStart         string          `json:"period_start"`
	PeriodEnd           string          `json:"period_end"`
	SimulationName      string          `json:"simulation_name"`
	BasePolicyVersionID string          `json:"base_policy_version_id"`
	SimulatedRules      json.RawMessage `json:"simulated_rules_payload"`
	TargetPeriodStart   string          `json:"target_period_start"`
	TargetPeriodEnd     string          `json:"target_period_end"`
	ReportID            string          `json:"report_id"`
	ReportType          string          `json:"report_type"`
	PeriodMonth         string          `json:"period_month"`
	ItemCount           int             `json:"item_count"`
}

type Worker struct {
	pool            *pgxpool.Pool
	logger          *slog.Logger
	concurrency     int
	now             func() time.Time
	consumeCounter  metric.Int64Counter
	consumeDuration metric.Float64Histogram
	batchDuration   metric.Float64Histogram
	itemFailures    metric.Int64Counter
}

func New(pool *pgxpool.Pool, logger *slog.Logger, concurrency int) *Worker {
	if concurrency < 1 {
		concurrency = 8
	}
	meter := otel.Meter("analytics-worker-go")
	consumeCounter, _ := meter.Int64Counter("queue_consume_total")
	consumeDuration, _ := meter.Float64Histogram(
		"queue_consume_duration_seconds",
		metric.WithUnit("s"),
		metric.WithExplicitBucketBoundaries(0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1, 2.5, 5, 7.5, 10),
	)
	batchDuration, _ := meter.Float64Histogram(
		"payroll_batch_duration_seconds",
		metric.WithUnit("s"),
		metric.WithExplicitBucketBoundaries(0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1, 2.5, 5, 7.5, 10, 30, 60),
	)
	itemFailures, _ := meter.Int64Counter("payroll_items_failed_total")

	return &Worker{
		pool:            pool,
		logger:          logger,
		concurrency:     concurrency,
		now:             time.Now,
		consumeCounter:  consumeCounter,
		consumeDuration: consumeDuration,
		batchDuration:   batchDuration,
		itemFailures:    itemFailures,
	}
}

func (w *Worker) Handle(ctx context.Context, event Event) (result map[string]any, err error) {
	if event.EventType == "" || event.TenantID == "" {
		return nil, fmt.Errorf("event_type dan tenant_id wajib diisi")
	}
	started := time.Now()
	ctx, span := otel.Tracer("analytics-worker-go").Start(ctx, "queue.consume",
		trace.WithAttributes(
			attribute.String("queue.event_type", event.EventType),
			attribute.String("queue.event_id", event.EventID),
			attribute.String("tenant.id", event.TenantID),
		),
	)
	outcome := "success"
	defer func() {
		if err != nil {
			outcome = "error"
			span.RecordError(err)
			span.SetStatus(codes.Error, err.Error())
		}
		duration := time.Since(started)
		span.SetAttributes(attribute.String("queue.outcome", outcome))
		span.End()
		w.consumeCounter.Add(context.Background(), 1, metric.WithAttributes(
			attribute.String("event_type", event.EventType),
			attribute.String("outcome", outcome),
		))
		w.consumeDuration.Record(context.Background(), duration.Seconds(), metric.WithAttributes(
			attribute.String("event_type", event.EventType),
		))
		w.logger.Info("event handled",
			"event_type", event.EventType,
			"event_id", event.EventID,
			"outcome", outcome,
			"duration_ms", duration.Milliseconds(),
			"trace_id", span.SpanContext().TraceID().String(),
		)
	}()
	switch event.EventType {
	case EventBatchCalculate:
		return w.handleBatchCalculate(ctx, event)
	case EventClaimRisk:
		return w.handleClaimRisk(ctx, event)
	case EventWhatIf:
		return w.handleWhatIf(ctx, event)
	case EventMISRefresh:
		return w.handleMISRefresh(ctx, event)
	case EventPayslipGenerate:
		return w.handlePayslipGenerate(ctx, event)
	case EventReportGenerate:
		return w.handleReportGenerate(ctx, event)
	case "PAYMENT_RECONCILE", "AUDIT_VERIFY":
		return nil, fmt.Errorf("event_type %s belum diimplementasikan sampai task lanjutan", event.EventType)
	default:
		w.logger.Warn("event type belum ditangani", "event_type", event.EventType, "event_id", event.EventID)
		return map[string]any{"ignored": true, "event_type": event.EventType}, nil
	}
}

func (w *Worker) appendAudit(
	ctx context.Context,
	q pgx.Tx,
	tenantID string,
	correlationID string,
	domain string,
	entityType string,
	entityID string,
	action string,
	policyVersionID string,
	decisionContext map[string]any,
) error {
	return w.appendAuditWithEvent(
		ctx, q, tenantID, correlationID, domain, entityType, entityID, action,
		policyVersionID, decisionContext, "",
	)
}

func (w *Worker) appendAuditWithEvent(
	ctx context.Context,
	q pgx.Tx,
	tenantID string,
	correlationID string,
	domain string,
	entityType string,
	entityID string,
	action string,
	policyVersionID string,
	decisionContext map[string]any,
	eventUUID string,
) error {
	payload, err := json.Marshal(decisionContext)
	if err != nil {
		return err
	}
	eventExpression := "gen_random_uuid()"
	if eventUUID != "" {
		eventExpression = "$10::uuid"
	}
	arguments := []any{
		tenantID,
		correlationID,
		SystemActorID,
		domain,
		entityType,
		entityID,
		action,
		policyVersionID,
		payload,
	}
	if eventUUID != "" {
		arguments = append(arguments, eventUUID)
	}
	_, err = q.Exec(
		ctx,
		fmt.Sprintf(`select governance.append_audit_log(
		   $1::uuid, %s,
		   coalesce(nullif($2, '')::uuid, gen_random_uuid()),
		   $3::uuid, 'SYSTEM', $4, $5, $6::uuid, $7,
		   nullif($8, '')::uuid, $9::jsonb
		 )`, eventExpression),
		arguments...,
	)
	return err
}
