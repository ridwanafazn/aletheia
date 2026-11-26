export interface EdgeEnv {
  ENVIRONMENT?: string;
  GOVERNANCE_URL?: string;
  CLAIMS_URL?: string;
  PAYROLL_URL?: string;
  JWT_PUBLIC_KEY?: string;
  JWT_ISSUER?: string;
  JWT_AUDIENCE?: string;
  INTERNAL_GATEWAY_SECRET?: string;
  WEB_ORIGIN?: string;
  COOKIE_CROSS_SITE?: string;
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
  RATE_LIMIT_AUTH_MAX?: string;
  RATE_LIMIT_MUTATION_MAX?: string;
  RATE_LIMIT_GRAPHQL_MAX?: string;
  RATE_LIMIT_READ_MAX?: string;
  RATE_LIMIT_WINDOW_SECONDS?: string;
  GRAPHQL_MAX_DEPTH?: string;
}

export type Environment = "development" | "test" | "production";

export interface EdgeConfig {
  environment: Environment;
  governanceUrl: string;
  claimsUrl: string;
  payrollUrl: string;
  jwtPublicKey: string;
  jwtIssuer: string;
  jwtAudience: string;
  internalGatewaySecret: string;
  webOrigin: string;
  cookieCrossSite: boolean;
  upstashUrl: string | undefined;
  upstashToken: string | undefined;
  rateLimitAuthMax: number;
  rateLimitMutationMax: number;
  rateLimitGraphqlMax: number;
  rateLimitReadMax: number;
  rateLimitWindowSeconds: number;
  graphqlMaxDepth: number;
}

function required(value: string | undefined, name: string): string {
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} wajib diisi pada edge gateway`);
  }
  return value;
}

function integer(value: string | undefined, fallback: number): number {
  if (value === undefined || value.length === 0) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizePem(value: string): string {
  return value.includes("\\n") ? value.replace(/\\n/g, "\n") : value;
}

export function resolveConfig(env: EdgeEnv): EdgeConfig {
  const environment = (env.ENVIRONMENT ?? "development") as Environment;
  if (!["development", "test", "production"].includes(environment)) {
    throw new Error("ENVIRONMENT tidak dikenal");
  }

  const internalGatewaySecret = required(env.INTERNAL_GATEWAY_SECRET, "INTERNAL_GATEWAY_SECRET");
  if (internalGatewaySecret.length < 16) {
    throw new Error("INTERNAL_GATEWAY_SECRET minimal 16 karakter");
  }

  return {
    environment,
    governanceUrl: required(env.GOVERNANCE_URL, "GOVERNANCE_URL").replace(/\/$/, ""),
    claimsUrl: required(env.CLAIMS_URL, "CLAIMS_URL").replace(/\/$/, ""),
    payrollUrl: required(env.PAYROLL_URL, "PAYROLL_URL").replace(/\/$/, ""),
    jwtPublicKey: normalizePem(required(env.JWT_PUBLIC_KEY, "JWT_PUBLIC_KEY")),
    jwtIssuer: env.JWT_ISSUER ?? "aletheia",
    jwtAudience: env.JWT_AUDIENCE ?? "aletheia-web",
    internalGatewaySecret,
    webOrigin: env.WEB_ORIGIN ?? "http://localhost:5173",
    cookieCrossSite: (env.COOKIE_CROSS_SITE ?? "false") === "true",
    upstashUrl: env.UPSTASH_REDIS_REST_URL,
    upstashToken: env.UPSTASH_REDIS_REST_TOKEN,
    rateLimitAuthMax: integer(env.RATE_LIMIT_AUTH_MAX, 10),
    rateLimitMutationMax: integer(env.RATE_LIMIT_MUTATION_MAX, 30),
    rateLimitGraphqlMax: integer(env.RATE_LIMIT_GRAPHQL_MAX, 20),
    rateLimitReadMax: integer(env.RATE_LIMIT_READ_MAX, 120),
    rateLimitWindowSeconds: integer(env.RATE_LIMIT_WINDOW_SECONDS, 60),
    graphqlMaxDepth: integer(env.GRAPHQL_MAX_DEPTH, 4),
  };
}
