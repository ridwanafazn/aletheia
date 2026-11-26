ALTER TABLE "governance"."tenants" ALTER COLUMN "plan" SET DEFAULT 'BASIC';--> statement-breakpoint
-- Fail closed: tenants that inherited the old ENTERPRISE default are downgraded
-- to BASIC until an explicit commercial plan is assigned.
UPDATE "governance"."tenants" SET "plan" = 'BASIC' WHERE "plan" = 'ENTERPRISE';--> statement-breakpoint
REVOKE DELETE ON "payroll"."reimbursements" FROM "aletheia_app";