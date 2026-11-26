GRANT USAGE ON SCHEMA governance, claims, payroll, analytics TO aletheia_app;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA governance, claims, payroll, analytics
  TO aletheia_app;

GRANT USAGE, SELECT
  ON ALL SEQUENCES IN SCHEMA governance, claims, payroll, analytics
  TO aletheia_app;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON governance.audit_logs FROM aletheia_app;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON governance.tenants FROM aletheia_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA governance, claims, payroll, analytics
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO aletheia_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA governance, claims, payroll, analytics
  GRANT USAGE, SELECT ON SEQUENCES TO aletheia_app;
