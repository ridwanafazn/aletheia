import { sql } from "drizzle-orm";
import { customType } from "drizzle-orm/pg-core";
import {
  bigserial,
  boolean,
  char,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgSchema,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const governance = pgSchema("governance");
export const claims = pgSchema("claims");
export const payroll = pgSchema("payroll");
export const analytics = pgSchema("analytics");

const money = (name: string) => numeric(name, { precision: 18, scale: 2 });
const rate = (name: string) => numeric(name, { precision: 7, scale: 4 });
const hash64 = (name: string) => char(name, { length: 64 });
const bytea = (name: string) =>
  customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" })(name);
const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();

const ptkpValues = sql`('TK/0','TK/1','TK/2','TK/3','K/0','K/1','K/2','K/3')`;
const riskClassValues = sql`('I','II','III','IV','V')`;
const paymentStatusValues = sql`('PENDING','PROCESSING','PAID','FAILED','REVERSED')`;

export const tenants = governance.table(
  "tenants",
  {
    id: uuid("id").primaryKey(),
    code: varchar("code", { length: 24 }).notNull().unique(),
    name: varchar("name", { length: 120 }).notNull(),
    status: varchar("status", { length: 16 }).notNull().default("ACTIVE"),
    plan: varchar("plan", { length: 16 }).notNull().default("ENTERPRISE"),
    createdAt: createdAt(),
  },
  (table) => [
    check("tenants_status_check", sql`${table.status} in ('ACTIVE','SUSPENDED')`),
    check(
      "tenants_plan_check",
      sql`${table.plan} in ('BASIC','HRIS_PLUS','HRIS_PRO','ENTERPRISE')`,
    ),
  ],
);

export const branches = governance.table(
  "branches",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    code: varchar("code", { length: 16 }).notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    region: varchar("region", { length: 50 }).notNull(),
    monthlyDisbursementCap: money("monthly_disbursement_cap").notNull(),
    capPolicyVersionId: uuid("cap_policy_version_id"),
    createdAt: createdAt(),
  },
  (table) => [
    unique("branches_tenant_code_unique").on(table.tenantId, table.code),
    check("branches_cap_check", sql`${table.monthlyDisbursementCap} >= 0`),
  ],
);

