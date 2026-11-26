import { randomUUID } from "node:crypto";

import { pool } from "@aletheia/database";
import {
  LoginRequestSchema,
  MfaRecoveryRequestSchema,
  MfaVerifyRequestSchema,
  RoleSchema,
  type Role,
} from "@aletheia/shared-contracts";
import { Router, type Router as RouterType } from "express";

import { env } from "../config.js";
import { appendAudit } from "../lib/audit.js";
import { ApiError } from "../lib/errors.js";
import { signAccessToken } from "../lib/jwt.js";
import {
  buildOtpAuthUrl,
  createMfaSecret,
  createRecoveryCodes,
  decryptSecret,
  encryptSecret,
  hashRecoveryCode,
  verifyTotp,
} from "../lib/mfa.js";
import { verifyPassword } from "../lib/password.js";
import {
  clearRefreshCookie,
  createRefreshToken,
  hashIp,
  hashRefreshToken,
  REFRESH_COOKIE_NAME,
  refreshExpiry,
  setRefreshCookie,
} from "../lib/refresh-token.js";
import { sendData } from "../lib/response.js";
import { requireAuthenticated } from "../middleware/authorize.js";

interface UserRow {
  id: string;
  tenant_id: string;
  branch_id: string;
  full_name: string;
  email: string;
  password_hash: string;
  role: string;
  mfa_enabled: boolean;
  mfa_secret_encrypted: string | null;
  is_active: boolean;
}

interface RefreshTokenRow {
  id: string;
  tenant_id: string;
  user_id: string;
  family_id: string;
  expires_at: Date;
  revoked_at: Date | null;
}

export const authRouter: RouterType = Router();

