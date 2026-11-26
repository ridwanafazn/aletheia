ALTER TABLE "governance"."policy_versions" DROP CONSTRAINT "policy_versions_domain_check";--> statement-breakpoint
ALTER TABLE "payroll"."tax_reports" DROP CONSTRAINT "tax_reports_type_check";--> statement-breakpoint
ALTER TABLE "governance"."tenants" ADD COLUMN "plan" varchar(16) DEFAULT 'ENTERPRISE' NOT NULL;--> statement-breakpoint
ALTER TABLE "governance"."policy_versions" ADD CONSTRAINT "policy_versions_domain_check" CHECK ("governance"."policy_versions"."domain" in ('CLAIMS_POLICY','PAYROLL_TAX_POLICY','PAYROLL_COST_POLICY'));--> statement-breakpoint
ALTER TABLE "payroll"."tax_reports" ADD CONSTRAINT "tax_reports_type_check" CHECK ("payroll"."tax_reports"."report_type" in ('PPH21_MONTHLY','PPH21_ANNUAL','BPJS_MONTHLY','BANK_FILE','PAYROLL_VARIANCE','PAYROLL_COST_INVOICE'));--> statement-breakpoint
ALTER TABLE "governance"."tenants" ADD CONSTRAINT "tenants_plan_check" CHECK ("governance"."tenants"."plan" in ('BASIC','HRIS_PLUS','HRIS_PRO','ENTERPRISE'));