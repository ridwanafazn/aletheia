import type { Response } from "express";

export function sendData<T>(
  response: Response,
  data: T,
  status = 200,
  meta?: { next_cursor: string | null; has_more: boolean },
): void {
  response.status(status).json({
    success: true,
    correlation_id: response.locals.correlationId,
    data,
    ...(meta === undefined ? {} : { meta }),
    error: null,
  });
}