export const departments = governance.table(
  "departments",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    code: varchar("code", { length: 24 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    unique("departments_tenant_code_unique").on(table.tenantId, table.code),
    index("idx_departments_tenant").on(table.tenantId, table.code),
  ],
);

export const positions = governance.table(
  "positions",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    code: varchar("code", { length: 24 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    jobLevel: varchar("job_level", { length: 16 }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    unique("positions_tenant_code_unique").on(table.tenantId, table.code),
    check(
      "positions_job_level_check",
      sql`${table.jobLevel} in ('STAFF','SUPERVISOR','MANAGER','DIRECTOR')`,
    ),
    index("idx_positions_tenant").on(table.tenantId, table.code),
  ],
);

export const users = governance.table(
  "users",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    employeeNumber: varchar("employee_number", { length: 32 }).notNull(),
    fullName: varchar("full_name", { length: 120 }).notNull(),
    email: varchar("email", { length: 150 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    mfaSecretEncrypted: text("mfa_secret_encrypted"),
    mfaEnabled: boolean("mfa_enabled").notNull().default(false),
    role: varchar("role", { length: 32 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
  },
  (table) => [
    unique("users_tenant_employee_unique").on(table.tenantId, table.employeeNumber),
    unique("users_tenant_email_unique").on(table.tenantId, table.email),
    check(
      "users_role_check",
      sql`${table.role} in ('CLAIMS_OFFICER','HR_SPECIALIST','BRANCH_MANAGER','FINANCE_MANAGER','MIS_ANALYST','COMPLIANCE_ADMIN','EMPLOYEE')`,
    ),
  ],
);

export const policyVersions = governance.table(
  "policy_versions",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    domain: varchar("domain", { length: 24 }).notNull(),
    versionTag: varchar("version_tag", { length: 32 }).notNull(),
    status: varchar("status", { length: 16 }).notNull(),
    rulesPayload: jsonb("rules_payload").$type<Record<string, unknown>>().notNull(),
    checksumSha256: hash64("checksum_sha256").notNull(),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
    publishedBy: uuid("published_by").references(() => users.id),
    approvedBy: uuid("approved_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (table) => [
    unique("policy_versions_tenant_domain_version_unique").on(
      table.tenantId,
      table.domain,
      table.versionTag,
    ),
    check(
      "policy_versions_domain_check",
      sql`${table.domain} in ('CLAIMS_POLICY','PAYROLL_TAX_POLICY','PAYROLL_COST_POLICY')`,
    ),
    check("policy_versions_status_check", sql`${table.status} in ('DRAFT','ACTIVE','ARCHIVED')`),
    check(
      "policy_versions_dual_control_check",
      sql`${table.status} <> 'ACTIVE' OR (${table.approvedBy} IS NOT NULL AND ${table.approvedBy} <> ${table.publishedBy})`,
    ),
  ],
);

export const auditLogs = governance.table(
  "audit_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    eventUuid: uuid("event_uuid").notNull(),
    correlationId: uuid("correlation_id").notNull(),
    actorId: uuid("actor_id").notNull(),
    actorRole: varchar("actor_role", { length: 32 }).notNull(),
    domain: varchar("domain", { length: 32 }).notNull(),
    entityType: varchar("entity_type", { length: 48 }).notNull(),
    entityId: uuid("entity_id").notNull(),
    action: varchar("action", { length: 48 }).notNull(),
    policyVersionId: uuid("policy_version_id"),
    decisionContext: jsonb("decision_context").$type<Record<string, unknown>>().notNull(),
    prevRecordHash: hash64("prev_record_hash").notNull(),
    recordHash: hash64("record_hash").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("audit_logs_tenant_event_unique").on(table.tenantId, table.eventUuid),
    index("idx_audit_tenant_recorded").on(table.tenantId, table.recordedAt, table.id),
  ],
);

export const refreshTokens = governance.table(
  "refresh_tokens",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    tokenHash: hash64("token_hash").notNull().unique(),
    familyId: uuid("family_id").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    replacedBy: uuid("replaced_by"),
    userAgent: varchar("user_agent", { length: 255 }),
    ipHash: hash64("ip_hash"),
    createdAt: createdAt(),
  },
  (table) => [index("idx_refresh_tenant_user").on(table.tenantId, table.userId, table.expiresAt)],
);

export const mfaRecoveryCodes = governance.table(
  "mfa_recovery_codes",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    codeHash: hash64("code_hash").notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    unique("mfa_codes_tenant_user_code_unique").on(table.tenantId, table.userId, table.codeHash),
  ],
);

export const idempotencyRecords = governance.table(
  "idempotency_records",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    actorId: uuid("actor_id").notNull(),
    scope: varchar("scope", { length: 120 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 64 }).notNull(),
    requestHash: hash64("request_hash").notNull(),
    status: varchar("status", { length: 16 }).notNull().default("IN_PROGRESS"),
    responseStatus: integer("response_status"),
    responseBody: jsonb("response_body").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    unique("idempotency_scope_key_unique").on(
      table.tenantId,
      table.actorId,
      table.scope,
      table.idempotencyKey,
    ),
    check("idempotency_status_check", sql`${table.status} in ('IN_PROGRESS','COMPLETED')`),
    index("idx_idempotency_created").on(table.tenantId, table.createdAt),
  ],
);

export const submissions = claims.table(
  "submissions",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    claimNumber: varchar("claim_number", { length: 32 }).notNull(),
    branchId: uuid("branch_id").notNull(),
    policyVersionId: uuid("policy_version_id").notNull(),
    claimantName: varchar("claimant_name", { length: 120 }).notNull(),
    claimantNikHash: hash64("claimant_nik_hash").notNull(),
    claimantNikMasked: varchar("claimant_nik_masked", { length: 20 }).notNull(),
    bankAccountHash: hash64("bank_account_hash").notNull(),
    bankAccountMasked: varchar("bank_account_masked", { length: 24 }).notNull(),
    claimCategory: varchar("claim_category", { length: 32 }).notNull(),
    requestedAmount: money("requested_amount").notNull(),
    approvedAmount: money("approved_amount"),
    riskScore: smallint("risk_score").notNull().default(0),
    riskEvaluatedAt: timestamp("risk_evaluated_at", { withTimezone: true }),
    hasConflictFlag: boolean("has_conflict_flag").notNull().default(false),
    status: varchar("status", { length: 24 }).notNull(),
    complianceReviewedBy: uuid("compliance_reviewed_by"),
    complianceReviewedAt: timestamp("compliance_reviewed_at", { withTimezone: true }),
    createdBy: uuid("created_by").notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 64 }).notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("submissions_tenant_number_unique").on(table.tenantId, table.claimNumber),
    unique("submissions_tenant_idempotency_unique").on(table.tenantId, table.idempotencyKey),
    check(
      "submissions_category_check",
      sql`${table.claimCategory} in ('HEALTH','ACCIDENT','PROPERTY','GUARANTEE')`,
    ),
    check(
      "submissions_status_check",
      sql`${table.status} in ('DRAFT','SUBMITTED','RISK_PENDING','UNDER_REVIEW','RETURNED','ESCALATED','COMPLIANCE_REVIEW','APPROVED','REJECTED','DISBURSED')`,
    ),
    check("submissions_requested_amount_check", sql`${table.requestedAmount} >= 0`),
    check(
      "submissions_risk_score_check",
      sql`${table.riskScore} >= 0 AND ${table.riskScore} <= 100`,
    ),
    index("idx_claims_branch_status_date").on(
      table.tenantId,
      table.branchId,
      table.status,
      table.createdAt,
    ),
    index("idx_claims_conflict_lookup").on(
      table.tenantId,
      table.bankAccountHash,
      table.claimantNikHash,
    ),
  ],
);

