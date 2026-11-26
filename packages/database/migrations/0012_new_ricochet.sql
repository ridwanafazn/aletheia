CREATE TABLE "payroll"."leave_balances" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"personnel_id" uuid NOT NULL,
	"leave_type" varchar(24) NOT NULL,
	"year" smallint NOT NULL,
	"entitlement_days" numeric(6, 2) DEFAULT '0' NOT NULL,
	"used_days" numeric(6, 2) DEFAULT '0' NOT NULL,
	"pending_days" numeric(6, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leave_balances_tenant_personnel_type_year_unique" UNIQUE("tenant_id","personnel_id","leave_type","year"),
	CONSTRAINT "leave_balances_type_check" CHECK ("payroll"."leave_balances"."leave_type" in ('ANNUAL','SICK','MATERNITY','UNPAID','OTHER')),
	CONSTRAINT "leave_balances_year_check" CHECK ("payroll"."leave_balances"."year" between 2000 and 2100),
	CONSTRAINT "leave_balances_days_check" CHECK ("payroll"."leave_balances"."entitlement_days" >= 0 AND "payroll"."leave_balances"."used_days" >= 0 AND "payroll"."leave_balances"."pending_days" >= 0 AND "payroll"."leave_balances"."used_days" + "payroll"."leave_balances"."pending_days" <= "payroll"."leave_balances"."entitlement_days")
);
--> statement-breakpoint
CREATE TABLE "payroll"."overtime_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"personnel_id" uuid NOT NULL,
	"work_date" date NOT NULL,
	"hours" numeric(5, 2) NOT NULL,
	"reason" text NOT NULL,
	"status" varchar(16) NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_notes" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "overtime_requests_tenant_personnel_date_unique" UNIQUE("tenant_id","personnel_id","work_date"),
	CONSTRAINT "overtime_status_check" CHECK ("payroll"."overtime_requests"."status" in ('PENDING','APPROVED','REJECTED','CANCELLED')),
	CONSTRAINT "overtime_hours_check" CHECK ("payroll"."overtime_requests"."hours" > 0 AND "payroll"."overtime_requests"."hours" <= 24)
);
--> statement-breakpoint
ALTER TABLE "governance"."users" DROP CONSTRAINT "users_role_check";--> statement-breakpoint
ALTER TABLE "payroll"."leave_balances" ADD CONSTRAINT "leave_balances_personnel_id_personnel_id_fk" FOREIGN KEY ("personnel_id") REFERENCES "payroll"."personnel"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll"."overtime_requests" ADD CONSTRAINT "overtime_requests_personnel_id_personnel_id_fk" FOREIGN KEY ("personnel_id") REFERENCES "payroll"."personnel"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_leave_balances_tenant_personnel_year" ON "payroll"."leave_balances" USING btree ("tenant_id","personnel_id","year");--> statement-breakpoint
CREATE INDEX "idx_overtime_requests_tenant_status_date" ON "payroll"."overtime_requests" USING btree ("tenant_id","status","work_date");--> statement-breakpoint
ALTER TABLE "governance"."users" ADD CONSTRAINT "users_role_check" CHECK ("governance"."users"."role" in ('CLAIMS_OFFICER','HR_SPECIALIST','BRANCH_MANAGER','FINANCE_MANAGER','MIS_ANALYST','COMPLIANCE_ADMIN','EMPLOYEE'));--> statement-breakpoint
ALTER TABLE "payroll"."leave_balances" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payroll"."overtime_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "payroll"."leave_balances" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY tenant_isolation ON "payroll"."overtime_requests" USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "payroll"."leave_balances", "payroll"."overtime_requests" TO aletheia_app;
