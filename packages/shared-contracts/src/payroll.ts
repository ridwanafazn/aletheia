import { z } from "zod";

import { ApiMetaSchema } from "./api.js";
import {
  BatchStatusSchema,
  BatchTypeSchema,
  EmploymentStatusSchema,
  LeaveStatusSchema,
  LeaveTypeSchema,
  PaymentProviderNameSchema,
  PaymentStatusSchema,
  PersonnelTypeSchema,
  PtkpStatusSchema,
  ReconciliationStatusSchema,
  ReportStatusSchema,
  ReportTypeSchema,
  RiskClassSchema,
  TerCategorySchema,
  WageComponentSchema,
} from "./enums.js";
import {
  BooleanQuerySchema,
  DateOnlySchema,
  IsoDateTimeSchema,
  MaskedAccountSchema,
  MaskedNikSchema,
  MoneySchema,
  NotesSchema,
  PaginationQuerySchema,
  PeriodMonthSchema,
  RateSchema,
  TaxYearSchema,
  UuidSchema,
} from "./primitives.js";

const WageComponentsSchema = z.record(WageComponentSchema, MoneySchema);

export const EmployeeCreateRequestSchema = z
  .object({
    branch_id: UuidSchema.optional(),
    personnel_code: z.string().min(3).max(32),
    personnel_type: PersonnelTypeSchema,
    full_name: z.string().trim().min(2).max(120),
    nik: z.string().regex(/^\d{16}$/),
    bank_account_number: z.string().regex(/^\d{6,34}$/),
    bank_code: z.string().min(1).max(16),
    bank_name: z.string().min(1).max(64),
    ptkp_status: PtkpStatusSchema,
    risk_class: RiskClassSchema,
    employment_status: EmploymentStatusSchema,
    base_salary: MoneySchema,
    fixed_allowance: MoneySchema,
    join_date: DateOnlySchema,
    termination_date: DateOnlySchema.nullable().optional(),
    user_id: UuidSchema.nullable().optional(),
    is_active: z.boolean().optional(),
  })
  .strict();
export type EmployeeCreateRequest = z.infer<typeof EmployeeCreateRequestSchema>;

export const EmployeeUpdateRequestSchema = z
  .object({
    full_name: z.string().trim().min(2).max(120).optional(),
    bank_account_number: z
      .string()
      .regex(/^\d{6,34}$/)
      .optional(),
    bank_code: z.string().min(1).max(16).optional(),
    bank_name: z.string().min(1).max(64).optional(),
    ptkp_status: PtkpStatusSchema.optional(),
    risk_class: RiskClassSchema.optional(),
    employment_status: EmploymentStatusSchema.optional(),
    base_salary: MoneySchema.optional(),
    fixed_allowance: MoneySchema.optional(),
    termination_date: DateOnlySchema.nullable().optional(),
    user_id: UuidSchema.nullable().optional(),
    is_active: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: "Minimal satu field harus diubah" });
export type EmployeeUpdateRequest = z.infer<typeof EmployeeUpdateRequestSchema>;

export const EmployeeSchema = z
  .object({
    id: UuidSchema,
    branch_id: UuidSchema,
    personnel_code: z.string().min(3).max(32),
    personnel_type: PersonnelTypeSchema,
    full_name: z.string().min(2).max(120),
    nik_masked: MaskedNikSchema,
    bank_account_masked: MaskedAccountSchema,
    bank_code: z.string().min(1).max(16),
    bank_name: z.string().min(1).max(64),
    ptkp_status: PtkpStatusSchema,
    risk_class: RiskClassSchema,
    employment_status: EmploymentStatusSchema,
    base_salary: MoneySchema,
    fixed_allowance: MoneySchema,
    join_date: DateOnlySchema,
    termination_date: DateOnlySchema.nullable(),
    user_id: UuidSchema.nullable(),
    is_active: z.boolean(),
    created_at: IsoDateTimeSchema,
  })
  .strict();
export type Employee = z.infer<typeof EmployeeSchema>;

export const EmployeeListQuerySchema = PaginationQuerySchema.extend({
  branch_id: UuidSchema.optional(),
  personnel_type: PersonnelTypeSchema.optional(),
  status: EmploymentStatusSchema.optional(),
  search: z.string().trim().min(1).max(80).optional(),
  active: BooleanQuerySchema.optional(),
}).strict();
export type EmployeeListQuery = z.infer<typeof EmployeeListQuerySchema>;