export const documents = claims.table(
  "documents",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    claimId: uuid("claim_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    documentType: varchar("document_type", { length: 32 }).notNull(),
    cloudinaryPublicId: varchar("cloudinary_public_id", { length: 255 }).notNull(),
    secureUrl: text("secure_url").notNull(),
    mimeType: varchar("mime_type", { length: 64 }).notNull(),
    fileSizeBytes: integer("file_size_bytes").notNull(),
    uploadedBy: uuid("uploaded_by").notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      "documents_type_check",
      sql`${table.documentType} in ('IDENTITY_CARD','MEDICAL_INVOICE','POLICE_REPORT','POLICY_CERT')`,
    ),
    check(
      "documents_size_check",
      sql`${table.fileSizeBytes} > 0 AND ${table.fileSizeBytes} <= 5242880`,
    ),
  ],
);

export const approvalSteps = claims.table(
  "approval_steps",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    claimId: uuid("claim_id")
      .notNull()
      .references(() => submissions.id),
    stepLevel: smallint("step_level").notNull(),
    approverId: uuid("approver_id").notNull(),
    decision: varchar("decision", { length: 16 }).notNull(),
    reasonNotes: text("reason_notes").notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("approval_steps_level_check", sql`${table.stepLevel} in (1, 2)`),
    check(
      "approval_steps_decision_check",
      sql`${table.decision} in ('APPROVED','REJECTED','RETURNED')`,
    ),
    check("approval_steps_reason_check", sql`char_length(${table.reasonNotes}) >= 15`),
    index("idx_approval_claim").on(table.tenantId, table.claimId, table.stepLevel),
  ],
);

export const claimDisbursements = claims.table(
  "disbursements",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    claimId: uuid("claim_id")
      .notNull()
      .references(() => submissions.id),
    policyVersionId: uuid("policy_version_id").notNull(),
    provider: varchar("provider", { length: 24 }).notNull(),
    providerReference: varchar("provider_reference", { length: 80 }),
    amount: money("amount").notNull(),
    status: varchar("status", { length: 16 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 64 }).notNull(),
    requestedBy: uuid("requested_by").notNull(),
    approvedBy: uuid("approved_by").notNull(),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    failureReason: text("failure_reason"),
  },
  (table) => [
    unique("claim_disbursements_tenant_idempotency_unique").on(
      table.tenantId,
      table.idempotencyKey,
    ),
    unique("claim_disbursements_provider_ref_unique").on(
      table.tenantId,
      table.provider,
      table.providerReference,
    ),
    check(
      "claim_disbursements_provider_check",
      sql`${table.provider} in ('MOCK','XENDIT','MIDTRANS')`,
    ),
    check("claim_disbursements_status_check", sql`${table.status} in ${paymentStatusValues}`),
    check("claim_disbursements_amount_check", sql`${table.amount} >= 0`),
    index("idx_claim_disbursements_status").on(table.tenantId, table.status, table.requestedAt),
  ],
);

export const personnel = payroll.table(
  "personnel",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    departmentId: uuid("department_id").references(() => departments.id),
    positionId: uuid("position_id").references(() => positions.id),
    supervisorId: uuid("supervisor_id"),
    userId: uuid("user_id"),
    personnelCode: varchar("personnel_code", { length: 32 }).notNull(),
    personnelType: varchar("personnel_type", { length: 16 }).notNull(),
    fullName: varchar("full_name", { length: 120 }).notNull(),
    nikHash: hash64("nik_hash").notNull(),
    nikMasked: varchar("nik_masked", { length: 20 }).notNull(),
    bankAccountHash: hash64("bank_account_hash").notNull(),
    bankAccountMasked: varchar("bank_account_masked", { length: 24 }).notNull(),
    bankCode: varchar("bank_code", { length: 16 }).notNull(),
    bankName: varchar("bank_name", { length: 64 }).notNull(),
    ptkpStatus: varchar("ptkp_status", { length: 8 }).notNull(),
    riskClass: varchar("risk_class", { length: 8 }).notNull(),
    employmentStatus: varchar("employment_status", { length: 16 }).notNull(),
    baseSalary: money("base_salary").notNull().default("0"),
    fixedAllowance: money("fixed_allowance").notNull().default("0"),
    joinDate: date("join_date").notNull(),
    terminationDate: date("termination_date"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
  },
  (table) => [
    unique("personnel_tenant_code_unique").on(table.tenantId, table.personnelCode),
    unique("personnel_tenant_nik_unique").on(table.tenantId, table.nikHash),
    uniqueIndex("personnel_tenant_user_unique")
      .on(table.tenantId, table.userId)
      .where(sql`${table.userId} is not null`),
    check("personnel_type_check", sql`${table.personnelType} in ('EMPLOYEE','SALES_AGENT')`),
    check("personnel_ptkp_check", sql`${table.ptkpStatus} in ${ptkpValues}`),
    check("personnel_risk_class_check", sql`${table.riskClass} in ${riskClassValues}`),
    check(
      "personnel_employment_check",
      sql`${table.employmentStatus} in ('PERMANENT','CONTRACT','PROBATION','INACTIVE')`,
    ),
    check("personnel_salary_check", sql`${table.baseSalary} >= 0 AND ${table.fixedAllowance} >= 0`),
  ],
);