authRouter.post("/login", async (request, response) => {
  const input = LoginRequestSchema.parse(request.body);
  const users = await pool.query<UserRow>(
    `select id, tenant_id, branch_id, full_name, email, password_hash, role,
            mfa_enabled, mfa_secret_encrypted, is_active
       from governance.users
      where email = $1
        and is_active = true`,
    [input.email],
  );

  if (users.rows.length !== 1) {
    throw ApiError.unauthorized("Email atau kata sandi salah");
  }

  const user = users.rows[0]!;
  const passwordValid = await verifyPassword(user.password_hash, input.password);
  if (!passwordValid) {
    throw ApiError.unauthorized("Email atau kata sandi salah");
  }

  const roleResult = RoleSchema.safeParse(user.role);
  if (!roleResult.success) {
    throw ApiError.unauthorized("Peran pengguna tidak valid");
  }
  const role: Role = roleResult.data;

  const privileged = role === "COMPLIANCE_ADMIN" || role === "FINANCE_MANAGER";

  if (env.MFA_ENFORCED && privileged && !user.mfa_enabled) {
    throw ApiError.forbidden("MFA wajib diaktifkan untuk peran ini sebelum login");
  }

  if (user.mfa_enabled) {
    if (input.mfa_code === undefined) {
      throw ApiError.unauthorized("Kode MFA diperlukan");
    }
    if (user.mfa_secret_encrypted === null) {
      throw ApiError.unauthorized("MFA belum dikonfigurasi");
    }
    if (!verifyTotp(decryptSecret(user.mfa_secret_encrypted), input.mfa_code)) {
      throw ApiError.unauthorized("Kode MFA tidak valid");
    }
  }

  const access = await signAccessToken(user.id, {
    tid: user.tenant_id,
    role,
    branch_id: user.branch_id,
  });

  const refreshToken = createRefreshToken();
  const refreshTokenHash = hashRefreshToken(refreshToken);
  const refreshTokenId = randomUUID();
  const familyId = randomUUID();
  const expiresAt = refreshExpiry();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `insert into governance.refresh_tokens
        (id, tenant_id, user_id, token_hash, family_id, expires_at, user_agent, ip_hash)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        refreshTokenId,
        user.tenant_id,
        user.id,
        refreshTokenHash,
        familyId,
        expiresAt,
        request.header("user-agent") ?? null,
        hashIp(request.ip),
      ],
    );
    await appendAudit(
      {
        tenantId: user.tenant_id,
        actorId: user.id,
        actorRole: role,
        domain: "GOVERNANCE",
        entityType: "USER",
        entityId: user.id,
        action: "USER_LOGGED_IN",
        policyVersionId: null,
        decisionContext: { role },
        correlationId: request.correlationId,
      },
      client,
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  setRefreshCookie(response, refreshToken);
  sendData(response, {
    access_token: access.token,
    token_type: "Bearer",
    expires_in: access.expiresIn,
    user: {
      id: user.id,
      tenant_id: user.tenant_id,
      branch_id: user.branch_id,
      role,
      full_name: user.full_name,
      email: user.email,
    },
  });
});

authRouter.post("/refresh", async (request, response) => {
  const cookies = request.cookies as Record<string, string | undefined>;
  const currentToken = cookies[REFRESH_COOKIE_NAME];
  if (currentToken === undefined) {
    throw ApiError.unauthorized("Refresh token tidak ditemukan");
  }

  const currentHash = hashRefreshToken(currentToken);
  const client = await pool.connect();
  let committed = false;

  try {
    await client.query("BEGIN");
    const tokens = await client.query<RefreshTokenRow>(
      `select id, tenant_id, user_id, family_id, expires_at, revoked_at
         from governance.refresh_tokens
        where token_hash = $1
        for update`,
      [currentHash],
    );

    if (tokens.rows.length !== 1) {
      await client.query("ROLLBACK");
      throw ApiError.unauthorized("Refresh token tidak valid");
    }

    const current = tokens.rows[0]!;

    if (current.revoked_at !== null) {
      await client.query(
        `update governance.refresh_tokens
            set revoked_at = now()
          where family_id = $1
            and revoked_at is null`,
        [current.family_id],
      );
      const actor = await client.query<{ role: string }>(
        `select role from governance.users where id = $1 and tenant_id = $2`,
        [current.user_id, current.tenant_id],
      );
      await appendAudit(
        {
          tenantId: current.tenant_id,
          actorId: current.user_id,
          actorRole: actor.rows[0]?.role ?? "SYSTEM",
          domain: "GOVERNANCE",
          entityType: "USER",
          entityId: current.user_id,
          action: "SECURITY_EVENT",
          policyVersionId: null,
          decisionContext: {
            event: "REFRESH_TOKEN_REUSE_DETECTED",
            family_id: current.family_id,
          },
          correlationId: request.correlationId,
        },
        client,
      );
      await client.query("COMMIT");
      committed = true;
      throw ApiError.unauthorized("Refresh token reuse terdeteksi");
    }

    if (current.expires_at.getTime() <= Date.now()) {
      await client.query("ROLLBACK");
      throw ApiError.unauthorized("Refresh token kedaluwarsa");
    }

    const users = await client.query<UserRow>(
      `select id, tenant_id, branch_id, full_name, email, password_hash, role,
              mfa_enabled, mfa_secret_encrypted, is_active
         from governance.users
        where id = $1
          and tenant_id = $2
          and is_active = true`,
      [current.user_id, current.tenant_id],
    );

    if (users.rows.length !== 1) {
      await client.query("ROLLBACK");
      throw ApiError.unauthorized("Pengguna tidak aktif");
    }

    const user = users.rows[0]!;
    const roleResult = RoleSchema.safeParse(user.role);
    if (!roleResult.success) {
      await client.query("ROLLBACK");
      throw ApiError.unauthorized("Peran pengguna tidak valid");
    }
    const role: Role = roleResult.data;

    const nextToken = createRefreshToken();
    const nextHash = hashRefreshToken(nextToken);
    const nextId = randomUUID();

    await client.query(
      `update governance.refresh_tokens
          set revoked_at = now(),
              replaced_by = $2
        where id = $1`,
      [current.id, nextId],
    );
    await client.query(
      `insert into governance.refresh_tokens
        (id, tenant_id, user_id, token_hash, family_id, expires_at, user_agent, ip_hash)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        nextId,
        current.tenant_id,
        current.user_id,
        nextHash,
        current.family_id,
        refreshExpiry(),
        request.header("user-agent") ?? null,
        hashIp(request.ip),
      ],
    );
    await appendAudit(
      {
        tenantId: current.tenant_id,
        actorId: current.user_id,
        actorRole: role,
        domain: "GOVERNANCE",
        entityType: "USER",
        entityId: current.user_id,
        action: "REFRESH_TOKEN_ROTATED",
        policyVersionId: null,
        decisionContext: { family_id: current.family_id },
        correlationId: request.correlationId,
      },
      client,
    );
    await client.query("COMMIT");
    committed = true;

    const access = await signAccessToken(current.user_id, {
      tid: current.tenant_id,
      role,
      branch_id: user.branch_id,
    });

    setRefreshCookie(response, nextToken);
    sendData(response, {
      access_token: access.token,
      token_type: "Bearer",
      expires_in: access.expiresIn,
    });
  } catch (error) {
    if (!committed) {
      await client.query("ROLLBACK").catch(() => undefined);
    }
    throw error;
  } finally {
    client.release();
  }
});

authRouter.post("/logout", requireAuthenticated, async (request, response) => {
  const cookies = request.cookies as Record<string, string | undefined>;
  const currentToken = cookies[REFRESH_COOKIE_NAME];
  if (currentToken !== undefined) {
    await pool.query(
      `update governance.refresh_tokens
          set revoked_at = now()
        where family_id = (
                select family_id
                  from governance.refresh_tokens
                 where token_hash = $1
              )
          and revoked_at is null`,
      [hashRefreshToken(currentToken)],
    );
  }
  clearRefreshCookie(response);
  sendData(response, { logged_out: true });
});

