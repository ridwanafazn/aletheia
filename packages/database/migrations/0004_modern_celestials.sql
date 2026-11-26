CREATE TABLE "payroll"."generated_files" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" varchar(24) NOT NULL,
	"entity_id" uuid NOT NULL,
	"file_name" varchar(160) NOT NULL,
	"mime_type" varchar(64) NOT NULL,
	"file_size" integer NOT NULL,
	"content" "bytea" NOT NULL,
	"checksum_sha256" char(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "generated_files_tenant_kind_entity_unique" UNIQUE("tenant_id","kind","entity_id"),
	CONSTRAINT "generated_files_kind_check" CHECK ("payroll"."generated_files"."kind" in ('PAYSLIP','REPORT')),
	CONSTRAINT "generated_files_size_check" CHECK ("payroll"."generated_files"."file_size" > 0)
);
--> statement-breakpoint
CREATE TABLE "payroll"."payment_webhook_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider" varchar(24) NOT NULL,
	"event_id" varchar(128) NOT NULL,
	"payment_id" uuid NOT NULL,
	"event_type" varchar(32) NOT NULL,
	"status" varchar(16) NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_webhook_events_tenant_provider_event_unique" UNIQUE("tenant_id","provider","event_id"),
	CONSTRAINT "payment_webhook_events_provider_check" CHECK ("payroll"."payment_webhook_events"."provider" in ('MOCK','XENDIT','MIDTRANS'))
);
--> statement-breakpoint
ALTER TABLE "payroll"."payslips" ADD COLUMN "source_event_id" uuid;--> statement-breakpoint
ALTER TABLE "payroll"."tax_reports" ADD COLUMN "source_event_id" uuid;--> statement-breakpoint
CREATE INDEX "idx_generated_files_tenant_entity" ON "payroll"."generated_files" USING btree ("tenant_id","entity_id");
ALTER TABLE payroll.generated_files ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON payroll.generated_files
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE payroll.payment_webhook_events ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON payroll.payment_webhook_events
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_payslips_source_event
  ON payroll.payslips (tenant_id, source_event_id)
  WHERE source_event_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_tax_reports_source_event
  ON payroll.tax_reports (tenant_id, source_event_id)
  WHERE source_event_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_payments_provider_reference
  ON payroll.payments (tenant_id, provider, provider_reference)
  WHERE provider_reference IS NOT NULL;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON payroll.generated_files, payroll.payment_webhook_events
  TO aletheia_app;--> statement-breakpoint
GRANT SELECT ON payroll.generated_files, payroll.payment_webhook_events
  TO aletheia_readonly;
