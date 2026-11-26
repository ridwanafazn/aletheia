import { createHash } from "node:crypto";

import type { UploadSignatureResponse } from "@aletheia/shared-contracts";

import { env } from "../config.js";
import { ApiError } from "./errors.js";

const ALLOWED_FORMATS: Record<string, string[]> = {
  "application/pdf": ["pdf"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
};

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export function createUploadSignature(input: {
  tenantId: string;
  documentType: string;
  mimeType: string;
}): UploadSignatureResponse {
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = `${env.CLOUDINARY_FOLDER_PREFIX}/${input.tenantId}/${input.documentType.toLowerCase()}`;
  const signature = createHash("sha1")
    .update(`folder=${folder}&timestamp=${timestamp}${env.CLOUDINARY_API_SECRET}`)
    .digest("hex");

  return {
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    folder,
    timestamp,
    signature,
    allowed_formats: ALLOWED_FORMATS[input.mimeType] ?? ["pdf"],
    max_file_size: MAX_UPLOAD_BYTES,
  };
}

export function assertTrustedCloudinaryUrl(secureUrl: string): void {
  if (!env.IS_PRODUCTION) {
    return;
  }
  const prefix = `https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME}/`;
  if (!secureUrl.startsWith(prefix)) {
    throw ApiError.policyViolation("URL dokumen tidak berasal dari Cloudinary tenant ini");
  }
}
