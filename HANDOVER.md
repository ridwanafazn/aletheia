# Aletheia — Handover

* **Status:** M1 sampai M5.3 selesai. M5.4 deployment production belum dimulai.
* **Tanggal handover:** 26 November 2026
* **Data:** seluruhnya sintetis. Tidak ada uang nyata atau PII nyata.
* **Server demo:** dihentikan. Nyalakan ulang dengan `bash scripts/dev-up.sh`.

Dokumen ini adalah pintu masuk. Jangan menebak perintah dari riwayat chat; gunakan urutan di sini.

## 1. Ringkasan proyek

Aletheia adalah platform governance pencairan klaim dan payroll dengan:

* React 19 + Vite untuk web.
* Express.js + TypeScript untuk governance, claims, dan payroll service.
* Go untuk analytics worker.
* PostgreSQL 16 dengan RLS, audit hash chain, idempotency, dan policy versioning.
* Edge gateway Hono di Cloudflare Workers.
* OpenTelemetry, Prometheus, Grafana, dan Jaeger untuk observability.
* k6 untuk load test dan Playwright untuk E2E.

**Yang sudah selesai:** M1 fondasi, M2 governance dan claims, M3 payroll dan disbursement, M4 MIS, M5.1 security hardening, M5.2 observability dan load test, M5.3 E2E, accessibility, dan final QA.

**Yang belum selesai:**

* M5.4 deployment production, rollback, Neon, Upstash, Cloudinary, Koyeb/Render.
* UI payslip dan laporan. API-nya sudah ada dan diverifikasi di M3.4.
* Service demo masih memakai role pemilik database. RLS sudah diverifikasi dengan role `aletheia_app`; pengikatan tenant per transaksi wajib sebelum production.
* Edge preview live perlu deploy ulang.
* Semua perubahan belum di-commit.

## 2. Quick start

Prasyarat:

* Node.js 24
* pnpm 12.14.0
* Docker Desktop
* Go 1.26.11
* Git Bash di Windows

Dari root repository:

```bash
bash scripts/dev-up.sh
```

Skrip ini:

1. Membuat `.env` dari `.env.example` bila belum ada.
2. Menyamakan JWT key dan gateway secret untuk service dan edge.
3. Menjalankan PostgreSQL, migrasi, dan seed.
4. Membangun paket, service, dan Go worker.
5. Menjalankan governance `4101`, claims `4102`, payroll `4103`, worker `4004`, edge `8787`, web `5173`.
6. Menjalankan Grafana `3000`, Jaeger `16686`, Prometheus `9090`, collector `4317/4318`.
7. Menunggu health check dan mencetak akun demo.

Hentikan semua:

```bash
bash scripts/dev-down.sh
```

Data PostgreSQL tetap tersimpan. Untuk reset data, lihat bagian 8.

## 3. Akun demo

Kata sandi semua akun: **`AletheiaDemo!2026`**. MFA nonaktif.

| Email | Role | Tenant | Cabang |
| --- | --- | --- | --- |
| `officer.bdg@aletheia.id` | CLAIMS_OFFICER | SAU | BDG-01 |
| `officer.sby@aletheia.id` | CLAIMS_OFFICER | SAU | SBY-01 |
| `manager.bdg@aletheia.id` | BRANCH_MANAGER | SAU | BDG-01 |
| `finance.vp@aletheia.id` | FINANCE_MANAGER | SAU | JKT-HQ |
| `hr.ops@aletheia.id` | HR_SPECIALIST | SAU | JKT-HQ |
| `compliance@aletheia.id` | COMPLIANCE_ADMIN | SAU | JKT-HQ |
| `mis.analyst@aletheia.id` | MIS_ANALYST | SAU | JKT-HQ |
| `compliance@bpui.id` | COMPLIANCE_ADMIN | BPUI | JKT-HQ |

## 4. URL lokal

