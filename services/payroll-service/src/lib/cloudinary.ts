import { createHash, randomUUID } from "node:crypto";

import type { ReimbursementUploadSignature } from "@aletheia/shared-contracts";

import { env } from "../config.js";
import { ApiError } from "./errors.js";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_RECEIPT_FORMATS = ["pdf", "jpg", "jpeg", "png", "webp"] as const;

export function createReimbursementUploadSignature(input: {
  tenantId: string;
  personnelId: string;
}): ReimbursementUploadSignature {
  const timestamp = Math.floor(Date.now() / 1000);
  const publicId = `receipt-${input.personnelId}-${randomUUID().slice(0, 8)}`;
  const folder = `${env.CLOUDINARY_FOLDER_PREFIX}/${input.tenantId}/reimbursements`;
  const allowedFormats = ALLOWED_RECEIPT_FORMATS.join(",");
  const signature = createHash("sha1")
    .update(
      `allowed_formats=${allowedFormats}&folder=${folder}&max_file_size=${MAX_UPLOAD_BYTES}&public_id=${publicId}&timestamp=${timestamp}${env.CLOUDINARY_API_SECRET}`,
    )
    .digest("hex");

  return {
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    timestamp,
    signature,
    folder,
    public_id: publicId,
    allowed_formats: [...ALLOWED_RECEIPT_FORMATS],
    max_file_size: MAX_UPLOAD_BYTES,
  };
}

export function assertTrustedReceiptUrl(
  secureUrl: string,
  tenantId: string,
  publicId?: string,
): void {
  let url: URL;
  try {
    url = new URL(secureUrl);
  } catch {
    throw ApiError.policyViolation("URL bukti tidak valid");
  }
  if (url.protocol !== "https:" || url.hostname !== "res.cloudinary.com") {
    throw ApiError.policyViolation("URL bukti harus berasal dari Cloudinary");
  }
  const folderPath = `${env.CLOUDINARY_FOLDER_PREFIX}/${tenantId}/reimbursements/`;
  const allowedPrefixes = [
    `/${env.CLOUDINARY_CLOUD_NAME}/image/upload/${folderPath}`,
    `/${env.CLOUDINARY_CLOUD_NAME}/raw/upload/${folderPath}`,
  ];
  if (
    !allowedPrefixes.some((prefix) => url.pathname.startsWith(prefix)) ||
    url.pathname.includes("..") ||
    url.username !== "" ||
    url.password !== ""
  ) {
    throw ApiError.policyViolation("URL bukti tidak berada pada folder tenant ini");
  }
  if (publicId !== undefined && !url.pathname.includes(publicId)) {
    throw ApiError.policyViolation("Public ID bukti tidak cocok dengan URL");
  }
}