authRouter.post("/mfa/enroll", requireAuthenticated, async (request, response) => {
  const auth = request.auth!;
  const users = await pool.query<UserRow>(
    `select id, tenant_id, branch_id, full_name, email, password_hash, role,
            mfa_enabled, mfa_secret_encrypted, is_active
       from governance.users
      where id = $1
        and tenant_id = $2`,
    [auth.userId, auth.tenantId],
  );

  if (users.rows.length !== 1) {
    throw ApiError.notFound("Pengguna tidak ditemukan");
  }

  const user = users.rows[0]!;
  const secret = createMfaSecret();
  const encrypted = encryptSecret(secret);
  const recoveryCodes = createRecoveryCodes();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `update governance.users
          set mfa_secret_encrypted = $1,
              mfa_enabled = false
        where id = $2
          and tenant_id = $3`,
      [encrypted, user.id, user.tenant_id],
    );
    await client.query(
      `delete from governance.mfa_recovery_codes
        where tenant_id = $1
          and user_id = $2`,
      [user.tenant_id, user.id],
    );

    for (const code of recoveryCodes) {
      await client.query(
        `insert into governance.mfa_recovery_codes
          (id, tenant_id, user_id, code_hash)
         values ($1,$2,$3,$4)`,
        [randomUUID(), user.tenant_id, user.id, hashRecoveryCode(code)],
      );
    }

    await appendAudit(
      {
        tenantId: user.tenant_id,
        actorId: auth.userId,
        actorRole: auth.role,
        domain: "GOVERNANCE",
        entityType: "USER",
        entityId: user.id,
        action: "MFA_ENROLLED",
        policyVersionId: null,
        decisionContext: { mfa_enabled: false },
        correlationId: request.correlationId,
      },
      client,
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  sendData(response, {
    secret,
    otpauth_url: buildOtpAuthUrl(user.email, secret),
    recovery_codes: recoveryCodes,
  });
});

authRouter.post("/mfa/verify", requireAuthenticated, async (request, response) => {
  const auth = request.auth!;
  const input = MfaVerifyRequestSchema.parse(request.body);
  const users = await pool.query<UserRow>(
    `select id, tenant_id, email, mfa_secret_encrypted
       from governance.users
      where id = $1
        and tenant_id = $2`,
    [auth.userId, auth.tenantId],
  );

  if (users.rows.length !== 1) {
    throw ApiError.notFound("Pengguna tidak ditemukan");
  }

  const user = users.rows[0]!;
  if (user.mfa_secret_encrypted === null) {
    throw ApiError.policyViolation("MFA belum di-enroll");
  }
  if (!verifyTotp(decryptSecret(user.mfa_secret_encrypted), input.code)) {
    throw ApiError.unauthorized("Kode MFA tidak valid");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `update governance.users
          set mfa_enabled = true
        where id = $1
          and tenant_id = $2`,
      [user.id, user.tenant_id],
    );
    await appendAudit(
      {
        tenantId: user.tenant_id,
        actorId: auth.userId,
        actorRole: auth.role,
        domain: "GOVERNANCE",
        entityType: "USER",
        entityId: user.id,
        action: "MFA_ENABLED",
        policyVersionId: null,
        decisionContext: { mfa_enabled: true },
        correlationId: request.correlationId,
      },
      client,
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  sendData(response, { enabled: true });
});

authRouter.post("/mfa/recovery", requireAuthenticated, async (request, response) => {
  const auth = request.auth!;
  const input = MfaRecoveryRequestSchema.parse(request.body);
  const codeHash = hashRecoveryCode(input.recovery_code);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const codes = await client.query<{ id: string }>(
      `select id
         from governance.mfa_recovery_codes
        where tenant_id = $1
          and user_id = $2
          and code_hash = $3
          and used_at is null
        for update`,
      [auth.tenantId, auth.userId, codeHash],
    );

    if (codes.rows.length !== 1) {
      await client.query("ROLLBACK");
      throw ApiError.unauthorized("Recovery code tidak valid");
    }

    await client.query(
      `update governance.mfa_recovery_codes
          set used_at = now()
        where id = $1`,
      [codes.rows[0]!.id],
    );
    await appendAudit(
      {
        tenantId: auth.tenantId,
        actorId: auth.userId,
        actorRole: auth.role,
        domain: "GOVERNANCE",
        entityType: "USER",
        entityId: auth.userId,
        action: "MFA_RECOVERY_USED",
        policyVersionId: null,
        decisionContext: { used: true },
        correlationId: request.correlationId,
      },
      client,
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  sendData(response, { used: true });
});