| Komponen | URL |
| --- | --- |
| Web | `http://localhost:5173` |
| Edge | `http://127.0.0.1:8787` |
| Governance | `http://127.0.0.1:4101` |
| Claims | `http://127.0.0.1:4102` |
| Payroll | `http://127.0.0.1:4103` |
| Worker | `http://127.0.0.1:4004` |
| Grafana | `http://localhost:3000` |
| Jaeger | `http://localhost:16686` |
| Prometheus | `http://localhost:9090` |

Gunakan `localhost:5173`, bukan `127.0.0.1:5173`, karena Vite lokal listen di IPv6 localhost.

## 5. Database

`scripts/dev-up.sh` memakai aturan berikut:

1. Jika container `aletheia-postgres-test` ada, gunakan port `55432`. Ini kondisi mesin handover saat ini.
2. Jika tidak ada, jalankan `docker compose --profile local-db up -d postgres` pada port `5432`.

Database URL yang dipakai:

```text
postgresql://aletheia:aletheia@localhost:55432/aletheia
```

atau

```text
postgresql://aletheia:aletheia@localhost:5432/aletheia
```

Perintah manual:

```bash
pnpm db:migrate
pnpm db:seed
pnpm db:check
```

Evidence database terakhir:

* 26 tabel, 26 policy RLS.
* Audit chain valid; SAU 29.328 baris saat verifikasi M5.2.
* `pnpm security:db`: 35/35 checks lulus.
* `pnpm security:audit`: semua tenant valid.

## 6. Verifikasi

Gate cepat:

```bash
pnpm verify
```

Gate lengkap:

```bash
pnpm test:coverage
pnpm test:a11y
pnpm test:e2e
RUN_FULL_E2E=1 pnpm test:e2e
pnpm security:db
pnpm security:audit
pnpm security:pii
pnpm security:deps
```

Hasil terakhir:

| Gate | Hasil |
| --- | --- |
| `pnpm verify` | Lulus |
| Coverage domain | 96,26% lines, 96,33% statements, 99,08% functions, 89,92% branches |
| E2E | 21/21 lulus dua run berturut-turut |
| Flaky | 0 |
| Axe | 0 serious/critical pada 9 layar |
| Integration | 27 governance, 36 claims, 34 payroll |
| Go race | Lulus |
| RLS | 35/35 |
| Audit chain | Valid |
| PII scan | 191 file, 0 temuan |
| Gitleaks, Semgrep, Trivy, pnpm audit, govulncheck | 0 temuan |

Load test:

```bash
pnpm load:seed
pnpm load:smoke
pnpm load:claims-read
pnpm load:claim-submit
pnpm load:approval-race
pnpm load:payroll-batch
pnpm load:mis-dashboard
pnpm load:payment-retry
```

Untuk load test, naikkan `RATE_LIMIT_READ_MAX`, `RATE_LIMIT_MUTATION_MAX`, dan `RATE_LIMIT_GRAPHQL_MAX` di `apps/edge-gateway/.dev.vars`, lalu restart edge. Jika tidak, edge akan mengembalikan 429 sebelum skenario selesai. Tidak perlu menurunkan threshold.

Catatan Windows: jika `pnpm exec playwright` gagal karena PATH mengandung spasi, gunakan:

```bash
cd apps/web
node node_modules/@playwright/test/cli.js test
```

atau dari root gunakan `pnpm test:e2e`, yang sudah memakai pemanggilan Node tersebut.

## 7. Peta repository

```text
apps/
  web/                  React SPA, Playwright E2E
  edge-gateway/         Hono edge, GraphQL BFF, HMAC proxy
services/
  governance-service/   auth, policy, audit, MIS API
  claims-service/       klaim, approval, disbursement
  payroll-service/      payroll, payslip, report, payment
  analytics-worker-go/  kalkulasi, anomali, What-If, generate file
packages/
  database/             Drizzle schema, migration, seed, check
  shared-contracts/     Zod schema, OpenAPI
  payments/             mock payment provider
  observability/        OTel Node SDK, metrics, tracing
infra/
  docker/               Dockerfile Express dan Go
  observability/        collector, Prometheus, alert, Grafana
tests/load/             k6 dan helper
scripts/                dev-up, dev-down, security, load, evidence
docs/                   spesifikasi, ADR, evidence, handover
```