export const salesAchievements = payroll.table(
  "sales_achievements",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    personnelId: uuid("personnel_id")
      .notNull()
      .references(() => personnel.id),
    periodMonth: date("period_month").notNull(),
    verifiedSales: money("verified_sales").notNull(),
    verificationStatus: varchar("verification_status", { length: 16 }).notNull(),
    source: varchar("source", { length: 24 }).notNull(),
    verifiedBy: uuid("verified_by"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    unique("sales_achievements_tenant_personnel_period_unique").on(
      table.tenantId,
      table.personnelId,
      table.periodMonth,
    ),
    check(
      "sales_achievements_status_check",
      sql`${table.verificationStatus} in ('PENDING','VERIFIED','REJECTED')`,
    ),
    check("sales_achievements_source_check", sql`${table.source} in ('IMPORT','API','MANUAL')`),
    check("sales_achievements_amount_check", sql`${table.verifiedSales} >= 0`),
  ],
);

export const batches = payroll.table(
  "batches",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    batchCode: varchar("batch_code", { length: 32 }).notNull(),
    branchId: uuid("branch_id").notNull(),
    periodMonth: date("period_month").notNull(),
    batchType: varchar("batch_type", { length: 24 }).notNull(),
    correctionSeq: smallint("correction_seq").notNull().default(0),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    calculatedAt: timestamp("calculated_at", { withTimezone: true }),
    calculationVersion: varchar("calculation_version", { length: 16 }),
    varianceVsBatchId: uuid("variance_vs_batch_id"),
    policyVersionId: uuid("policy_version_id").notNull(),
    status: varchar("status", { length: 24 }).notNull(),
    totalGrossAmount: money("total_gross_amount").notNull().default("0"),
    totalTaxPph21: money("total_tax_pph21").notNull().default("0"),
    totalBpjsDeduction: money("total_bpjs_deduction").notNull().default("0"),
    totalBpjsEmployer: money("total_bpjs_employer").notNull().default("0"),
    totalNetDisbursed: money("total_net_disbursed").notNull().default("0"),
    headcount: integer("headcount").notNull().default(0),
    createdBy: uuid("created_by").notNull(),
    approvedBy: uuid("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    idempotencyKey: varchar("idempotency_key", { length: 64 }).notNull(),
    disbursedAt: timestamp("disbursed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    unique("batches_tenant_code_unique").on(table.tenantId, table.batchCode),
    unique("batches_tenant_idempotency_unique").on(table.tenantId, table.idempotencyKey),
    unique("batches_tenant_period_type_unique").on(
      table.tenantId,
      table.branchId,
      table.periodMonth,
      table.batchType,
      table.correctionSeq,
    ),
    check(
      "batches_type_check",
      sql`${table.batchType} in ('REGULAR','CORRECTION','THR','THIRTEENTH_MONTH')`,
    ),
    check(
      "batches_status_check",
      sql`${table.status} in ('DRAFT','CALCULATING','READY_FOR_APPROVAL','APPROVED','DISBURSING','DISBURSED','PARTIAL','REJECTED','CANCELLED','FAILED')`,
    ),
    check(
      "batches_totals_check",
      sql`${table.totalGrossAmount} >= 0 AND ${table.totalNetDisbursed} >= 0`,
    ),
    check(
      "batches_sod_check",
      sql`${table.approvedBy} IS NULL OR ${table.approvedBy} <> ${table.createdBy}`,
    ),
    index("idx_batches_tenant_period").on(table.tenantId, table.periodMonth, table.status),
  ],
);

export const payrollItems = payroll.table(
  "items",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => batches.id, { onDelete: "cascade" }),
    personnelId: uuid("personnel_id")
      .notNull()
      .references(() => personnel.id),
    grossIncome: money("gross_income").notNull(),
    variableAllowance: money("variable_allowance").notNull().default("0"),
    overtimePay: money("overtime_pay").notNull().default("0"),
    agentCommission: money("agent_commission").notNull().default("0"),
    unpaidLeaveDeduction: money("unpaid_leave_deduction").notNull().default("0"),
    absenceDeduction: money("absence_deduction").notNull().default("0"),
    bpjsKesehatanDeduction: money("bpjs_kesehatan_deduction").notNull(),
    bpjsKetenagakerjaanDeduction: money("bpjs_ketenagakerjaan_deduction").notNull(),
    bpjsJhtDeduction: money("bpjs_jht_deduction").notNull(),
    bpjsJpDeduction: money("bpjs_jp_deduction").notNull(),
    bpjsKesehatanEmployer: money("bpjs_kesehatan_employer").notNull().default("0"),
    bpjsJhtEmployer: money("bpjs_jht_employer").notNull().default("0"),
    bpjsJpEmployer: money("bpjs_jp_employer").notNull().default("0"),
    bpjsJkkEmployer: money("bpjs_jkk_employer").notNull().default("0"),
    bpjsJkmEmployer: money("bpjs_jkm_employer").notNull().default("0"),
    pph21TaxDeduction: money("pph21_tax_deduction").notNull(),
    netTakeHomePay: money("net_take_home_pay").notNull(),
    taxableIncome: money("taxable_income").notNull(),
    ytdGross: money("ytd_gross").notNull().default("0"),
    ytdTax: money("ytd_tax").notNull().default("0"),
    paymentStatus: varchar("payment_status", { length: 16 }).notNull().default("PENDING"),
    paymentIntentId: uuid("payment_intent_id"),
    reconciliationId: uuid("reconciliation_id"),
    calculationBreakdown: jsonb("calculation_breakdown").$type<Record<string, unknown>>().notNull(),
  },
  (table) => [
    unique("items_tenant_batch_personnel_unique").on(
      table.tenantId,
      table.batchId,
      table.personnelId,
    ),
    check("items_gross_check", sql`${table.grossIncome} >= 0`),
    check("items_payment_status_check", sql`${table.paymentStatus} in ${paymentStatusValues}`),
    index("idx_payroll_items_batch_cover").on(table.tenantId, table.batchId),
  ],
);

