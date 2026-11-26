const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function correlationId(request: Request): string {
  const provided = request.headers.get("x-correlation-id");
  return provided !== null && UUID_PATTERN.test(provided) ? provided : crypto.randomUUID();
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
  correlation: string,
  retryable = false,
): Response {
  return Response.json(
    {
      success: false,
      correlation_id: correlation,
      data: null,
      error: {
        code,
        message,
        correlation_id: correlation,
        retryable,
      },
    },
    { status },
  );
}

export function authority(request: Request): string {
  const forwarded = request.headers.get("cf-connecting-ip");
  if (forwarded !== null && forwarded.length > 0) {
    return forwarded;
  }
  const xForwarded = request.headers.get("x-forwarded-for");
  if (xForwarded !== null && xForwarded.length > 0) {
    return xForwarded.split(",")[0]!.trim();
  }
  return "unknown";
}

export function allowedOrigins(value: string): string[] {
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

export function isAllowedOrigin(origin: string | null, configured: string): boolean {
  if (origin === null) {
    return false;
  }
  return allowedOrigins(configured).includes(origin);
}

export function applyCors(
  response: Response,
  request: Request,
  configuredOrigin: string,
): Response {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin, configuredOrigin)) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", origin!);
  headers.set("access-control-allow-credentials", "true");
  headers.set("vary", "Origin");
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "no-referrer");
  headers.set("x-frame-options", "DENY");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function corsPreflight(request: Request, configuredOrigin: string): Response {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin, configuredOrigin)) {
    return new Response(null, { status: 403 });
  }

  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": origin!,
      "access-control-allow-credentials": "true",
      "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
      "access-control-allow-headers": "authorization,content-type,idempotency-key,x-correlation-id",
      "access-control-max-age": "600",
      vary: "Origin",
    },
  });
}
