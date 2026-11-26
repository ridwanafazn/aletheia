CREATE TABLE "governance"."idempotency_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"scope" varchar(120) NOT NULL,
	"idempotency_key" varchar(64) NOT NULL,
	"request_hash" char(64) NOT NULL,
	"status" varchar(16) DEFAULT 'IN_PROGRESS' NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "idempotency_scope_key_unique" UNIQUE("tenant_id","actor_id","scope","idempotency_key"),
	CONSTRAINT "idempotency_status_check" CHECK ("governance"."idempotency_records"."status" in ('IN_PROGRESS','COMPLETED'))
);
--> statement-breakpoint
CREATE INDEX "idx_idempotency_created" ON "governance"."idempotency_records" USING btree ("tenant_id","created_at");
--> statement-breakpoint
ALTER TABLE governance.idempotency_records ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON governance.idempotency_records
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
