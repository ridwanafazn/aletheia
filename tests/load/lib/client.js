import http from "k6/http";
import { check } from "k6";

export const BASE_URL = __ENV.BASE_URL ?? "http://host.docker.internal:8787";
export const PASSWORD = __ENV.DEMO_PASSWORD ?? "AletheiaDemo!2026";
export const SAU_TENANT = "019361a2-7c00-7000-8000-000000000001";
export const SAU_BRANCH_BDG = "019361a2-7c00-7000-8000-000000000011";

export const USERS = {
  officer: "officer.bdg@aletheia.id",
  manager: "manager.bdg@aletheia.id",
  finance: "finance.vp@aletheia.id",
  hr: "hr.ops@aletheia.id",
  mis: "mis.analyst@aletheia.id",
  compliance: "compliance@aletheia.id",
};

export function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (value) => {
    const random = Math.floor(Math.random() * 16);
    return (value === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });
}

export function parseBody(response) {
  try {
    return JSON.parse(response.body);
  } catch {
    return null;
  }
}

export function login(email) {
  const response = http.post(
    `${BASE_URL}/api/v1/auth/login`,
    JSON.stringify({ email, password: PASSWORD }),
    {
      headers: { "content-type": "application/json" },
      tags: { name: "login" },
      timeout: "10s",
    },
  );
  const body = parseBody(response);
  const token = body?.data?.access_token;
  const user = body?.data?.user;
  check(response, {
    "login 200": (result) => result.status === 200,
    "login token tersedia": () => typeof token === "string" && token.length > 0,
  });
  if (typeof token !== "string") {
    throw new Error(`Login gagal untuk ${email}: ${response.status} ${response.body}`);
  }
  return { token, user };
}

export function authHeaders(token) {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
}

export function get(path, token, name) {
  return http.get(`${BASE_URL}${path}`, {
    headers: authHeaders(token),
    tags: { name },
  });
}

export function post(path, body, token, name, idempotencyKey) {
  const headers = authHeaders(token);
  if (idempotencyKey !== undefined) {
    headers["idempotency-key"] = idempotencyKey;
  }
  return http.post(`${BASE_URL}${path}`, JSON.stringify(body), {
    headers,
    tags: { name },
  });
}
