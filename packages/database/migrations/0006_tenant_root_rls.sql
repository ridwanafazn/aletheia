ALTER TABLE governance.tenants ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_self_isolation ON governance.tenants;
--> statement-breakpoint
CREATE POLICY tenant_self_isolation ON governance.tenants
  USING (id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (id = current_setting('app.tenant_id', true)::uuid);
