DO $$
DECLARE
  admin_role text := current_user;
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_auth_members membership
      JOIN pg_roles granted_role ON granted_role.oid = membership.roleid
      JOIN pg_roles member_role ON member_role.oid = membership.member
     WHERE granted_role.rolname = 'aletheia_app'
       AND member_role.rolname = admin_role
  ) THEN
    EXECUTE format('GRANT aletheia_app TO %I', admin_role);
  END IF;
END
$$;
