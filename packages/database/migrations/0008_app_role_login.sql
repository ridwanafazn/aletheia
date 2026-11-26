ALTER ROLE aletheia_app LOGIN;

CREATE OR REPLACE FUNCTION governance.resolve_login_user(p_email text)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  branch_id uuid,
  full_name varchar(120),
  email varchar(150),
  password_hash text,
  role varchar(32),
  mfa_enabled boolean,
  mfa_secret_encrypted text,
  is_active boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = governance, pg_temp
AS $$
  SELECT u.id,
         u.tenant_id,
         u.branch_id,
         u.full_name,
         u.email,
         u.password_hash,
         u.role,
         u.mfa_enabled,
         u.mfa_secret_encrypted,
         u.is_active
    FROM governance.users u
   WHERE u.email = p_email
     AND u.is_active = true
   ORDER BY u.tenant_id
   LIMIT 5;
$$;

REVOKE ALL ON FUNCTION governance.resolve_login_user(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.resolve_login_user(text) TO aletheia_app;

CREATE OR REPLACE FUNCTION governance.resolve_refresh_token(p_token_hash text)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  user_id uuid,
  family_id uuid,
  expires_at timestamptz,
  revoked_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = governance, pg_temp
AS $$
  SELECT t.id,
         t.tenant_id,
         t.user_id,
         t.family_id,
         t.expires_at,
         t.revoked_at
    FROM governance.refresh_tokens t
   WHERE t.token_hash = p_token_hash
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION governance.resolve_refresh_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.resolve_refresh_token(text) TO aletheia_app;

CREATE OR REPLACE FUNCTION claims.resolve_disbursement_tenant(p_provider text, p_reference text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = claims, pg_temp
AS $$
  SELECT d.tenant_id
    FROM claims.disbursements d
   WHERE d.provider = p_provider
     AND d.provider_reference = p_reference
   ORDER BY d.requested_at DESC
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION claims.resolve_disbursement_tenant(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claims.resolve_disbursement_tenant(text, text) TO aletheia_app;

CREATE OR REPLACE FUNCTION payroll.resolve_payment_tenant(p_provider text, p_reference text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = payroll, pg_temp
AS $$
  SELECT p.tenant_id
    FROM payroll.payments p
   WHERE p.provider = p_provider
     AND p.provider_reference = p_reference
   ORDER BY p.requested_at DESC
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION payroll.resolve_payment_tenant(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION payroll.resolve_payment_tenant(text, text) TO aletheia_app;
