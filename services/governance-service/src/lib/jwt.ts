import { generateKeyPair, importPKCS8, importSPKI, SignJWT, jwtVerify, type KeyInput } from "jose";
import { randomUUID } from "node:crypto";

import type { Role } from "@aletheia/shared-contracts";

import { env } from "../config.js";

let privateKeyPromise: Promise<KeyInput> | undefined;
let publicKeyPromise: Promise<KeyInput> | undefined;
let devKeyPairPromise: Promise<{ privateKey: KeyInput; publicKey: KeyInput }> | undefined;

function getDevKeyPair(): Promise<{ privateKey: KeyInput; publicKey: KeyInput }> {
  devKeyPairPromise ??= generateKeyPair("EdDSA", {
    crv: "Ed25519",
    extractable: true,
  });
  return devKeyPairPromise;
}

async function getPrivateKey(): Promise<KeyInput> {
  privateKeyPromise ??= (async () => {
    if (env.JWT_PRIVATE_KEY !== undefined) {
      return importPKCS8(env.JWT_PRIVATE_KEY.replace(/\\n/g, "\n"), "EdDSA");
    }
    return (await getDevKeyPair()).privateKey;
  })();
  return privateKeyPromise;
}

async function getPublicKey(): Promise<KeyInput> {
  publicKeyPromise ??= (async () => {
    if (env.JWT_PUBLIC_KEY !== undefined) {
      return importSPKI(env.JWT_PUBLIC_KEY.replace(/\\n/g, "\n"), "EdDSA");
    }
    return (await getDevKeyPair()).publicKey;
  })();
  return publicKeyPromise;
}

export interface AccessTokenClaims {
  tid: string;
  role: Role;
  branch_id: string;
}

export async function signAccessToken(
  userId: string,
  claims: AccessTokenClaims,
): Promise<{ token: string; expiresIn: number }> {
  const key = await getPrivateKey();
  const token = await new SignJWT({
    tid: claims.tid,
    role: claims.role,
    branch_id: claims.branch_id,
  })
    .setProtectedHeader({ alg: "EdDSA", typ: "JWT" })
    .setSubject(userId)
    .setIssuer(env.JWT_ISSUER)
    .setAudience(env.JWT_AUDIENCE)
    .setIssuedAt()
    .setJti(randomUUID())
    .setExpirationTime(`${env.ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(key);

  return { token, expiresIn: env.ACCESS_TOKEN_TTL_SECONDS };
}

export async function verifyAccessToken(token: string): Promise<Record<string, unknown>> {
  const key = await getPublicKey();
  const { payload } = await jwtVerify(token, key, {
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  });
  return payload;
}
