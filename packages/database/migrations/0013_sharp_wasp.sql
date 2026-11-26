CREATE TABLE "governance"."departments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" varchar(24) NOT NULL,
	"name" varchar(120) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "departments_tenant_code_unique" UNIQUE("tenant_id","code")
);
--> statement-breakpoint
CREATE TABLE "governance"."positions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" varchar(24) NOT NULL,
	"name" varchar(120) NOT NULL,
	"job_level" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "positions_tenant_code_unique" UNIQUE("tenant_id","code"),
	CONSTRAINT "positions_job_level_check" CHECK ("governance"."positions"."job_level" in ('STAFF','SUPERVISOR','MANAGER','DIRECTOR'))
);
--> statement-breakpoint
CREATE TABLE "payroll"."reimbursements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"personnel_id" uuid NOT NULL,
	"category" varchar(24) NOT NULL,
	"expense_date" date NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"description" text NOT NULL,
	"receipt_url" text,
	"receipt_public_id" text,
	"status" varchar(16) NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_notes" text,
	"paid_by" uuid,
	"paid_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reimbursements_category_check" CHECK ("payroll"."reimbursements"."category" in ('TRANSPORT','MEAL','MEDICAL','OTHER')),
	CONSTRAINT "reimbursements_status_check" CHECK ("payroll"."reimbursements"."status" in ('PENDING','APPROVED','REJECTED','PAID')),
	CONSTRAINT "reimbursements_amount_check" CHECK ("payroll"."reimbursements"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "payroll"."personnel" ADD COLUMN "department_id" uuid;--> statement-breakpoint
ALTER TABLE "payroll"."personnel" ADD COLUMN "position_id" uuid;--> statement-breakpoint
ALTER TABLE "payroll"."personnel" ADD COLUMN "supervisor_id" uuid;--> statement-breakpoint
ALTER TABLE "payroll"."reimbursements" ADD CONSTRAINT "reimbursements_personnel_id_personnel_id_fk" FOREIGN KEY ("personnel_id") REFERENCES "payroll"."personnel"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_departments_tenant" ON "governance"."departments" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "idx_positions_tenant" ON "governance"."positions" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "idx_reimbursements_tenant_status_date" ON "payroll"."reimbursements" USING btree ("tenant_id","status","expense_date");--> statement-breakpoint
CREATE INDEX "idx_reimbursements_tenant_personnel" ON "payroll"."reimbursements" USING btree ("tenant_id","personnel_id");--> statement-breakpoint
ALTER TABLE "payroll"."personnel" ADD CONSTRAINT "personnel_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "governance"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll"."personnel" ADD CONSTRAINT "personnel_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "governance"."positions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance"."departments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "governance"."positions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payroll"."reimbursements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "governance"."departments" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY tenant_isolation ON "governance"."positions" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY tenant_isolation ON "payroll"."reimbursements" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "governance"."departments", "governance"."positions", "payroll"."reimbursements" TO aletheia_app;
