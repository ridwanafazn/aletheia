import { createHash, randomUUID } from "node:crypto";

import type { ReimbursementUploadSignature } from "@aletheia/shared-contracts";

import { env } from "../config.js";
import { ApiError } from "./errors.js";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export function createReimbursementUploadSignature(input: {
  tenantId: string;
  personnelId: string;
}): ReimbursementUploadSignature {
  const timestamp = Math.floor(Date.now() / 1000);
  const publicId = `receipt-${input.personnelId}-${randomUUID().slice(0, 8)}`;
  const folder = `${env.CLOUDINARY_FOLDER_PREFIX}/${input.tenantId}/reimbursements`;
  const signature = createHash("sha1")
    .update(
      `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}${env.CLOUDINARY_API_SECRET}`,
    )
    .digest("hex");

  return {
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    timestamp,
    signature,
    folder,
    public_id: publicId,
    allowed_formats: ["pdf", "jpg", "jpeg", "png", "webp"],
    max_file_size: MAX_UPLOAD_BYTES,
  };
}

export function assertTrustedReceiptUrl(secureUrl: string): void {
  if (!env.IS_PRODUCTION) {
    return;
  }
  const prefix = `https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME}/`;
  if (!secureUrl.startsWith(prefix)) {
    throw ApiError.policyViolation("URL bukti tidak berasal dari Cloudinary tenant ini");
  }
}
