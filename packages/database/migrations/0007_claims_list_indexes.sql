CREATE INDEX IF NOT EXISTS idx_claims_branch_date
  ON claims.submissions (tenant_id, branch_id, created_at DESC, id DESC)
  INCLUDE (status, requested_amount);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_claims_tenant_date
  ON claims.submissions (tenant_id, created_at DESC, id DESC);