export const attendanceSummaries = payroll.table(
  "attendance_summaries",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    personnelId: uuid("personnel_id")
      .notNull()
      .references(() => personnel.id),
    periodMonth: date("period_month").notNull(),
    workingDays: smallint("working_days").notNull().default(0),
    presentDays: smallint("present_days").notNull().default(0),
    paidLeaveDays: smallint("paid_leave_days").notNull().default(0),
    unpaidLeaveDays: smallint("unpaid_leave_days").notNull().default(0),
    absentDays: smallint("absent_days").notNull().default(0),
    overtimeHours: numeric("overtime_hours", { precision: 8, scale: 2 }).notNull().default("0"),
    source: varchar("source", { length: 16 }).notNull(),
    approvedBy: uuid("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("attendance_tenant_personnel_period_unique").on(
      table.tenantId,
      table.personnelId,
      table.periodMonth,
    ),
    check(
      "attendance_days_check",
      sql`${table.unpaidLeaveDays} >= 0 AND ${table.unpaidLeaveDays} <= ${table.workingDays} AND ${table.overtimeHours} >= 0`,
    ),
    index("idx_attendance_tenant_period").on(table.tenantId, table.periodMonth, table.personnelId),
  ],
);

export const leaveRequests = payroll.table(
  "leave_requests",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    personnelId: uuid("personnel_id")
      .notNull()
      .references(() => personnel.id),
    createdBy: uuid("created_by"),
    leaveType: varchar("leave_type", { length: 24 }).notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    days: numeric("days", { precision: 6, scale: 2 }).notNull(),
    status: varchar("status", { length: 16 }).notNull(),
    reason: text("reason"),
    decidedBy: uuid("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNotes: text("decision_notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check(
      "leave_type_check",
      sql`${table.leaveType} in ('ANNUAL','SICK','MATERNITY','UNPAID','OTHER')`,
    ),
    check(
      "leave_status_check",
      sql`${table.status} in ('PENDING','APPROVED','REJECTED','CANCELLED')`,
    ),
    check("leave_dates_check", sql`${table.endDate} >= ${table.startDate}`),
    check("leave_days_check", sql`${table.days} > 0`),
  ],
);

