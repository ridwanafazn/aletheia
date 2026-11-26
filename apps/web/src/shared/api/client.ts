import type { z } from "zod";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
const AUTH_PATHS = new Set(["/api/v1/auth/login", "/api/v1/auth/refresh"]);

let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly correlationId: string | null;
  public readonly details: Array<{ path: string; message: string }>;

  public constructor(input: {
    status: number;
    code: string;
    message: string;
    correlationId?: string | null;
    details?: Array<{ path: string; message: string }> | undefined;
  }) {
    super(input.message);
    this.name = "ApiError";
    this.status = input.status;
    this.code = input.code;
    this.correlationId = input.correlationId ?? null;
    this.details = input.details ?? [];
  }
}

interface ApiMeta {
  next_cursor: string | null;
  has_more: boolean;
}

interface ApiEnvelope {
  success: boolean;
  correlation_id: string;
  data: unknown;
  meta?: ApiMeta;
  error: {
    code: string;
    message: string;
    correlation_id?: string;
    details?: Array<{ path: string; message: string }>;
  } | null;
}

export interface RequestOptions<T> {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  schema?: z.ZodType<T>;
  idempotencyKey?: string;
  signal?: AbortSignal;
  skipRefresh?: boolean;
}

export interface ApiResult<T> {
  data: T;
  meta?: ApiMeta;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

function notifyUnauthorized(): void {
  accessToken = null;
  window.dispatchEvent(new Event("aletheia:unauthorized"));
}

async function readEnvelope(response: Response): Promise<ApiEnvelope> {
  try {
    return (await response.json()) as ApiEnvelope;
  } catch {
    throw new ApiError({
      status: response.status,
      code: "ERR_INTERNAL_ERROR",
      message: "Respons layanan tidak dapat dibaca",
    });
  }
}

export async function refreshSession(): Promise<string | null> {
  if (refreshPromise !== null) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const response = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (!response.ok) {
        notifyUnauthorized();
        return null;
      }
      const envelope = await readEnvelope(response);
      if (!envelope.success || envelope.data === null) {
        notifyUnauthorized();
        return null;
      }
      const data = envelope.data as { access_token?: string };
      if (typeof data.access_token !== "string") {
        notifyUnauthorized();
        return null;
      }
      accessToken = data.access_token;
      return data.access_token;
    } catch {
      notifyUnauthorized();
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions<T> = {},
): Promise<ApiResult<T>> {
  const run = async (): Promise<Response> => {
    const headers = new Headers();
    if (options.body !== undefined) {
      headers.set("content-type", "application/json");
    }
    if (accessToken !== null) {
      headers.set("authorization", `Bearer ${accessToken}`);
    }
    if (options.idempotencyKey !== undefined) {
      headers.set("idempotency-key", options.idempotencyKey);
    }

    const init: RequestInit = {
      method: options.method ?? "GET",
      credentials: "include",
      headers,
    };
    if (options.body !== undefined) {
      init.body = JSON.stringify(options.body);
    }
    if (options.signal !== undefined) {
      init.signal = options.signal;
    }
    return fetch(`${API_BASE}${path}`, init);
  };

  let response = await run();
  if (
    response.status === 401 &&
    !options.skipRefresh &&
    !AUTH_PATHS.has(path) &&
    accessToken !== null
  ) {
    const token = await refreshSession();
    if (token !== null) {
      response = await run();
    }
  }

  const envelope = await readEnvelope(response);
  if (!response.ok || !envelope.success || envelope.error !== null) {
    const error = envelope.error;
    if (response.status === 401 && !AUTH_PATHS.has(path)) {
      notifyUnauthorized();
    }
    throw new ApiError({
      status: response.status,
      code: error?.code ?? "ERR_INTERNAL_ERROR",
      message: error?.message ?? "Permintaan gagal",
      correlationId: error?.correlation_id ?? envelope.correlation_id,
      details: error?.details,
    });
  }

  const data =
    options.schema === undefined ? (envelope.data as T) : options.schema.parse(envelope.data);
  return { data, ...(envelope.meta === undefined ? {} : { meta: envelope.meta }) };
}

export function toQuery(params: Record<string, string | number | boolean | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      query.set(key, String(value));
    }
  }
  const text = query.toString();
  return text.length === 0 ? "" : `?${text}`;
}

interface GraphqlResponse<T> {
  data?: T;
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
}

export async function graphqlRequest<T>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const execute = async (): Promise<Response> =>
    fetch(`${API_BASE}/graphql`, {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        ...(accessToken === null ? {} : { authorization: `Bearer ${accessToken}` }),
      },
      body: JSON.stringify({ query, variables }),
    });

  let response = await execute();
  if (response.status === 401 && accessToken !== null) {
    const token = await refreshSession();
    if (token !== null) {
      response = await execute();
    }
  }

  const payload = (await response.json()) as GraphqlResponse<T>;
  if (payload.errors !== undefined && payload.errors.length > 0) {
    const first = payload.errors[0]!;
    throw new ApiError({
      status: response.status,
      code: first.extensions?.code ?? "ERR_GRAPHQL",
      message: first.message,
    });
  }
  if (payload.data === undefined) {
    throw new ApiError({
      status: response.status,
      code: "ERR_GRAPHQL",
      message: "Data GraphQL tidak tersedia",
    });
  }
  return payload.data;
}
