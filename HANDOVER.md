# Aletheia — Handover

* **Status:** M1–M5.4 dan M6.1–M6.6 live di production. Web, edge, empat service Render, Neon, Upstash QStash, dan Cloudinary aktif; smoke production 15/15 lulus; async QStash/worker terverifikasi; login tujuh peran, UI web, serta rollback edge, Pages, dan Render terverifikasi. M6.2 live dengan monitoring 24 jam berjalan via workflow Production Monitor. M6.3 menambahkan pusat slip gaji dan laporan di web. M6.4 menambahkan employee self-service, e-cuti, dan e-lembur. M6.5 menambahkan reimburse dan struktur organisasi. M6.6 menambahkan paket tenant dan invoice biaya payroll. Stage 3A menautkan approval cuti ke attendance summary payroll. **Web production live di commit `21c0a9a`; demo dataset 15 bulan dan panduan PDF tujuh peran sudah aktif.**
* **Status progresi:** UI Phase 0–2 dan Phase 5 selesai 27 November 2026; Phase 3–4 sengaja ditunda. Snapshot, verifikasi, dan cara melanjutkan ada di [`docs/FINAL-STATUS.md`](docs/FINAL-STATUS.md); sistem visual ada di [`DESIGN.md`](DESIGN.md). Web production di `21c0a9a`, service Render di `04962c3`, database sudah berisi histori 15 bulan.
* **Tanggal handover:** 26 November 2026, diperbarui 27 November 2026.
* **Data:** seluruhnya sintetis. Tidak ada uang nyata atau PII nyata.
* **Server demo:** production aktif di `https://aletheia-web-preview.pages.dev`; stack lokal dinyalakan dengan `bash scripts/dev-up.sh`.

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

**Yang sudah selesai:** M1 fondasi, M2 governance dan claims, M3 payroll dan disbursement, M4 MIS, M5.1 security hardening, M5.2 observability dan load test, M5.3 E2E/accessibility/final QA, M5.4 production live di Render/Neon/Cloudflare/Upstash/Cloudinary, M6.1 README/screenshot/video/CHANGELOG/job matrix, M6.3 pusat slip gaji dan laporan di web, M6.4 employee self-service, e-cuti, serta e-lembur, M6.5 reimburse serta struktur organisasi, M6.6 paket tenant serta invoice biaya payroll, Stage 3A sinkronisasi cuti ke attendance summary, serta UI Phase 0–2 dan Phase 5 (Daylight workspace, command palette, home per peran, sidebar scroll, dan CSP font production).

**Yang belum selesai:**

* Monitoring production berkelanjutan; Production Monitor berjalan tiap 6 jam. Sign-off M6.2 ditunda dan automation finalisasi sedang paused (1/4 run terjadwal).
* UI Phase 3–4 (form clarity dan mobile table-to-card) ditunda dan tercatat sebagai backlog.
* Cold start Render free tier; mitigasi `pnpm warm:production` dan workflow `Warm Production` tiap 10 menit. `pnpm deploy:check` sudah lulus; runbook ada di `docs/runbooks/m6.2-launch.md`.
* Performance review, CRUD organisasi dan org chart visual, serta kebijakan reimburse. Ini modul HRIS berikutnya.
* RUM LCP/INP, exporter span edge, dan label Prometheus kardinalitas tinggi.
* CI E2E full-stack belum menjadi job CI.

**Sudah selesai pada M5.4:**