export const leaveBalances = payroll.table(
  "leave_balances",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    personnelId: uuid("personnel_id")
      .notNull()
      .references(() => personnel.id),
    leaveType: varchar("leave_type", { length: 24 }).notNull(),
    year: smallint("year").notNull(),
    entitlementDays: numeric("entitlement_days", { precision: 6, scale: 2 }).notNull().default("0"),
    usedDays: numeric("used_days", { precision: 6, scale: 2 }).notNull().default("0"),
    pendingDays: numeric("pending_days", { precision: 6, scale: 2 }).notNull().default("0"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("leave_balances_tenant_personnel_type_year_unique").on(
      table.tenantId,
      table.personnelId,
      table.leaveType,
      table.year,
    ),
    check(
      "leave_balances_type_check",
      sql`${table.leaveType} in ('ANNUAL','SICK','MATERNITY','UNPAID','OTHER')`,
    ),
    check("leave_balances_year_check", sql`${table.year} between 2000 and 2100`),
    check(
      "leave_balances_days_check",
      sql`${table.entitlementDays} >= 0 AND ${table.usedDays} >= 0 AND ${table.pendingDays} >= 0 AND ${table.usedDays} + ${table.pendingDays} <= ${table.entitlementDays}`,
    ),
    index("idx_leave_balances_tenant_personnel_year").on(
      table.tenantId,
      table.personnelId,
      table.year,
    ),
  ],
);

export const overtimeRequests = payroll.table(
  "overtime_requests",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    personnelId: uuid("personnel_id")
      .notNull()
      .references(() => personnel.id),
    workDate: date("work_date").notNull(),
    hours: numeric("hours", { precision: 5, scale: 2 }).notNull(),
    reason: text("reason").notNull(),
    status: varchar("status", { length: 16 }).notNull(),
    decidedBy: uuid("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNotes: text("decision_notes"),
    createdBy: uuid("created_by").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("overtime_requests_tenant_personnel_date_unique").on(
      table.tenantId,
      table.personnelId,
      table.workDate,
    ),
    check(
      "overtime_status_check",
      sql`${table.status} in ('PENDING','APPROVED','REJECTED','CANCELLED')`,
    ),
    check("overtime_hours_check", sql`${table.hours} > 0 AND ${table.hours} <= 24`),
    index("idx_overtime_requests_tenant_status_date").on(
      table.tenantId,
      table.status,
      table.workDate,
    ),
  ],
);

export const reimbursements = payroll.table(
  "reimbursements",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    personnelId: uuid("personnel_id")
      .notNull()
      .references(() => personnel.id),
    category: varchar("category", { length: 24 }).notNull(),
    expenseDate: date("expense_date").notNull(),
    amount: money("amount").notNull(),
    description: text("description").notNull(),
    receiptUrl: text("receipt_url"),
    receiptPublicId: text("receipt_public_id"),
    status: varchar("status", { length: 16 }).notNull(),
    decidedBy: uuid("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNotes: text("decision_notes"),
    paidBy: uuid("paid_by"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdBy: uuid("created_by").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check(
      "reimbursements_category_check",
      sql`${table.category} in ('TRANSPORT','MEAL','MEDICAL','OTHER')`,
    ),
    check(
      "reimbursements_status_check",
      sql`${table.status} in ('PENDING','APPROVED','REJECTED','PAID')`,
    ),
    check("reimbursements_amount_check", sql`${table.amount} > 0`),
    index("idx_reimbursements_tenant_status_date").on(
      table.tenantId,
      table.status,
      table.expenseDate,
    ),
    index("idx_reimbursements_tenant_personnel").on(table.tenantId, table.personnelId),
  ],
);

export const payslips = payroll.table(
  "payslips",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => batches.id),
    personnelId: uuid("personnel_id")
      .notNull()
      .references(() => personnel.id),
    periodMonth: date("period_month").notNull(),
    version: smallint("version").notNull().default(1),
    secureUrl: text("secure_url").notNull(),
    snapshotHashSha256: hash64("snapshot_hash_sha256").notNull(),
    fileChecksumSha256: hash64("file_checksum_sha256").notNull(),
    grossIncome: money("gross_income").notNull().default("0"),
    netTakeHomePay: money("net_take_home_pay").notNull().default("0"),
    verificationCode: varchar("verification_code", { length: 16 }).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    viewedAt: timestamp("viewed_at", { withTimezone: true }),
    supersedesId: uuid("supersedes_id"),
    sourceEventId: uuid("source_event_id"),
  },
  (table) => [
    unique("payslips_tenant_batch_personnel_version_unique").on(
      table.tenantId,
      table.batchId,
      table.personnelId,
      table.version,
    ),
    index("idx_payslips_tenant_personnel").on(table.tenantId, table.personnelId, table.periodMonth),
  ],
);