## 8. Reset data

Hentikan stack, lalu pilih salah satu:

```bash
# Seed ulang tanpa menghapus tabel
bash scripts/dev-down.sh
pnpm db:seed
bash scripts/dev-up.sh
```

Untuk database benar-benar bersih, hapus container dan volume demo, lalu jalankan `bash scripts/dev-up.sh`. Jangan hapus volume jika masih membutuhkan data demo saat ini.

Data load test dapat dibuat ulang:

```bash
pnpm load:seed
```

## 9. Evidence

Indeks lengkap ada di `docs/evidence/README.md`. Mulai dari:

* `docs/evidence/m5.3-verification.md` — E2E, axe, coverage, race.
* `docs/evidence/m5.2-verification.md` — OTel, SLO, load test, query plan.
* `docs/evidence/m5.1-verification.md` — RLS, security scan, audit chain.
* `docs/evidence/load/` — 7 skenario k6.
* `docs/evidence/slo/` — screenshot dashboard dan trace.
* `docs/evidence/query-plans/` — before/after EXPLAIN.

## 10. Batasan dan risiko yang masih terbuka

| Item | Status | Tindakan |
| --- | --- | --- |
| Service memakai role pemilik DB | Terbuka | TASK-18: pool service sebagai `aletheia_app`, set `app.tenant_id` per transaksi |
| Edge preview tidak resolve | Terbuka | Deploy ulang edge di TASK-18 |
| QStash belum aktif | Terbuka | Konfigurasi Upstash di TASK-18; load test memakai worker langsung |
| UI payslip dan laporan belum ada | Terbuka | API sudah diverifikasi M3.4; UI dapat menjadi task lanjutan |
| RUM LCP/INP belum ada | Terbuka | Tambah web-vitals atau RUM di TASK-18 |
| Label Prometheus kardinalitas tinggi | Terbuka | Gunakan `resource_constant_labels` atau transform collector |
| Semua perubahan belum di-commit | Terbuka | Commit sebelum handover ke mesin lain |
| CI E2E full-stack belum ada | Terbuka | TASK-18 menambahkan job E2E dengan service stack |

## 11. Troubleshooting

**Port sudah dipakai**

```bash
bash scripts/dev-down.sh
```

**Login 401 setelah generate key**

Jalankan `node scripts/generate-dev-keys.mjs`, lalu restart service dan edge. Skrip sekarang menyamakan `INTERNAL_GATEWAY_SECRET` di `.env` dan `.dev.vars`.

**Web tidak bisa dibuka di 127.0.0.1**

Gunakan `http://localhost:5173`.

**Edge 502**

Service backend belum siap. Cek `.dev/logs/governance.log`, `.dev/logs/claims.log`, `.dev/logs/payroll.log`, dan `.dev/logs/worker.log`.

**Playwright gagal spawn**

Gunakan `pnpm test:e2e` atau `node apps/web/node_modules/@playwright/test/cli.js test`.

**Database tidak ditemukan**

Jalankan `bash scripts/dev-up.sh`; skrip memilih container 55432 atau Compose 5432 secara otomatis.

## 12. Langkah berikutnya

M5.4 TASK-18:

1. Deploy web ke Cloudflare Pages production.
2. Deploy edge ke Cloudflare Workers.
3. Deploy service dan worker ke Koyeb/Render.
4. Neon branch, Upstash Redis, QStash, Cloudinary.
5. Smoke test `/readyz`, rollback, dan observability production.
6. Uji pool service sebagai role non-owner dengan RLS aktif.

Jangan mulai M5.4 tanpa persetujuan pemilik proyek.