export const SalesAchievementUpsertSchema = z
  .object({
    period_month: PeriodMonthSchema,
    verified_sales: MoneySchema,
    verification_status: z.enum(["PENDING", "VERIFIED", "REJECTED"]),
    source: z.enum(["IMPORT", "API", "MANUAL"]),
  })
  .strict();
export type SalesAchievementUpsert = z.infer<typeof SalesAchievementUpsertSchema>;

export const SalesAchievementSchema = SalesAchievementUpsertSchema.extend({
  id: UuidSchema,
  personnel_id: UuidSchema,
  verified_by: UuidSchema.nullable(),
  verified_at: IsoDateTimeSchema.nullable(),
  created_at: IsoDateTimeSchema,
}).strict();
export type SalesAchievement = z.infer<typeof SalesAchievementSchema>;

export const AttendanceUpsertSchema = z
  .object({
    working_days: z.number().int().min(0).max(31),
    present_days: z.number().int().min(0).max(31),
    paid_leave_days: z.number().int().min(0).max(31),
    unpaid_leave_days: z.number().int().min(0).max(31),
    absent_days: z.number().int().min(0).max(31),
    overtime_hours: z.number().min(0).max(200),
    source: z.enum(["MANUAL", "IMPORT", "API"]),
  })
  .strict()
  .refine((value) => value.unpaid_leave_days <= value.working_days, {
    message: "unpaid_leave_days tidak boleh melebihi working_days",
    path: ["unpaid_leave_days"],
  })
  .refine(
    (value) =>
      value.present_days + value.paid_leave_days + value.unpaid_leave_days + value.absent_days <=
      value.working_days,
    {
      message: "Total hari absensi tidak boleh melebihi working_days",
      path: ["present_days"],
    },
  );
export type AttendanceUpsert = z.infer<typeof AttendanceUpsertSchema>;

export const AttendanceSummarySchema = AttendanceUpsertSchema.extend({
  id: UuidSchema,
  personnel_id: UuidSchema,
  period_month: PeriodMonthSchema,
  approved_by: UuidSchema.nullable(),
  approved_at: IsoDateTimeSchema.nullable(),
}).strict();
export type AttendanceSummary = z.infer<typeof AttendanceSummarySchema>;

export const LeaveRequestCreateSchema = z
  .object({
    personnel_id: UuidSchema,
    leave_type: LeaveTypeSchema,
    start_date: DateOnlySchema,
    end_date: DateOnlySchema,
    days: z.number().min(0.5).max(366),
    reason: z.string().trim().min(3).max(500),
  })
  .strict()
  .refine((value) => Date.parse(value.end_date) >= Date.parse(value.start_date), {
    message: "end_date harus sama atau setelah start_date",
    path: ["end_date"],
  });
export type LeaveRequestCreate = z.infer<typeof LeaveRequestCreateSchema>;

export const LeaveDecisionRequestSchema = z
  .object({
    decision: z.enum(["APPROVED", "REJECTED"]),
    notes: z.string().trim().min(3).max(2000).optional(),
  })
  .strict()
  .refine((value) => value.decision !== "REJECTED" || value.notes !== undefined, {
    message: "notes wajib diisi untuk penolakan",
    path: ["notes"],
  });
export type LeaveDecisionRequest = z.infer<typeof LeaveDecisionRequestSchema>;

export const LeaveRequestSchema = z
  .object({
    id: UuidSchema,
    personnel_id: UuidSchema,
    leave_type: LeaveTypeSchema,
    start_date: DateOnlySchema,
    end_date: DateOnlySchema,
    days: z.number().positive(),
    status: LeaveStatusSchema,
    reason: z.string(),
    decided_by: UuidSchema.nullable(),
    decided_at: IsoDateTimeSchema.nullable(),
    decision_notes: z.string().nullable(),
    created_at: IsoDateTimeSchema,
  })
  .strict();
export type LeaveRequest = z.infer<typeof LeaveRequestSchema>;

export const PayrollBatchCreateSchema = z
  .object({
    branch_id: UuidSchema,
    period_month: PeriodMonthSchema,
    batch_type: z.enum(["REGULAR", "CORRECTION"]),
    period_start: DateOnlySchema,
    period_end: DateOnlySchema,
    correction_seq: z.number().int().min(0).max(99).optional(),
    variance_vs_batch_id: UuidSchema.nullable().optional(),
  })
  .strict()
  .refine((value) => Date.parse(value.period_end) >= Date.parse(value.period_start), {
    message: "period_end harus sama atau setelah period_start",
    path: ["period_end"],
  });
