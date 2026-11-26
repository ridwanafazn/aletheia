ALTER TABLE "payroll"."payslips" ADD COLUMN "gross_income" numeric(18, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll"."payslips" ADD COLUMN "net_take_home_pay" numeric(18, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
DROP INDEX IF EXISTS payroll.idx_payslips_source_event;
