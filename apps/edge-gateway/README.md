# Aletheia Edge Gateway

Cloudflare Worker berbasis Hono. Tanggung jawab:

- Verifikasi access token EdDSA.
- Rate limit per alamat IP atau pengguna.
- Menandatangani header gateway untuk governance-service dan claims-service.
- Mem-proxy REST dan menangani CORS serta cookie lintas situs.
- Menyajikan GraphQL BFF untuk KPI MIS, audit klaim, dan What-If.

## Local

```bash
node scripts/generate-dev-keys.mjs
pnpm --filter @aletheia/edge-gateway dev
```

Worker lokal berjalan di `http://localhost:8787`. Nilai lokal dibaca dari `.dev.vars`; contoh ada di `.dev.vars.example`.

## Test dan build

```bash
pnpm --filter @aletheia/edge-gateway test
pnpm --filter @aletheia/edge-gateway build
```

## Deploy

```bash
printf '%s' "$INTERNAL_GATEWAY_SECRET" | pnpm --filter @aletheia/edge-gateway exec wrangler secret put INTERNAL_GATEWAY_SECRET
printf '%s' "$JWT_PUBLIC_KEY" | pnpm --filter @aletheia/edge-gateway exec wrangler secret put JWT_PUBLIC_KEY
pnpm --filter @aletheia/edge-gateway exec wrangler deploy
```

Atur `GOVERNANCE_URL`, `CLAIMS_URL`, `WEB_ORIGIN`, dan `COOKIE_CROSS_SITE` pada environment Worker. Untuk preview lintas domain, `WEB_ORIGIN` harus berisi origin Pages dan `COOKIE_CROSS_SITE` harus `true`.