export type PayrollBatchCreate = z.infer<typeof PayrollBatchCreateSchema>;

export const PayrollBatchSchema = z
  .object({
    id: UuidSchema,
    batch_code: z.string().min(8).max(32),
    branch_id: UuidSchema,
    period_month: PeriodMonthSchema,
    batch_type: BatchTypeSchema,
    correction_seq: z.number().int().min(0),
    period_start: DateOnlySchema,
    period_end: DateOnlySchema,
    policy_version_id: UuidSchema,
    status: BatchStatusSchema,
    total_gross_amount: MoneySchema,
    total_tax_pph21: MoneySchema,
    total_bpjs_deduction: MoneySchema,
    total_bpjs_employer: MoneySchema,
    total_net_disbursed: MoneySchema,
    headcount: z.number().int().min(0),
    created_by: UuidSchema,
    approved_by: UuidSchema.nullable(),
    approved_at: IsoDateTimeSchema.nullable(),
    idempotency_key: z.string().min(8).max(128),
    disbursed_at: IsoDateTimeSchema.nullable(),
    created_at: IsoDateTimeSchema,
  })
  .strict();
export type PayrollBatch = z.infer<typeof PayrollBatchSchema>;

export const PayrollBranchSchema = z
  .object({
    id: UuidSchema,
    code: z.string().min(1).max(16),
    name: z.string().min(1).max(120),
    region: z.string().min(1).max(80),
    monthly_disbursement_cap: MoneySchema,
  })
  .strict();
export type PayrollBranch = z.infer<typeof PayrollBranchSchema>;

export const PayrollBranchListResponseSchema = z
  .object({ items: z.array(PayrollBranchSchema) })
  .strict();
export type PayrollBranchListResponse = z.infer<typeof PayrollBranchListResponseSchema>;

export const CalculationBreakdownSchema = z
  .object({
    policy_version_tag: z.string().min(3).max(32),
    ptkp_status: PtkpStatusSchema,
    ter_category: TerCategorySchema,
    applied_ter_rate: RateSchema,
    ter_base: MoneySchema,
    gross_components: WageComponentsSchema,
    deduction_components: z
      .object({
        bpjs_kesehatan: MoneySchema,
        bpjs_jht: MoneySchema,
        bpjs_jp: MoneySchema,
        pph21_tax: MoneySchema,
      })
      .strict(),
    employer_components: z
      .object({
        bpjs_kesehatan: MoneySchema,
        bpjs_jht: MoneySchema,
        bpjs_jp: MoneySchema,
        bpjs_jkk: MoneySchema,
        bpjs_jkm: MoneySchema,
      })
      .strict(),
    net_take_home_pay: MoneySchema,
    rounding_adjustment: z.string().regex(/^-?\d+(\.\d{1,2})?$/),
  })
  .strict();
export type CalculationBreakdown = z.infer<typeof CalculationBreakdownSchema>;

export const PayrollItemSchema = z
  .object({
    id: UuidSchema,
    batch_id: UuidSchema,
    personnel_id: UuidSchema,
    gross_income: MoneySchema,
    variable_allowance: MoneySchema,
    overtime_pay: MoneySchema,
    agent_commission: MoneySchema,
    unpaid_leave_deduction: MoneySchema,
    absence_deduction: MoneySchema,
    bpjs_kesehatan_deduction: MoneySchema,
    bpjs_jht_deduction: MoneySchema,
    bpjs_jp_deduction: MoneySchema,
    bpjs_kesehatan_employer: MoneySchema,
    bpjs_jht_employer: MoneySchema,
    bpjs_jp_employer: MoneySchema,
    bpjs_jkk_employer: MoneySchema,
    bpjs_jkm_employer: MoneySchema,
    pph21_tax_deduction: MoneySchema,
    net_take_home_pay: MoneySchema,
    taxable_income: MoneySchema,
    ytd_gross: MoneySchema,
    ytd_tax: MoneySchema,
    payment_status: PaymentStatusSchema,
    payment_intent_id: UuidSchema.nullable(),
    calculation_breakdown: CalculationBreakdownSchema,
  })
  .strict();
export type PayrollItem = z.infer<typeof PayrollItemSchema>;

export const PayrollBatchDetailSchema = z
  .object({
    batch: PayrollBatchSchema,
    items: z.array(PayrollItemSchema),
  })
  .strict();
export type PayrollBatchDetail = z.infer<typeof PayrollBatchDetailSchema>;

