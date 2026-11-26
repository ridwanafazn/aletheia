import { createEdgeApp } from "./app.js";
import { resolveConfig, type EdgeEnv } from "./config.js";
import { errorResponse } from "./lib/http.js";

interface CachedApp {
  key: string;
  app: ReturnType<typeof createEdgeApp>;
}

let cached: CachedApp | undefined;

function appKey(env: EdgeEnv): string {
  return [
    env.ENVIRONMENT ?? "development",
    env.GOVERNANCE_URL ?? "",
    env.CLAIMS_URL ?? "",
    env.WEB_ORIGIN ?? "",
    env.JWT_PUBLIC_KEY?.slice(-16) ?? "",
    env.INTERNAL_GATEWAY_SECRET?.slice(-8) ?? "",
  ].join("|");
}

export default {
  async fetch(request: Request, env: EdgeEnv): Promise<Response> {
    const key = appKey(env);
    if (cached === undefined || cached.key !== key) {
      cached = { key, app: createEdgeApp(resolveConfig(env)) };
    }
    try {
      return await cached.app.fetch(request, env);
    } catch (error) {
      return errorResponse(
        500,
        "ERR_INTERNAL_ERROR",
        error instanceof Error ? error.message : "Kesalahan edge gateway",
        crypto.randomUUID(),
      );
    }
  },
};

export { createEdgeApp } from "./app.js";
export { resolveConfig } from "./config.js";
