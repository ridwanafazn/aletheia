const TRACEPARENT_PATTERN = /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/;

function randomHex(bytes: number): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return Array.from(buffer, (value) => value.toString(16).padStart(2, "0")).join("");
}

export function resolveTraceparent(header: string | undefined): string {
  const candidate = header?.trim().toLowerCase();
  if (candidate !== undefined && TRACEPARENT_PATTERN.test(candidate)) {
    return candidate;
  }
  return `00-${randomHex(16)}-${randomHex(8)}-01`;
}

export function traceIdFrom(traceparent: string): string {
  return traceparent.split("-")[1] ?? "";
}