export const ApproveBatchRequestSchema = z
  .object({
    notes: z.string().trim().min(3).max(2000).optional(),
  })
  .strict();
export type ApproveBatchRequest = z.infer<typeof ApproveBatchRequestSchema>;

export const DisburseBatchRequestSchema = z
  .object({
    provider: PaymentProviderNameSchema,
  })
  .strict();
export type DisburseBatchRequest = z.infer<typeof DisburseBatchRequestSchema>;

export const PayslipSchema = z
  .object({
    id: UuidSchema,
    batch_id: UuidSchema,
    personnel_id: UuidSchema,
    period_month: PeriodMonthSchema,
    version: z.number().int().positive(),
    secure_url: z.string().min(1).max(2048),
    snapshot_hash_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    file_checksum_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    gross_income: MoneySchema,
    net_take_home_pay: MoneySchema,
    verification_code: z.string().min(6).max(16),
    published_at: IsoDateTimeSchema.nullable(),
    viewed_at: IsoDateTimeSchema.nullable(),
    supersedes_id: UuidSchema.nullable(),
  })
  .strict();
export type Payslip = z.infer<typeof PayslipSchema>;

export const GeneratePayslipRequestSchema = z.object({}).strict();
export type GeneratePayslipRequest = z.infer<typeof GeneratePayslipRequestSchema>;

export const PayslipGenerateResponseSchema = z
  .object({
    batch_id: UuidSchema,
    period_month: PeriodMonthSchema,
    policy_version_id: UuidSchema,
    item_count: z.number().int().min(0),
    status: z.literal("QUEUED"),
    event_id: UuidSchema,
  })
  .strict();
export type PayslipGenerateResponse = z.infer<typeof PayslipGenerateResponseSchema>;

export const GenerateReportRequestSchema = z
  .object({
    report_type: ReportTypeSchema,
    period_start: DateOnlySchema,
    period_end: DateOnlySchema,
    branch_id: UuidSchema.nullable().optional(),
  })
  .strict()
  .refine((value) => Date.parse(value.period_end) >= Date.parse(value.period_start), {
    message: "period_end harus sama atau setelah period_start",
    path: ["period_end"],
  });
export type GenerateReportRequest = z.infer<typeof GenerateReportRequestSchema>;

export const TaxReportSchema = z
  .object({
    id: UuidSchema,
    report_type: ReportTypeSchema,
    branch_id: UuidSchema.nullable(),
    policy_version_id: UuidSchema,
    period_start: DateOnlySchema,
    period_end: DateOnlySchema,
    version: z.number().int().positive(),
    status: ReportStatusSchema,
    file_url: z.string().min(1).max(2048).nullable(),
    snapshot_hash_sha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    file_checksum_sha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    total_gross: MoneySchema,
    total_employee_bpjs: MoneySchema,
    total_employer_bpjs: MoneySchema,
    total_pph21: MoneySchema,
    total_net: MoneySchema,
    headcount: z.number().int().min(0),
    reconciliation_delta: z.string().regex(/^-?\d+(\.\d{1,2})?$/),
    totals: z.record(z.string(), z.unknown()),
    generated_by: UuidSchema.nullable(),
    generated_at: IsoDateTimeSchema.nullable(),
    error_message: z.string().nullable(),
    supersedes_id: UuidSchema.nullable(),
  })
  .strict();
export type TaxReport = z.infer<typeof TaxReportSchema>;

export const TaxReconciliationRequestSchema = z
  .object({
    tax_year: TaxYearSchema,
    personnel_id: UuidSchema.optional(),
  })
  .strict();
export type TaxReconciliationRequest = z.infer<typeof TaxReconciliationRequestSchema>;

export const TaxReconciliationSchema = z
  .object({
    id: UuidSchema,
    personnel_id: UuidSchema,
    tax_year: TaxYearSchema,
    policy_version_id: UuidSchema,
    annual_gross: MoneySchema,
    ptkp_amount: MoneySchema,
    biaya_jabatan: MoneySchema,
    deductible_contributions: MoneySchema,
    annual_tax: MoneySchema,
    ter_credits: MoneySchema,
    difference: z.string().regex(/^-?\d+(\.\d{1,2})?$/),
    status: ReconciliationStatusSchema,
    version: z.number().int().positive(),
    settlement_batch_id: UuidSchema.nullable(),
    settlement_item_id: UuidSchema.nullable(),
    posted_by: UuidSchema.nullable(),
    posted_at: IsoDateTimeSchema.nullable(),
    created_by: UuidSchema,
  })
  .strict();