* Pool service runtime memakai role non-owner `aletheia_app` dengan tenant binding per request/transaksi; RLS aktif.
* Worker Go mengikat tenant dari event ke koneksi `pgxpool`.
* Login, refresh, webhook, dan file download memakai fungsi `SECURITY DEFINER`/signed token untuk resolve tenant.
* Security gate 36/36 dan integration test 27/36/34 lulus dengan role non-owner. Bukti: `docs/evidence/m5.4-verification.md`.

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
| `officer.bdg@aletheia.id` | CLAIMS_OFFICER | SEIHITSU | BDG-01 |
| `officer.sby@aletheia.id` | CLAIMS_OFFICER | SEIHITSU | SBY-01 |
| `manager.bdg@aletheia.id` | BRANCH_MANAGER | SEIHITSU | BDG-01 |
| `finance.vp@aletheia.id` | FINANCE_MANAGER | SEIHITSU | JKT-HQ |
| `hr.ops@aletheia.id` | HR_SPECIALIST | SEIHITSU | JKT-HQ |
| `employee.siti@aletheia.id` | EMPLOYEE | SEIHITSU | BDG-01 |
| `compliance@aletheia.id` | COMPLIANCE_ADMIN | SEIHITSU | JKT-HQ |
| `mis.analyst@aletheia.id` | MIS_ANALYST | SEIHITSU | JKT-HQ |
| `compliance@bpui.id` | COMPLIANCE_ADMIN | BPUI | JKT-HQ |

## 4. URL production

| Komponen | URL |
| --- | --- |
| Web | `https://aletheia-web-preview.pages.dev` |
| Edge | `https://aletheia-edge.ridwanafzn.workers.dev` |
| Governance | `https://aletheia-governance.onrender.com` |
| Claims | `https://aletheia-claims.onrender.com` |
| Payroll | `https://aletheia-payroll.onrender.com` |
| Worker | `https://aletheia-worker-zjnt.onrender.com` |

Workflow **Warm Production** berjalan tiap 10 menit untuk menjaga service Render tetap bangun; jalankan `pnpm warm:production` jika service tetap cold. Production Monitor berjalan tiap 6 jam; baseline `45816325368`, run pasca-drill `45821314200`, dan run terjadwal `45894766221` lulus. Sign-off M6.2 setelah minimal 4 run sukses; 1/4 run terjadwal sudah lulus dan 3 run berikutnya dijadwalkan 27 November 2026 (perkiraan malam WIB, tergantung delay GitHub Actions).

## 4A. URL lokal

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
* Audit chain valid; SEIHITSU 29.682 baris saat verifikasi M5.4.
* `pnpm security:db`: 41/41 checks lulus, termasuk tabel HRIS baru.
* `pnpm security:audit`: semua tenant valid.

Runtime role:

* Service memakai `DATABASE_URL_APP` dengan role `aletheia_app`; `DATABASE_URL` hanya untuk migrasi, seed, check, dan audit.
* `bash scripts/dev-up.sh` mem-provision password role dan menyusun `DATABASE_URL_APP` otomatis.
* `APP_DB_PASSWORD` wajib diisi minimal 12 karakter saat provisioning manual:
  `DATABASE_URL=... APP_DB_PASSWORD=... node scripts/provision-app-role.mjs`.

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
| RLS | 41/41 |
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

* `docs/evidence/stage-3a-leave-attendance.md` — sinkronisasi approval cuti ke attendance summary, batas, dan test.
* `docs/evidence/m6.4-verification.md` — employee self-service, e-cuti, e-lembur, E2E, axe.
* `docs/evidence/m6.5-verification.md` — reimburse, struktur organisasi, E2E, axe.
* `docs/evidence/m6.6-verification.md` — paket tenant, feature gating, invoice biaya payroll, E2E, axe.
* `docs/evidence/m6.3-verification.md` — pusat slip gaji, laporan, E2E, axe, bundle.
* `docs/evidence/m6.1-verification.md` — README, screenshot, video 2:16, CHANGELOG, job matrix.
* `docs/evidence/m5.3-verification.md` — E2E, axe, coverage, race.
* `docs/evidence/m5.2-verification.md` — OTel, SLO, load test, query plan.
* `docs/evidence/m5.1-verification.md` — RLS, security scan, audit chain.
* `docs/evidence/load/` — 7 skenario k6.
* `docs/evidence/slo/` — screenshot dashboard dan trace.
* `docs/evidence/query-plans/` — before/after EXPLAIN.

## 10. Batasan dan risiko yang masih terbuka

