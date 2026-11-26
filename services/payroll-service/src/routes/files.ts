import { pool, runWithTenant } from "@aletheia/database";
import { Router, type Router as RouterType } from "express";

import { verifyFileToken } from "../lib/files.js";

interface FileRow {
  file_name: string;
  mime_type: string;
  file_size: number;
  content: Buffer;
  checksum_sha256: string;
}

export const fileRouter: RouterType = Router();

fileRouter.get("/:token", async (request, response) => {
  const token = request.params.token ?? "";
  const payload = verifyFileToken(token);
  if (payload === null) {
    response.status(401).json({
      success: false,
      correlation_id: request.correlationId,
      data: null,
      error: {
        code: "ERR_UNAUTHORIZED_ACCESS",
        message: "Tautan berkas tidak valid atau sudah kedaluwarsa",
        correlation_id: request.correlationId,
        retryable: false,
      },
    });
    return;
  }
  const result = await runWithTenant(payload.tenant_id, () =>
    pool.query<FileRow>(
      `select file_name, mime_type, file_size, content, checksum_sha256
       from payroll.generated_files
      where tenant_id = $1 and kind = $2 and entity_id = $3
      limit 1`,
      [payload.tenant_id, payload.kind, payload.entity_id],
    ),
  );
  const file = result.rows[0];
  if (file === undefined) {
    response.status(404).json({
      success: false,
      correlation_id: request.correlationId,
      data: null,
      error: {
        code: "ERR_NOT_FOUND",
        message: "Berkas tidak ditemukan",
        correlation_id: request.correlationId,
        retryable: false,
      },
    });
    return;
  }
  response.setHeader("content-type", file.mime_type);
  response.setHeader("content-length", String(file.file_size));
  response.setHeader("content-disposition", `attachment; filename="${file.file_name}"`);
  response.setHeader("cache-control", "private, max-age=60");
  response.setHeader("x-file-checksum-sha256", file.checksum_sha256);
  response.send(file.content);
});