export const taxReports = payroll.table(
  "tax_reports",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    reportType: varchar("report_type", { length: 32 }).notNull(),
    branchId: uuid("branch_id"),
    policyVersionId: uuid("policy_version_id").notNull(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    version: smallint("version").notNull().default(1),
    status: varchar("status", { length: 16 }).notNull(),
    fileUrl: text("file_url"),
    snapshotHashSha256: hash64("snapshot_hash_sha256"),
    fileChecksumSha256: hash64("file_checksum_sha256"),
    totalGross: money("total_gross").notNull().default("0"),
    totalEmployeeBpjs: money("total_employee_bpjs").notNull().default("0"),
    totalEmployerBpjs: money("total_employer_bpjs").notNull().default("0"),
    totalPph21: money("total_pph21").notNull().default("0"),
    totalNet: money("total_net").notNull().default("0"),
    headcount: integer("headcount").notNull().default(0),
    reconciliationDelta: money("reconciliation_delta").notNull().default("0"),
    totals: jsonb("totals").$type<Record<string, unknown>>().notNull().default({}),
    generatedBy: uuid("generated_by"),
    generatedAt: timestamp("generated_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    supersedesId: uuid("supersedes_id"),
    sourceEventId: uuid("source_event_id"),
  },
  (table) => [
    unique("tax_reports_tenant_type_branch_period_version_unique").on(
      table.tenantId,
      table.reportType,
      table.branchId,
      table.periodStart,
      table.periodEnd,
      table.version,
    ),
    check(
      "tax_reports_type_check",
      sql`${table.reportType} in ('PPH21_MONTHLY','PPH21_ANNUAL','BPJS_MONTHLY','BANK_FILE','PAYROLL_VARIANCE','PAYROLL_COST_INVOICE')`,
    ),
    check(
      "tax_reports_status_check",
      sql`${table.status} in ('QUEUED','GENERATING','READY','FAILED')`,
    ),
    check(
      "tax_reports_ready_check",
      sql`${table.status} <> 'READY' OR (${table.fileUrl} IS NOT NULL AND ${table.fileChecksumSha256} IS NOT NULL AND ${table.snapshotHashSha256} IS NOT NULL)`,
    ),
    index("idx_tax_reports_tenant_type").on(table.tenantId, table.reportType, table.periodStart),
  ],
);

export const generatedFiles = payroll.table(
  "generated_files",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    kind: varchar("kind", { length: 24 }).notNull(),
    entityId: uuid("entity_id").notNull(),
    fileName: varchar("file_name", { length: 160 }).notNull(),
    mimeType: varchar("mime_type", { length: 64 }).notNull(),
    fileSize: integer("file_size").notNull(),
    content: bytea("content").notNull(),
    checksumSha256: hash64("checksum_sha256").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    unique("generated_files_tenant_kind_entity_unique").on(
      table.tenantId,
      table.kind,
      table.entityId,
    ),
    check("generated_files_kind_check", sql`${table.kind} in ('PAYSLIP','REPORT')`),
    check("generated_files_size_check", sql`${table.fileSize} > 0`),
    index("idx_generated_files_tenant_entity").on(table.tenantId, table.entityId),
  ],
);

export const paymentWebhookEvents = payroll.table(
  "payment_webhook_events",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    provider: varchar("provider", { length: 24 }).notNull(),
    eventId: varchar("event_id", { length: 128 }).notNull(),
    paymentId: uuid("payment_id").notNull(),
    eventType: varchar("event_type", { length: 32 }).notNull(),
    status: varchar("status", { length: 16 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    processedAt: createdAt(),
  },
  (table) => [
    unique("payment_webhook_events_tenant_provider_event_unique").on(
      table.tenantId,
      table.provider,
      table.eventId,
    ),
    check(
      "payment_webhook_events_provider_check",
      sql`${table.provider} in ('MOCK','XENDIT','MIDTRANS')`,
    ),
  ],
);

export const taxReconciliations = payroll.table(
  "tax_reconciliations",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    personnelId: uuid("personnel_id")
      .notNull()
      .references(() => personnel.id),
    taxYear: smallint("tax_year").notNull(),
    policyVersionId: uuid("policy_version_id").notNull(),
    annualGross: money("annual_gross").notNull(),
    ptkpAmount: money("ptkp_amount").notNull(),
    biayaJabatan: money("biaya_jabatan").notNull(),
    deductibleContributions: money("deductible_contributions").notNull(),
    annualTax: money("annual_tax").notNull(),
    terCredits: money("ter_credits").notNull(),
    difference: money("difference").notNull(),
    status: varchar("status", { length: 16 }).notNull(),
    version: smallint("version").notNull().default(1),
    settlementBatchId: uuid("settlement_batch_id"),
    settlementItemId: uuid("settlement_item_id"),
    postedBy: uuid("posted_by"),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    createdBy: uuid("created_by").notNull(),
  },
  (table) => [
    unique("tax_reconciliations_tenant_personnel_year_version_unique").on(
      table.tenantId,
      table.personnelId,
      table.taxYear,
      table.version,
    ),
    check("tax_reconciliations_status_check", sql`${table.status} in ('DRAFT','POSTED','VOID')`),
    check(
      "tax_reconciliations_difference_check",
      sql`${table.difference} = ${table.annualTax} - ${table.terCredits}`,
    ),
    check(
      "tax_reconciliations_sod_check",
      sql`${table.postedBy} IS NULL OR ${table.postedBy} <> ${table.createdBy}`,
    ),
  ],
);