| Item | Status | Tindakan |
| --- | --- | --- |
| Service memakai role pemilik DB | Selesai | Semua service production memakai `aletheia_app` + tenant binding |
| Edge production | Selesai | Live di `aletheia-edge.ridwanafzn.workers.dev`; rollback drill lulus |
| QStash belum aktif | Selesai | Upstash QStash aktif; `WORKER_URL` ke `-zjnt`; async What-If diproses worker ~5 detik |
| Monitoring 24 jam M6.2 | Berjalan | Baseline `45816325368`, pasca-drill `45821314200`, dan run terjadwal `45894766221` hijau; 1/4 run terjadwal lulus, sign-off setelah 3 run berikutnya |
| Cold start Render free tier | Terbuka | Jalankan `pnpm warm:production`; pertimbangkan plan berbayar untuk demo tanpa jeda |
| UI payslip dan laporan | Selesai M6.3 | `/payslips`, `/reports`, dan tombol buat slip di detail batch; bukti `docs/evidence/m6.3-verification.md` |
| Employee self-service, e-cuti, e-lembur | Selesai M6.4 | `/me` dan `/workforce`; bukti `docs/evidence/m6.4-verification.md` |
| Reimburse dan struktur organisasi | Selesai M6.5 | `/me` tab Reimburse, `/workforce` tab Reimburse, dan `/organization`; bukti `docs/evidence/m6.5-verification.md` |
| Paket tenant dan invoice biaya payroll | Selesai M6.6 | Plan BASIC/HRIS+/HRIS Pro/Enterprise, badge topbar, feature gating API, report `PAYROLL_COST_INVOICE`; bukti `docs/evidence/m6.6-verification.md` |
| Performance review dan org chart visual | Terbuka | Modul HRIS berikutnya; jangan diklaim sebagai fitur yang sudah ada |
| Integrasi cuti ke attendance summary | Selesai Stage 3A | Approval cuti memperbarui `paid_leave_days`/`unpaid_leave_days`, termasuk cuti lintas bulan; bukti `docs/evidence/stage-3a-leave-attendance.md` |
| RUM LCP/INP belum ada | Terbuka | Tambah web-vitals atau RUM di task lanjutan |
| Label Prometheus kardinalitas tinggi | Terbuka | Gunakan `resource_constant_labels` atau transform collector |
| Perubahan M5.4–M6.2 | Selesai | Commit `e81fca0`, `b829b94`, `fb10579`, `3209231`, `08ad6d7`; lihat riwayat Git |
| CI E2E full-stack belum ada | Terbuka | Tambah job E2E dengan service stack |

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

M6.1 selesai: lihat `README.md`, `docs/evidence/m6.1-verification.md`, dan `docs/evidence/m6.1/aletheia-demo.webm`. M6.3 selesai: lihat `docs/evidence/m6.3-verification.md`. M6.4 selesai: lihat `docs/evidence/m6.4-verification.md`. M6.5 selesai: lihat `docs/evidence/m6.5-verification.md`. M6.6 selesai: lihat `docs/evidence/m6.6-verification.md`.

M5.4 live, smoke 15/15, async QStash lulus, dan rollback edge/Pages/Render sudah diuji. Freeze deploy sudah dicabut pada 27 November 2026; M6.2 live dan sign-off monitoring menunggu 3 run terjadwal berikutnya (1/4 sudah lulus).

Status deploy terbaru:

1. Web production live di commit `21c0a9a`; empat service Render tetap di `04962c3`; database sudah diisi histori 15 bulan dan panduan PDF tujuh peran.
2. Production Monitor tetap berjalan setiap 6 jam.
3. Bukti deploy: `docs/evidence/demo-history-seed.md` dan `docs/evidence/ui-phase5-verification.md`.
4. UI Phase 0–2 dan Phase 5 selesai; Phase 3–4 ditunda (form clarity dan mobile table-to-card).
5. Backlog berikutnya: performance review, CRUD organisasi, pengaturan paket, RUM/edge span, dan CI E2E full-stack. Baca [`docs/FINAL-STATUS.md`](docs/FINAL-STATUS.md) dan [`DESIGN.md`](DESIGN.md).

Untuk demo, jalankan `pnpm warm:production` lebih dulu.
