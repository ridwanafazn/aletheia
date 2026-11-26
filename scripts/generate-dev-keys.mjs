import { generateKeyPairSync } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const envPath = ".env";
const devVarsPath = "apps/edge-gateway/.dev.vars";
const examplePath = "apps/edge-gateway/.dev.vars.example";

const force = process.argv.includes("--force");
const existingEnv = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
const hasKeys =
  /^JWT_PRIVATE_KEY=.+$/m.test(existingEnv) && /^JWT_PUBLIC_KEY=.+$/m.test(existingEnv);
const publicMatch = /^JWT_PUBLIC_KEY=(.+)$/m.exec(existingEnv);

if (!force && hasKeys && publicMatch !== null) {
  let env = upsert(existingEnv, "INTERNAL_GATEWAY_SECRET", "dev-only-internal-gateway-secret");
  writeFileSync(envPath, env);
  let devVars = existsSync(devVarsPath)
    ? readFileSync(devVarsPath, "utf8")
    : readFileSync(examplePath, "utf8");
  devVars = upsert(devVars, "JWT_PUBLIC_KEY", publicMatch[1]);
  devVars = upsert(devVars, "INTERNAL_GATEWAY_SECRET", "dev-only-internal-gateway-secret");
  writeFileSync(devVarsPath, devVars);
  console.log("Existing dev JWT keys retained and gateway secret synchronized");
  process.exit(0);
}

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const encode = (pem) =>
  pem
    .toString()
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .join("\\n");

const privatePem = encode(privateKey.export({ type: "pkcs8", format: "pem" }));
const publicPem = encode(publicKey.export({ type: "spki", format: "pem" }));

function upsert(text, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  return pattern.test(text) ? text.replace(pattern, line) : `${text.trimEnd()}\n${line}\n`;
}

let env = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
env = upsert(env, "JWT_PRIVATE_KEY", privatePem);
env = upsert(env, "JWT_PUBLIC_KEY", publicPem);
env = upsert(env, "INTERNAL_GATEWAY_SECRET", "dev-only-internal-gateway-secret");
writeFileSync(envPath, env);

let devVars = existsSync(devVarsPath)
  ? readFileSync(devVarsPath, "utf8")
  : readFileSync(examplePath, "utf8");
devVars = upsert(devVars, "JWT_PUBLIC_KEY", publicPem);
devVars = upsert(devVars, "INTERNAL_GATEWAY_SECRET", "dev-only-internal-gateway-secret");
writeFileSync(devVarsPath, devVars);

console.log("Dev JWT keys written to .env and apps/edge-gateway/.dev.vars");
