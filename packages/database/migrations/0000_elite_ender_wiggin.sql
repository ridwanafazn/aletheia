CREATE SCHEMA "analytics";
--> statement-breakpoint
CREATE SCHEMA "claims";
--> statement-breakpoint
CREATE SCHEMA "governance";
--> statement-breakpoint
CREATE SCHEMA "payroll";
--> statement-breakpoint
CREATE TABLE "analytics"."anomaly_flags" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"claim_id" uuid NOT NULL,
	"matched_personnel_id" uuid,
	"matched_claim_id" uuid,
	"conflict_type" varchar(32) NOT NULL,
	"severity" varchar(16) NOT NULL,
	"evidence_summary" jsonb NOT NULL,
	"resolution_status" varchar(20) DEFAULT 'OPEN' NOT NULL,
	"resolved_by" uuid,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "anomaly_flags_conflict_check" CHECK ("analytics"."anomaly_flags"."conflict_type" in ('SHARED_BANK_ACCOUNT','SHARED_NIK_IDENTITY','MULTI_CLAIM_SAME_ACCOUNT')),
	CONSTRAINT "anomaly_flags_severity_check" CHECK ("analytics"."anomaly_flags"."severity" in ('HIGH','CRITICAL')),
	CONSTRAINT "anomaly_flags_resolution_check" CHECK ("analytics"."anomaly_flags"."resolution_status" in ('OPEN','CONFIRMED_FRAUD','FALSE_POSITIVE')),
	CONSTRAINT "anomaly_flags_match_check" CHECK ("analytics"."anomaly_flags"."matched_personnel_id" IS NOT NULL OR "analytics"."anomaly_flags"."matched_claim_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "claims"."approval_steps" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"claim_id" uuid NOT NULL,
	"step_level" smallint NOT NULL,
	"approver_id" uuid NOT NULL,
	"decision" varchar(16) NOT NULL,
	"reason_notes" text NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approval_steps_level_check" CHECK ("claims"."approval_steps"."step_level" in (1, 2)),
	CONSTRAINT "approval_steps_decision_check" CHECK ("claims"."approval_steps"."decision" in ('APPROVED','REJECTED','RETURNED')),
	CONSTRAINT "approval_steps_reason_check" CHECK (char_length("claims"."approval_steps"."reason_notes") >= 15)
);
--> statement-breakpoint
CREATE TABLE "payroll"."attendance_summaries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"personnel_id" uuid NOT NULL,
	"period_month" date NOT NULL,
	"working_days" smallint DEFAULT 0 NOT NULL,
	"present_days" smallint DEFAULT 0 NOT NULL,
	"paid_leave_days" smallint DEFAULT 0 NOT NULL,
	"unpaid_leave_days" smallint DEFAULT 0 NOT NULL,
	"absent_days" smallint DEFAULT 0 NOT NULL,
	"overtime_hours" numeric(8, 2) DEFAULT '0' NOT NULL,
	"source" varchar(16) NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_tenant_personnel_period_unique" UNIQUE("tenant_id","personnel_id","period_month"),
	CONSTRAINT "attendance_days_check" CHECK ("payroll"."attendance_summaries"."unpaid_leave_days" >= 0 AND "payroll"."attendance_summaries"."unpaid_leave_days" <= "payroll"."attendance_summaries"."working_days" AND "payroll"."attendance_summaries"."overtime_hours" >= 0)
);
--> statement-breakpoint
CREATE TABLE "governance"."audit_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"event_uuid" uuid NOT NULL,
	"correlation_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"actor_role" varchar(32) NOT NULL,
	"domain" varchar(32) NOT NULL,
	"entity_type" varchar(48) NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" varchar(48) NOT NULL,
	"policy_version_id" uuid,
	"decision_context" jsonb NOT NULL,
	"prev_record_hash" char(64) NOT NULL,
	"record_hash" char(64) NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_logs_tenant_event_unique" UNIQUE("tenant_id","event_uuid")
);
--> statement-breakpoint
CREATE TABLE "payroll"."batches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"batch_code" varchar(32) NOT NULL,
	"branch_id" uuid NOT NULL,
	"period_month" date NOT NULL,
	"batch_type" varchar(24) NOT NULL,
	"correction_seq" smallint DEFAULT 0 NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"calculated_at" timestamp with time zone,
	"calculation_version" varchar(16),
	"variance_vs_batch_id" uuid,
	"policy_version_id" uuid NOT NULL,
	"status" varchar(24) NOT NULL,
	"total_gross_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"total_tax_pph21" numeric(18, 2) DEFAULT '0' NOT NULL,
	"total_bpjs_deduction" numeric(18, 2) DEFAULT '0' NOT NULL,
	"total_bpjs_employer" numeric(18, 2) DEFAULT '0' NOT NULL,
	"total_net_disbursed" numeric(18, 2) DEFAULT '0' NOT NULL,
	"headcount" integer DEFAULT 0 NOT NULL,
	"created_by" uuid NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"idempotency_key" varchar(64) NOT NULL,
	"disbursed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "batches_tenant_code_unique" UNIQUE("tenant_id","batch_code"),
	CONSTRAINT "batches_tenant_idempotency_unique" UNIQUE("tenant_id","idempotency_key"),
	CONSTRAINT "batches_tenant_period_type_unique" UNIQUE("tenant_id","branch_id","period_month","batch_type","correction_seq"),
	CONSTRAINT "batches_type_check" CHECK ("payroll"."batches"."batch_type" in ('REGULAR','CORRECTION','THR','THIRTEENTH_MONTH')),
	CONSTRAINT "batches_status_check" CHECK ("payroll"."batches"."status" in ('DRAFT','CALCULATING','READY_FOR_APPROVAL','APPROVED','DISBURSING','DISBURSED','PARTIAL','REJECTED','CANCELLED','FAILED')),
	CONSTRAINT "batches_totals_check" CHECK ("payroll"."batches"."total_gross_amount" >= 0 AND "payroll"."batches"."total_net_disbursed" >= 0),
	CONSTRAINT "batches_sod_check" CHECK ("payroll"."batches"."approved_by" IS NULL OR "payroll"."batches"."approved_by" <> "payroll"."batches"."created_by")
);
--> statement-breakpoint
CREATE TABLE "governance"."branches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" varchar(16) NOT NULL,
	"name" varchar(100) NOT NULL,
	"region" varchar(50) NOT NULL,
	"monthly_disbursement_cap" numeric(18, 2) NOT NULL,
	"cap_policy_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branches_tenant_code_unique" UNIQUE("tenant_id","code"),
	CONSTRAINT "branches_cap_check" CHECK ("governance"."branches"."monthly_disbursement_cap" >= 0)
);
--> statement-breakpoint
CREATE TABLE "claims"."disbursements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"claim_id" uuid NOT NULL,
	"policy_version_id" uuid NOT NULL,
	"provider" varchar(24) NOT NULL,
	"provider_reference" varchar(80),
	"amount" numeric(18, 2) NOT NULL,
	"status" varchar(16) NOT NULL,
	"idempotency_key" varchar(64) NOT NULL,
	"requested_by" uuid NOT NULL,
	"approved_by" uuid NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"failure_reason" text,
	CONSTRAINT "claim_disbursements_tenant_idempotency_unique" UNIQUE("tenant_id","idempotency_key"),
	CONSTRAINT "claim_disbursements_provider_ref_unique" UNIQUE("tenant_id","provider","provider_reference"),
	CONSTRAINT "claim_disbursements_provider_check" CHECK ("claims"."disbursements"."provider" in ('MOCK','XENDIT','MIDTRANS')),
	CONSTRAINT "claim_disbursements_status_check" CHECK ("claims"."disbursements"."status" in ('PENDING','PROCESSING','PAID','FAILED','REVERSED')),
	CONSTRAINT "claim_disbursements_amount_check" CHECK ("claims"."disbursements"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "claims"."documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"claim_id" uuid NOT NULL,
	"document_type" varchar(32) NOT NULL,
	"cloudinary_public_id" varchar(255) NOT NULL,
	"secure_url" text NOT NULL,
	"mime_type" varchar(64) NOT NULL,
	"file_size_bytes" integer NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_type_check" CHECK ("claims"."documents"."document_type" in ('IDENTITY_CARD','MEDICAL_INVOICE','POLICE_REPORT','POLICY_CERT')),
	CONSTRAINT "documents_size_check" CHECK ("claims"."documents"."file_size_bytes" > 0 AND "claims"."documents"."file_size_bytes" <= 5242880)
);
--> statement-breakpoint
CREATE TABLE "payroll"."leave_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"personnel_id" uuid NOT NULL,
	"leave_type" varchar(24) NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"days" numeric(6, 2) NOT NULL,
	"status" varchar(16) NOT NULL,
	"reason" text,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leave_type_check" CHECK ("payroll"."leave_requests"."leave_type" in ('ANNUAL','SICK','MATERNITY','UNPAID','OTHER')),
	CONSTRAINT "leave_status_check" CHECK ("payroll"."leave_requests"."status" in ('PENDING','APPROVED','REJECTED','CANCELLED')),
	CONSTRAINT "leave_dates_check" CHECK ("payroll"."leave_requests"."end_date" >= "payroll"."leave_requests"."start_date"),
	CONSTRAINT "leave_days_check" CHECK ("payroll"."leave_requests"."days" > 0)
);
--> statement-breakpoint
CREATE TABLE "governance"."mfa_recovery_codes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"code_hash" char(64) NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mfa_codes_tenant_user_code_unique" UNIQUE("tenant_id","user_id","code_hash")
);
--> statement-breakpoint
CREATE TABLE "payroll"."items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"personnel_id" uuid NOT NULL,
	"gross_income" numeric(18, 2) NOT NULL,
	"variable_allowance" numeric(18, 2) DEFAULT '0' NOT NULL,
	"overtime_pay" numeric(18, 2) DEFAULT '0' NOT NULL,
	"agent_commission" numeric(18, 2) DEFAULT '0' NOT NULL,
	"unpaid_leave_deduction" numeric(18, 2) DEFAULT '0' NOT NULL,
	"absence_deduction" numeric(18, 2) DEFAULT '0' NOT NULL,
	"bpjs_kesehatan_deduction" numeric(18, 2) NOT NULL,
	"bpjs_ketenagakerjaan_deduction" numeric(18, 2) NOT NULL,
	"bpjs_jht_deduction" numeric(18, 2) NOT NULL,
	"bpjs_jp_deduction" numeric(18, 2) NOT NULL,
	"bpjs_kesehatan_employer" numeric(18, 2) DEFAULT '0' NOT NULL,
	"bpjs_jht_employer" numeric(18, 2) DEFAULT '0' NOT NULL,
	"bpjs_jp_employer" numeric(18, 2) DEFAULT '0' NOT NULL,
	"bpjs_jkk_employer" numeric(18, 2) DEFAULT '0' NOT NULL,
	"bpjs_jkm_employer" numeric(18, 2) DEFAULT '0' NOT NULL,
	"pph21_tax_deduction" numeric(18, 2) NOT NULL,
	"net_take_home_pay" numeric(18, 2) NOT NULL,
	"taxable_income" numeric(18, 2) NOT NULL,
	"ytd_gross" numeric(18, 2) DEFAULT '0' NOT NULL,
	"ytd_tax" numeric(18, 2) DEFAULT '0' NOT NULL,
	"payment_status" varchar(16) DEFAULT 'PENDING' NOT NULL,
	"payment_intent_id" uuid,
	"reconciliation_id" uuid,
	"calculation_breakdown" jsonb NOT NULL,
	CONSTRAINT "items_tenant_batch_personnel_unique" UNIQUE("tenant_id","batch_id","personnel_id"),
	CONSTRAINT "items_gross_check" CHECK ("payroll"."items"."gross_income" >= 0),
	CONSTRAINT "items_payment_status_check" CHECK ("payroll"."items"."payment_status" in ('PENDING','PROCESSING','PAID','FAILED','REVERSED'))
);
--> statement-breakpoint
CREATE TABLE "payroll"."payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"personnel_id" uuid NOT NULL,
	"policy_version_id" uuid NOT NULL,
	"provider" varchar(24) NOT NULL,
	"provider_reference" varchar(80),
	"amount" numeric(18, 2) NOT NULL,
	"status" varchar(16) NOT NULL,
	"idempotency_key" varchar(64) NOT NULL,
	"attempt_no" smallint DEFAULT 1 NOT NULL,
	"requested_by" uuid NOT NULL,
	"approved_by" uuid NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"failure_reason" text,
	CONSTRAINT "payments_tenant_batch_personnel_attempt_unique" UNIQUE("tenant_id","batch_id","personnel_id","attempt_no"),
	CONSTRAINT "payments_tenant_idempotency_unique" UNIQUE("tenant_id","idempotency_key"),
	CONSTRAINT "payments_provider_check" CHECK ("payroll"."payments"."provider" in ('MOCK','XENDIT','MIDTRANS')),
	CONSTRAINT "payments_status_check" CHECK ("payroll"."payments"."status" in ('PENDING','PROCESSING','PAID','FAILED','REVERSED')),
	CONSTRAINT "payments_amount_check" CHECK ("payroll"."payments"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "payroll"."payslips" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"personnel_id" uuid NOT NULL,
	"period_month" date NOT NULL,
	"version" smallint DEFAULT 1 NOT NULL,
	"secure_url" text NOT NULL,
	"snapshot_hash_sha256" char(64) NOT NULL,
	"file_checksum_sha256" char(64) NOT NULL,
	"verification_code" varchar(16) NOT NULL,
	"published_at" timestamp with time zone,
	"viewed_at" timestamp with time zone,
	"supersedes_id" uuid,
	CONSTRAINT "payslips_tenant_batch_personnel_version_unique" UNIQUE("tenant_id","batch_id","personnel_id","version")
);
--> statement-breakpoint
CREATE TABLE "payroll"."personnel" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"user_id" uuid,
	"personnel_code" varchar(32) NOT NULL,
	"personnel_type" varchar(16) NOT NULL,
	"full_name" varchar(120) NOT NULL,
	"nik_hash" char(64) NOT NULL,
	"nik_masked" varchar(20) NOT NULL,
	"bank_account_hash" char(64) NOT NULL,
	"bank_account_masked" varchar(24) NOT NULL,
	"bank_code" varchar(16) NOT NULL,
	"bank_name" varchar(64) NOT NULL,
	"ptkp_status" varchar(8) NOT NULL,
	"risk_class" varchar(8) NOT NULL,
	"employment_status" varchar(16) NOT NULL,
	"base_salary" numeric(18, 2) DEFAULT '0' NOT NULL,
	"fixed_allowance" numeric(18, 2) DEFAULT '0' NOT NULL,
	"join_date" date NOT NULL,
	"termination_date" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "personnel_tenant_code_unique" UNIQUE("tenant_id","personnel_code"),
	CONSTRAINT "personnel_tenant_nik_unique" UNIQUE("tenant_id","nik_hash"),
	CONSTRAINT "personnel_type_check" CHECK ("payroll"."personnel"."personnel_type" in ('EMPLOYEE','SALES_AGENT')),
	CONSTRAINT "personnel_ptkp_check" CHECK ("payroll"."personnel"."ptkp_status" in ('TK/0','TK/1','TK/2','TK/3','K/0','K/1','K/2','K/3')),
	CONSTRAINT "personnel_risk_class_check" CHECK ("payroll"."personnel"."risk_class" in ('I','II','III','IV','V')),
	CONSTRAINT "personnel_employment_check" CHECK ("payroll"."personnel"."employment_status" in ('PERMANENT','CONTRACT','PROBATION','INACTIVE')),
	CONSTRAINT "personnel_salary_check" CHECK ("payroll"."personnel"."base_salary" >= 0 AND "payroll"."personnel"."fixed_allowance" >= 0)
);
--> statement-breakpoint
CREATE TABLE "governance"."policy_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"domain" varchar(24) NOT NULL,
	"version_tag" varchar(32) NOT NULL,
	"status" varchar(16) NOT NULL,
	"rules_payload" jsonb NOT NULL,
	"checksum_sha256" char(64) NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"published_by" uuid,
	"approved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "policy_versions_tenant_domain_version_unique" UNIQUE("tenant_id","domain","version_tag"),
	CONSTRAINT "policy_versions_domain_check" CHECK ("governance"."policy_versions"."domain" in ('CLAIMS_POLICY','PAYROLL_TAX_POLICY')),
	CONSTRAINT "policy_versions_status_check" CHECK ("governance"."policy_versions"."status" in ('DRAFT','ACTIVE','ARCHIVED')),
	CONSTRAINT "policy_versions_dual_control_check" CHECK ("governance"."policy_versions"."status" <> 'ACTIVE' OR ("governance"."policy_versions"."approved_by" IS NOT NULL AND "governance"."policy_versions"."approved_by" <> "governance"."policy_versions"."published_by"))
);
--> statement-breakpoint
CREATE TABLE "governance"."refresh_tokens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" char(64) NOT NULL,
	"family_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"replaced_by" uuid,
	"user_agent" varchar(255),
	"ip_hash" char(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "payroll"."sales_achievements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"personnel_id" uuid NOT NULL,
	"period_month" date NOT NULL,
	"verified_sales" numeric(18, 2) NOT NULL,
	"verification_status" varchar(16) NOT NULL,
	"source" varchar(24) NOT NULL,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_achievements_tenant_personnel_period_unique" UNIQUE("tenant_id","personnel_id","period_month"),
	CONSTRAINT "sales_achievements_status_check" CHECK ("payroll"."sales_achievements"."verification_status" in ('PENDING','VERIFIED','REJECTED')),
	CONSTRAINT "sales_achievements_source_check" CHECK ("payroll"."sales_achievements"."source" in ('IMPORT','API','MANUAL')),
	CONSTRAINT "sales_achievements_amount_check" CHECK ("payroll"."sales_achievements"."verified_sales" >= 0)
);
--> statement-breakpoint
CREATE TABLE "claims"."submissions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"claim_number" varchar(32) NOT NULL,
	"branch_id" uuid NOT NULL,
	"policy_version_id" uuid NOT NULL,
	"claimant_name" varchar(120) NOT NULL,
	"claimant_nik_hash" char(64) NOT NULL,
	"claimant_nik_masked" varchar(20) NOT NULL,
	"bank_account_hash" char(64) NOT NULL,
	"bank_account_masked" varchar(24) NOT NULL,
	"claim_category" varchar(32) NOT NULL,
	"requested_amount" numeric(18, 2) NOT NULL,
	"approved_amount" numeric(18, 2),
	"risk_score" smallint DEFAULT 0 NOT NULL,
	"risk_evaluated_at" timestamp with time zone,
	"has_conflict_flag" boolean DEFAULT false NOT NULL,
	"status" varchar(24) NOT NULL,
	"compliance_reviewed_by" uuid,
	"compliance_reviewed_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"idempotency_key" varchar(64) NOT NULL,
	"submitted_at" timestamp with time zone,
	"finalized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "submissions_tenant_number_unique" UNIQUE("tenant_id","claim_number"),
	CONSTRAINT "submissions_tenant_idempotency_unique" UNIQUE("tenant_id","idempotency_key"),
	CONSTRAINT "submissions_category_check" CHECK ("claims"."submissions"."claim_category" in ('HEALTH','ACCIDENT','PROPERTY','GUARANTEE')),
	CONSTRAINT "submissions_status_check" CHECK ("claims"."submissions"."status" in ('DRAFT','SUBMITTED','RISK_PENDING','UNDER_REVIEW','RETURNED','ESCALATED','COMPLIANCE_REVIEW','APPROVED','REJECTED','DISBURSED')),
	CONSTRAINT "submissions_requested_amount_check" CHECK ("claims"."submissions"."requested_amount" >= 0),
	CONSTRAINT "submissions_risk_score_check" CHECK ("claims"."submissions"."risk_score" >= 0 AND "claims"."submissions"."risk_score" <= 100)
);
--> statement-breakpoint
CREATE TABLE "payroll"."tax_reconciliations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"personnel_id" uuid NOT NULL,
	"tax_year" smallint NOT NULL,
	"policy_version_id" uuid NOT NULL,
	"annual_gross" numeric(18, 2) NOT NULL,
	"ptkp_amount" numeric(18, 2) NOT NULL,
	"biaya_jabatan" numeric(18, 2) NOT NULL,
	"deductible_contributions" numeric(18, 2) NOT NULL,
	"annual_tax" numeric(18, 2) NOT NULL,
	"ter_credits" numeric(18, 2) NOT NULL,
	"difference" numeric(18, 2) NOT NULL,
	"status" varchar(16) NOT NULL,
	"version" smallint DEFAULT 1 NOT NULL,
	"settlement_batch_id" uuid,
	"settlement_item_id" uuid,
	"posted_by" uuid,
	"posted_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	CONSTRAINT "tax_reconciliations_tenant_personnel_year_version_unique" UNIQUE("tenant_id","personnel_id","tax_year","version"),
	CONSTRAINT "tax_reconciliations_status_check" CHECK ("payroll"."tax_reconciliations"."status" in ('DRAFT','POSTED','VOID')),
	CONSTRAINT "tax_reconciliations_difference_check" CHECK ("payroll"."tax_reconciliations"."difference" = "payroll"."tax_reconciliations"."annual_tax" - "payroll"."tax_reconciliations"."ter_credits"),
	CONSTRAINT "tax_reconciliations_sod_check" CHECK ("payroll"."tax_reconciliations"."posted_by" IS NULL OR "payroll"."tax_reconciliations"."posted_by" <> "payroll"."tax_reconciliations"."created_by")
);
--> statement-breakpoint
CREATE TABLE "payroll"."tax_reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"report_type" varchar(32) NOT NULL,
	"branch_id" uuid,
	"policy_version_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"version" smallint DEFAULT 1 NOT NULL,
	"status" varchar(16) NOT NULL,
	"file_url" text,
	"snapshot_hash_sha256" char(64),
	"file_checksum_sha256" char(64),
	"total_gross" numeric(18, 2) DEFAULT '0' NOT NULL,
	"total_employee_bpjs" numeric(18, 2) DEFAULT '0' NOT NULL,
	"total_employer_bpjs" numeric(18, 2) DEFAULT '0' NOT NULL,
	"total_pph21" numeric(18, 2) DEFAULT '0' NOT NULL,
	"total_net" numeric(18, 2) DEFAULT '0' NOT NULL,
	"headcount" integer DEFAULT 0 NOT NULL,
	"reconciliation_delta" numeric(18, 2) DEFAULT '0' NOT NULL,
	"totals" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"generated_by" uuid,
	"generated_at" timestamp with time zone,
	"error_message" text,
	"supersedes_id" uuid,
	CONSTRAINT "tax_reports_tenant_type_branch_period_version_unique" UNIQUE("tenant_id","report_type","branch_id","period_start","period_end","version"),
	CONSTRAINT "tax_reports_type_check" CHECK ("payroll"."tax_reports"."report_type" in ('PPH21_MONTHLY','PPH21_ANNUAL','BPJS_MONTHLY','BANK_FILE','PAYROLL_VARIANCE')),
	CONSTRAINT "tax_reports_status_check" CHECK ("payroll"."tax_reports"."status" in ('QUEUED','GENERATING','READY','FAILED')),
	CONSTRAINT "tax_reports_ready_check" CHECK ("payroll"."tax_reports"."status" <> 'READY' OR ("payroll"."tax_reports"."file_url" IS NOT NULL AND "payroll"."tax_reports"."file_checksum_sha256" IS NOT NULL AND "payroll"."tax_reports"."snapshot_hash_sha256" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "governance"."tenants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" varchar(24) NOT NULL,
	"name" varchar(120) NOT NULL,
	"status" varchar(16) DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_code_unique" UNIQUE("code"),
	CONSTRAINT "tenants_status_check" CHECK ("governance"."tenants"."status" in ('ACTIVE','SUSPENDED'))
);
--> statement-breakpoint
CREATE TABLE "governance"."users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"employee_number" varchar(32) NOT NULL,
	"full_name" varchar(120) NOT NULL,
	"email" varchar(150) NOT NULL,
	"password_hash" text NOT NULL,
	"mfa_secret_encrypted" text,
	"mfa_enabled" boolean DEFAULT false NOT NULL,
	"role" varchar(32) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_tenant_employee_unique" UNIQUE("tenant_id","employee_number"),
	CONSTRAINT "users_tenant_email_unique" UNIQUE("tenant_id","email"),
	CONSTRAINT "users_role_check" CHECK ("governance"."users"."role" in ('CLAIMS_OFFICER','HR_SPECIALIST','BRANCH_MANAGER','FINANCE_MANAGER','MIS_ANALYST','COMPLIANCE_ADMIN'))
);
--> statement-breakpoint
CREATE TABLE "analytics"."what_if_simulations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"simulation_name" varchar(120) NOT NULL,
	"base_policy_version_id" uuid NOT NULL,
	"simulated_rules_payload" jsonb NOT NULL,
	"target_period_start" date NOT NULL,
	"target_period_end" date NOT NULL,
	"actual_total_cost" numeric(18, 2) NOT NULL,
	"simulated_total_cost" numeric(18, 2) NOT NULL,
	"variance_amount" numeric(18, 2) NOT NULL,
	"variance_percentage" numeric(7, 4) NOT NULL,
	"impact_breakdown" jsonb NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "what_if_period_check" CHECK ("analytics"."what_if_simulations"."target_period_end" >= "analytics"."what_if_simulations"."target_period_start")
);
--> statement-breakpoint
ALTER TABLE "claims"."approval_steps" ADD CONSTRAINT "approval_steps_claim_id_submissions_id_fk" FOREIGN KEY ("claim_id") REFERENCES "claims"."submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll"."attendance_summaries" ADD CONSTRAINT "attendance_summaries_personnel_id_personnel_id_fk" FOREIGN KEY ("personnel_id") REFERENCES "payroll"."personnel"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims"."disbursements" ADD CONSTRAINT "disbursements_claim_id_submissions_id_fk" FOREIGN KEY ("claim_id") REFERENCES "claims"."submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims"."documents" ADD CONSTRAINT "documents_claim_id_submissions_id_fk" FOREIGN KEY ("claim_id") REFERENCES "claims"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll"."leave_requests" ADD CONSTRAINT "leave_requests_personnel_id_personnel_id_fk" FOREIGN KEY ("personnel_id") REFERENCES "payroll"."personnel"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance"."mfa_recovery_codes" ADD CONSTRAINT "mfa_recovery_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "governance"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll"."items" ADD CONSTRAINT "items_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "payroll"."batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll"."items" ADD CONSTRAINT "items_personnel_id_personnel_id_fk" FOREIGN KEY ("personnel_id") REFERENCES "payroll"."personnel"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll"."payments" ADD CONSTRAINT "payments_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "payroll"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll"."payments" ADD CONSTRAINT "payments_personnel_id_personnel_id_fk" FOREIGN KEY ("personnel_id") REFERENCES "payroll"."personnel"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll"."payslips" ADD CONSTRAINT "payslips_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "payroll"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll"."payslips" ADD CONSTRAINT "payslips_personnel_id_personnel_id_fk" FOREIGN KEY ("personnel_id") REFERENCES "payroll"."personnel"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance"."policy_versions" ADD CONSTRAINT "policy_versions_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "governance"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance"."policy_versions" ADD CONSTRAINT "policy_versions_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "governance"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance"."refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "governance"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll"."sales_achievements" ADD CONSTRAINT "sales_achievements_personnel_id_personnel_id_fk" FOREIGN KEY ("personnel_id") REFERENCES "payroll"."personnel"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll"."tax_reconciliations" ADD CONSTRAINT "tax_reconciliations_personnel_id_personnel_id_fk" FOREIGN KEY ("personnel_id") REFERENCES "payroll"."personnel"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance"."users" ADD CONSTRAINT "users_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "governance"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_anomaly_flags_tenant_claim" ON "analytics"."anomaly_flags" USING btree ("tenant_id","claim_id","severity");--> statement-breakpoint
CREATE INDEX "idx_approval_claim" ON "claims"."approval_steps" USING btree ("tenant_id","claim_id","step_level");--> statement-breakpoint
CREATE INDEX "idx_attendance_tenant_period" ON "payroll"."attendance_summaries" USING btree ("tenant_id","period_month","personnel_id");--> statement-breakpoint
CREATE INDEX "idx_audit_tenant_recorded" ON "governance"."audit_logs" USING btree ("tenant_id","recorded_at","id");--> statement-breakpoint
CREATE INDEX "idx_batches_tenant_period" ON "payroll"."batches" USING btree ("tenant_id","period_month","status");--> statement-breakpoint
CREATE INDEX "idx_claim_disbursements_status" ON "claims"."disbursements" USING btree ("tenant_id","status","requested_at");--> statement-breakpoint
CREATE INDEX "idx_payroll_items_batch_cover" ON "payroll"."items" USING btree ("tenant_id","batch_id");--> statement-breakpoint
CREATE INDEX "idx_payments_tenant_status" ON "payroll"."payments" USING btree ("tenant_id","status","requested_at");--> statement-breakpoint
CREATE INDEX "idx_payslips_tenant_personnel" ON "payroll"."payslips" USING btree ("tenant_id","personnel_id","period_month");--> statement-breakpoint
CREATE INDEX "idx_refresh_tenant_user" ON "governance"."refresh_tokens" USING btree ("tenant_id","user_id","expires_at");--> statement-breakpoint
CREATE INDEX "idx_claims_branch_status_date" ON "claims"."submissions" USING btree ("tenant_id","branch_id","status","created_at");--> statement-breakpoint
CREATE INDEX "idx_claims_conflict_lookup" ON "claims"."submissions" USING btree ("tenant_id","bank_account_hash","claimant_nik_hash");--> statement-breakpoint
CREATE INDEX "idx_tax_reports_tenant_type" ON "payroll"."tax_reports" USING btree ("tenant_id","report_type","period_start");