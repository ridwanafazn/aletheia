import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  LoginResponseSchema,
  RoleSchema,
  UuidSchema,
  type Role,
  type UserSummary,
} from "@aletheia/shared-contracts";

import { ApiError, apiRequest, refreshSession, setAccessToken } from "../../shared/api/client";

type AuthStatus = "loading" | "authenticated" | "anonymous";

interface AuthContextValue {
  status: AuthStatus;
  user: UserSummary | null;
  login: (input: { email: string; password: string; mfaCode?: string }) => Promise<UserSummary>;
  logout: () => Promise<void>;
  hasRole: (...roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const STORAGE_KEY = "aletheia.session.user";

function readStoredUser(): UserSummary | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return null;
    }
    return JSON.parse(raw) as UserSummary;
  } catch {
    return null;
  }
}

function storeUser(user: UserSummary | null): void {
  if (user === null) {
    sessionStorage.removeItem(STORAGE_KEY);
  } else {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  }
}

function decodeClaims(token: string): {
  sub: string;
  tid: string;
  role: Role;
  branch_id: string;
} | null {
  try {
    const part = token.split(".")[1];
    if (part === undefined) {
      return null;
    }
    const normalized = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    const payload = JSON.parse(atob(padded)) as Record<string, unknown>;
    const role = RoleSchema.safeParse(payload.role);
    if (
      typeof payload.sub !== "string" ||
      typeof payload.tid !== "string" ||
      typeof payload.branch_id !== "string" ||
      !role.success ||
      !UuidSchema.safeParse(payload.sub).success ||
      !UuidSchema.safeParse(payload.tid).success ||
      !UuidSchema.safeParse(payload.branch_id).success
    ) {
      return null;
    }
    return {
      sub: payload.sub,
      tid: payload.tid,
      role: role.data,
      branch_id: payload.branch_id,
    };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<UserSummary | null>(null);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    storeUser(null);
    setUser(null);
    setStatus("anonymous");
  }, []);

  useEffect(() => {
    let cancelled = false;
    const stored = readStoredUser();
    if (stored === null) {
      setStatus("anonymous");
      return;
    }

    void refreshSession().then((token) => {
      if (cancelled) {
        return;
      }
      if (token === null) {
        clearSession();
        return;
      }
      const claims = decodeClaims(token);
      if (claims === null) {
        clearSession();
        return;
      }
      const nextUser: UserSummary = {
        ...stored,
        id: claims.sub,
        tenant_id: claims.tid,
        role: claims.role,
        branch_id: claims.branch_id,
      };
      storeUser(nextUser);
      setUser(nextUser);
      setStatus("authenticated");
    });

    return () => {
      cancelled = true;
    };
  }, [clearSession]);

  useEffect(() => {
    const handler = () => clearSession();
    window.addEventListener("aletheia:unauthorized", handler);
    return () => window.removeEventListener("aletheia:unauthorized", handler);
  }, [clearSession]);

  const login = useCallback(
    async (input: { email: string; password: string; mfaCode?: string }) => {
      const result = await apiRequest("/api/v1/auth/login", {
        method: "POST",
        body: {
          email: input.email,
          password: input.password,
          ...(input.mfaCode === undefined || input.mfaCode.length === 0
            ? {}
            : { mfa_code: input.mfaCode }),
        },
        schema: LoginResponseSchema,
        skipRefresh: true,
      });
      setAccessToken(result.data.access_token);
      storeUser(result.data.user);
      setUser(result.data.user);
      setStatus("authenticated");
      return result.data.user;
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await apiRequest("/api/v1/auth/logout", {
        method: "POST",
        body: {},
        skipRefresh: true,
      });
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) {
        console.warn("Logout server gagal", error);
      }
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      login,
      logout,
      hasRole: (...roles: Role[]) => user !== null && roles.some((role) => role === user.role),
    }),
    [status, user, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (value === null) {
    throw new Error("useAuth harus dipakai di dalam AuthProvider");
  }
  return value;
}
