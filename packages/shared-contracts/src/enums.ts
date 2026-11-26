import { z } from "zod";

export const RoleSchema = z.enum([
  "CLAIMS_OFFICER",
  "HR_SPECIALIST",
  "BRANCH_MANAGER",
  "FINANCE_MANAGER",
  "MIS_ANALYST",
  "COMPLIANCE_ADMIN",
  "EMPLOYEE",
]);
export type Role = z.infer<typeof RoleSchema>;

export const PolicyDomainSchema = z.enum(["CLAIMS_POLICY", "PAYROLL_TAX_POLICY"]);
export type PolicyDomain = z.infer<typeof PolicyDomainSchema>;

export const PolicyStatusSchema = z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]);
export type PolicyStatus = z.infer<typeof PolicyStatusSchema>;

export const ClaimCategorySchema = z.enum(["HEALTH", "ACCIDENT", "PROPERTY", "GUARANTEE"]);
export type ClaimCategory = z.infer<typeof ClaimCategorySchema>;

export const DocumentTypeSchema = z.enum([
  "IDENTITY_CARD",
  "MEDICAL_INVOICE",
  "POLICE_REPORT",
  "POLICY_CERT",
]);
export type DocumentType = z.infer<typeof DocumentTypeSchema>;

export const ClaimStatusSchema = z.enum([
  "DRAFT",
  "SUBMITTED",
  "RISK_PENDING",
  "UNDER_REVIEW",
  "RETURNED",
  "ESCALATED",
  "COMPLIANCE_REVIEW",
  "APPROVED",
  "REJECTED",
  "DISBURSED",
]);
export type ClaimStatus = z.infer<typeof ClaimStatusSchema>;

export const ClaimDecisionSchema = z.enum(["APPROVED", "REJECTED", "RETURNED"]);
export type ClaimDecision = z.infer<typeof ClaimDecisionSchema>;

export const PersonnelTypeSchema = z.enum(["EMPLOYEE", "SALES_AGENT"]);
export type PersonnelType = z.infer<typeof PersonnelTypeSchema>;

export const EmploymentStatusSchema = z.enum(["PERMANENT", "CONTRACT", "PROBATION", "INACTIVE"]);
export type EmploymentStatus = z.infer<typeof EmploymentStatusSchema>;

export const PtkpStatusSchema = z.enum([
  "TK/0",
  "TK/1",
  "TK/2",
  "TK/3",
  "K/0",
  "K/1",
  "K/2",
  "K/3",
]);
export type PtkpStatus = z.infer<typeof PtkpStatusSchema>;

export const TerCategorySchema = z.enum(["CATEGORY_A", "CATEGORY_B", "CATEGORY_C"]);
export type TerCategory = z.infer<typeof TerCategorySchema>;

export const RiskClassSchema = z.enum(["I", "II", "III", "IV", "V"]);
export type RiskClass = z.infer<typeof RiskClassSchema>;

export const WageComponentSchema = z.enum([
  "base_salary",
  "fixed_allowance",
  "variable_allowance",
  "overtime_pay",
  "agent_commission",
]);
export type WageComponent = z.infer<typeof WageComponentSchema>;

export const CommissionModeSchema = z.enum(["FLAT_TIER", "MARGINAL"]);
export type CommissionMode = z.infer<typeof CommissionModeSchema>;

export const BatchTypeSchema = z.enum(["REGULAR", "CORRECTION", "THR", "THIRTEENTH_MONTH"]);
export type BatchType = z.infer<typeof BatchTypeSchema>;

export const BatchStatusSchema = z.enum([
  "DRAFT",
  "CALCULATING",
  "READY_FOR_APPROVAL",
  "APPROVED",
  "DISBURSING",
  "DISBURSED",
  "PARTIAL",
  "REJECTED",
  "CANCELLED",
  "FAILED",
]);
export type BatchStatus = z.infer<typeof BatchStatusSchema>;

export const LeaveTypeSchema = z.enum(["ANNUAL", "SICK", "MATERNITY", "UNPAID", "OTHER"]);
export type LeaveType = z.infer<typeof LeaveTypeSchema>;

export const LeaveStatusSchema = z.enum(["PENDING", "APPROVED", "REJECTED", "CANCELLED"]);
export type LeaveStatus = z.infer<typeof LeaveStatusSchema>;

export const OvertimeStatusSchema = z.enum(["PENDING", "APPROVED", "REJECTED", "CANCELLED"]);
export type OvertimeStatus = z.infer<typeof OvertimeStatusSchema>;

export const ReimbursementCategorySchema = z.enum(["TRANSPORT", "MEAL", "MEDICAL", "OTHER"]);
export type ReimbursementCategory = z.infer<typeof ReimbursementCategorySchema>;

export const ReimbursementStatusSchema = z.enum(["PENDING", "APPROVED", "REJECTED", "PAID"]);
export type ReimbursementStatus = z.infer<typeof ReimbursementStatusSchema>;

export const JobLevelSchema = z.enum(["STAFF", "SUPERVISOR", "MANAGER", "DIRECTOR"]);
export type JobLevel = z.infer<typeof JobLevelSchema>;

export const ReportTypeSchema = z.enum([
  "PPH21_MONTHLY",
  "PPH21_ANNUAL",
  "BPJS_MONTHLY",
  "BANK_FILE",
  "PAYROLL_VARIANCE",
]);
export type ReportType = z.infer<typeof ReportTypeSchema>;

export const ReportStatusSchema = z.enum(["QUEUED", "GENERATING", "READY", "FAILED"]);
export type ReportStatus = z.infer<typeof ReportStatusSchema>;

export const PaymentProviderNameSchema = z.enum(["MOCK", "XENDIT", "MIDTRANS"]);
export type PaymentProviderName = z.infer<typeof PaymentProviderNameSchema>;

export const PaymentStatusSchema = z.enum(["PENDING", "PROCESSING", "PAID", "FAILED", "REVERSED"]);
export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;

export const PaymentEntityTypeSchema = z.enum(["CLAIM", "PAYROLL_ITEM"]);
export type PaymentEntityType = z.infer<typeof PaymentEntityTypeSchema>;

export const ReconciliationStatusSchema = z.enum(["DRAFT", "POSTED", "VOID"]);
export type ReconciliationStatus = z.infer<typeof ReconciliationStatusSchema>;

export const AuditDomainSchema = z.enum(["GOVERNANCE", "CLAIMS", "PAYROLL", "ANALYTICS"]);
export type AuditDomain = z.infer<typeof AuditDomainSchema>;