export type TaxReconciliation = z.infer<typeof TaxReconciliationSchema>;

export const TaxReconciliationPageSchema = z
  .object({ items: z.array(TaxReconciliationSchema), meta: ApiMetaSchema })
  .strict();
export type TaxReconciliationPage = z.infer<typeof TaxReconciliationPageSchema>;

export const TaxReconciliationListResponseSchema = z
  .object({ items: z.array(TaxReconciliationSchema) })
  .strict();
export type TaxReconciliationListResponse = z.infer<typeof TaxReconciliationListResponseSchema>;

export const FileDownloadResponseSchema = z
  .object({
    url: z.string().min(1).max(2048),
    checksum: z.string().regex(/^[a-f0-9]{64}$/),
    expires_at: IsoDateTimeSchema,
  })
  .strict();
export type FileDownloadResponse = z.infer<typeof FileDownloadResponseSchema>;

export const PayrollPaymentSchema = z
  .object({
    id: UuidSchema,
    batch_id: UuidSchema,
    personnel_id: UuidSchema,
    policy_version_id: UuidSchema,
    provider: PaymentProviderNameSchema,
    provider_reference: z.string().nullable(),
    amount: MoneySchema,
    status: PaymentStatusSchema,
    idempotency_key: z.string().min(8).max(128),
    attempt_no: z.number().int().positive(),
    requested_by: UuidSchema,
    approved_by: UuidSchema,
    requested_at: IsoDateTimeSchema,
    paid_at: IsoDateTimeSchema.nullable(),
    failure_reason: z.string().nullable(),
  })
  .strict();
export type PayrollPayment = z.infer<typeof PayrollPaymentSchema>;

export const PayrollBatchListQuerySchema = PaginationQuerySchema.extend({
  branch_id: UuidSchema.optional(),
  period_month: PeriodMonthSchema.optional(),
  status: BatchStatusSchema.optional(),
  batch_type: BatchTypeSchema.optional(),
}).strict();
export type PayrollBatchListQuery = z.infer<typeof PayrollBatchListQuerySchema>;

export const PayslipListQuerySchema = PaginationQuerySchema.extend({
  period_month: PeriodMonthSchema.optional(),
  personnel_id: UuidSchema.optional(),
}).strict();
export type PayslipListQuery = z.infer<typeof PayslipListQuerySchema>;

export const ReportListQuerySchema = PaginationQuerySchema.extend({
  report_type: ReportTypeSchema.optional(),
  period_month: PeriodMonthSchema.optional(),
}).strict();
export type ReportListQuery = z.infer<typeof ReportListQuerySchema>;

export const AttendanceListResponseSchema = z
  .object({ items: z.array(AttendanceSummarySchema) })
  .strict();
export type AttendanceListResponse = z.infer<typeof AttendanceListResponseSchema>;

export const SalesAchievementListResponseSchema = z
  .object({ items: z.array(SalesAchievementSchema) })
  .strict();
export type SalesAchievementListResponse = z.infer<typeof SalesAchievementListResponseSchema>;

export const LeaveRequestListResponseSchema = z
  .object({ items: z.array(LeaveRequestSchema) })
  .strict();
export type LeaveRequestListResponse = z.infer<typeof LeaveRequestListResponseSchema>;

export const PayrollPageMetaSchema = ApiMetaSchema;
export const EmployeePageSchema = z
  .object({ items: z.array(EmployeeSchema), meta: ApiMetaSchema })
  .strict();
export type EmployeePage = z.infer<typeof EmployeePageSchema>;
export const PayrollBatchPageSchema = z
  .object({ items: z.array(PayrollBatchSchema), meta: ApiMetaSchema })
  .strict();
export type PayrollBatchPage = z.infer<typeof PayrollBatchPageSchema>;
export const PayslipPageSchema = z
  .object({ items: z.array(PayslipSchema), meta: ApiMetaSchema })
  .strict();
export const TaxReportPageSchema = z
  .object({ items: z.array(TaxReportSchema), meta: ApiMetaSchema })
  .strict();

export const ReversePaymentRequestSchema = z
  .object({ reason: z.string().trim().min(15).max(500) })
  .strict();
export type ReversePaymentRequest = z.infer<typeof ReversePaymentRequestSchema>;

export const RetryBatchRequestSchema = z.object({ provider: PaymentProviderNameSchema }).strict();
export type RetryBatchRequest = z.infer<typeof RetryBatchRequestSchema>;

export const ApproveBatchNotesSchema = NotesSchema;