export const payrollPayments = payroll.table(
  "payments",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => batches.id),
    personnelId: uuid("personnel_id")
      .notNull()
      .references(() => personnel.id),
    policyVersionId: uuid("policy_version_id").notNull(),
    provider: varchar("provider", { length: 24 }).notNull(),
    providerReference: varchar("provider_reference", { length: 80 }),
    amount: money("amount").notNull(),
    status: varchar("status", { length: 16 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 64 }).notNull(),
    attemptNo: smallint("attempt_no").notNull().default(1),
    requestedBy: uuid("requested_by").notNull(),
    approvedBy: uuid("approved_by").notNull(),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    failureReason: text("failure_reason"),
  },
  (table) => [
    unique("payments_tenant_batch_personnel_attempt_unique").on(
      table.tenantId,
      table.batchId,
      table.personnelId,
      table.attemptNo,
    ),
    unique("payments_tenant_idempotency_unique").on(table.tenantId, table.idempotencyKey),
    check("payments_provider_check", sql`${table.provider} in ('MOCK','XENDIT','MIDTRANS')`),
    check("payments_status_check", sql`${table.status} in ${paymentStatusValues}`),
    check("payments_amount_check", sql`${table.amount} >= 0`),
    index("idx_payments_tenant_status").on(table.tenantId, table.status, table.requestedAt),
  ],
);

export const anomalyFlags = analytics.table(
  "anomaly_flags",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    claimId: uuid("claim_id").notNull(),
    matchedPersonnelId: uuid("matched_personnel_id"),
    matchedClaimId: uuid("matched_claim_id"),
    conflictType: varchar("conflict_type", { length: 32 }).notNull(),
    severity: varchar("severity", { length: 16 }).notNull(),
    evidenceSummary: jsonb("evidence_summary").$type<Record<string, unknown>>().notNull(),
    resolutionStatus: varchar("resolution_status", { length: 20 }).notNull().default("OPEN"),
    resolvedBy: uuid("resolved_by"),
    detectedAt: timestamp("detected_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      "anomaly_flags_conflict_check",
      sql`${table.conflictType} in ('SHARED_BANK_ACCOUNT','SHARED_NIK_IDENTITY','MULTI_CLAIM_SAME_ACCOUNT')`,
    ),
    check("anomaly_flags_severity_check", sql`${table.severity} in ('HIGH','CRITICAL')`),
    check(
      "anomaly_flags_resolution_check",
      sql`${table.resolutionStatus} in ('OPEN','CONFIRMED_FRAUD','FALSE_POSITIVE')`,
    ),
    check(
      "anomaly_flags_match_check",
      sql`${table.matchedPersonnelId} IS NOT NULL OR ${table.matchedClaimId} IS NOT NULL`,
    ),
    index("idx_anomaly_flags_tenant_claim").on(table.tenantId, table.claimId, table.severity),
  ],
);

export const whatIfSimulations = analytics.table(
  "what_if_simulations",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    simulationName: varchar("simulation_name", { length: 120 }).notNull(),
    basePolicyVersionId: uuid("base_policy_version_id").notNull(),
    simulatedRulesPayload: jsonb("simulated_rules_payload")
      .$type<Record<string, unknown>>()
      .notNull(),
    targetPeriodStart: date("target_period_start").notNull(),
    targetPeriodEnd: date("target_period_end").notNull(),
    actualTotalCost: money("actual_total_cost").notNull(),
    simulatedTotalCost: money("simulated_total_cost").notNull(),
    varianceAmount: money("variance_amount").notNull(),
    variancePercentage: rate("variance_percentage").notNull(),
    impactBreakdown: jsonb("impact_breakdown").$type<Record<string, unknown>>().notNull(),
    createdBy: uuid("created_by").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    check("what_if_period_check", sql`${table.targetPeriodEnd} >= ${table.targetPeriodStart}`),
  ],
);

export const allTables = [
  tenants,
  branches,
  departments,
  positions,
  users,
  policyVersions,
  auditLogs,
  refreshTokens,
  mfaRecoveryCodes,
  submissions,
  documents,
  approvalSteps,
  claimDisbursements,
  personnel,
  salesAchievements,
  batches,
  payrollItems,
  attendanceSummaries,
  leaveRequests,
  leaveBalances,
  overtimeRequests,
  reimbursements,
  payslips,
  taxReports,
  taxReconciliations,
  payrollPayments,
  generatedFiles,
  paymentWebhookEvents,
  anomalyFlags,
  whatIfSimulations,
] as const;
