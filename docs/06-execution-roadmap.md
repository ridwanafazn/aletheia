# `06-execution-roadmap.md` — Peta Jalan Eksekusi & Protokol *Agentic Sprint* Aletheia

* **Status Dokumen:** Peta Jalan Eksekusi (*Single Source of Truth* untuk Agen OpenCode)
* **Strategi:** *Contract-First, Vertical Slice, Evidence-Driven, Zero Context Drift*
* **Kondisi Saat Ini:** Fase 0, M1.1–M1.3, M2.1–M2.3, M3.1–M3.4, M4.1, M4.2, M5.1–M5.4, M6.1, M6.3, M6.4, dan M6.5 selesai. M5.4 live di Render, Neon, Upstash, Cloudinary, dan Cloudflare; smoke production 15/15, async QStash/worker ~5 detik, login enam peran, UI web, serta rollback edge, Pages, dan Render terverifikasi. M6.2 live; Production Monitor baseline `45816325368` dan pasca-drill `45821314200` lulus. Sisa 4 run terjadwal (24 jam), freeze deploy, dan sign-off. M6.3 menambahkan pusat slip gaji dan laporan di web. M6.4 menambahkan employee self-service, e-cuti, dan e-lembur. M6.5 menambahkan reimburse dan struktur organisasi. Render free tier memiliki cold start; jalankan `pnpm warm:production` sebelum demo. Bukti: `docs/evidence/m5.4-verification.md`, `docs/evidence/m6.1-verification.md`, `docs/evidence/m6.2-verification.md`, `docs/evidence/m6.3-verification.md`, `docs/evidence/m6.4-verification.md`, `docs/evidence/m6.5-verification.md`.

## 1. Protokol Kerja Agen

1. **Context loading selektif** — baca `docs/00` + hanya dokumen pada **Konteks Wajib** task aktif.
2. **Contract check** — pastikan Zod/OpenAPI/SDL/migrasi selaras sebelum menulis kode.
3. **Implementation terbatas** — hanya di direktori scope task; patuhi batasan keras.
4. **Verification gate** — jalankan perintah gate, simpan bukti, jangan klaim tanpa output.
5. **Evidence update** — perbarui `docs/13-job-targeting-matrix.md` dan `CHANGELOG.md`.
6. **Stop rule** — jika gate gagal, perbaiki atau laporkan; jangan lanjut task berikutnya.

## 2. Fase & Task

---

### FASE 0 — Desain, Agent & Kesiapan (SELESAI)

#### `TASK-00` — Dokumentasi, ADR, Agents, Skills & Design References
* **Status:** selesai.
* **Cakupan:** 18 dokumen (`00`–`16`, `13a`), `README.md`, `PRODUCT.md`, `DESIGN.md`, 9 agent, skill `aletheia-finance`, `impeccable`, `payroll-prep`, `plan-payroll`, `cash-flow-snapshot`, `invoice-chase` (dua terakhir reference-only).
* **Gerbang:** dokumen konsisten; ADR mencatat keputusan; agent dapat ditemukan OpenCode.
* **Catatan:** tidak ada kode produk; inisialisasi ditunda sampai persetujuan.

---

### FASE 1 — Fondasi Monorepo, Kontrak & Data

#### `TASK-01` — Inisialisasi Monorepo, Tooling & Infrastruktur Lokal
* **Status:** selesai 25 November 2026. Bukti: `docs/evidence/m1.1-verification.md`.
* **Konteks Wajib:** `docs/01`, `docs/05`, `docs/12`, ADR-001.
* **Cakupan:**
  * pnpm workspace (`apps/*`, `services/*`, `packages/*`, `tests/*`).
  * `tsconfig.base.json` strict, ESLint, Prettier, `.env.example`, `scripts/verify-all.sh`.
  * `infra/docker/express-service.Dockerfile`, `go-worker.Dockerfile`, `infra/nginx/nginx.conf`, `docker-compose.yml`.
  * CI skeleton dengan path filter.
* **Gerbang:** `pnpm -r typecheck`; `docker compose config`; `scripts/verify-all.sh` exit 0.

#### `TASK-02` — Shared Contracts (`packages/shared-contracts`)
* **Status:** selesai 25 November 2026. Bukti: `docs/evidence/m1.2-verification.md`.
* **Konteks Wajib:** `docs/00`, `docs/03`, `docs/04`, `docs/11`.
* **Cakupan:**
  * Zod: auth, tenant, policy (`CLAIMS_POLICY`, `PAYROLL_TAX_POLICY`), claims, decisions, payroll, payslip, reports, payments, employees, attendance, leave.
  * `ApiResponse<T>`, `ErrorCode`, pagination, idempotency header.
  * OpenAPI generation + GraphQL SDL.
  * `packages/payments`: `PaymentProvider` interface + `MockPaymentProvider` (adapter nyata di TASK-12).
* **Gerbang:** `pnpm --filter @aletheia/shared-contracts test`; schema valid diterima, invalid ditolak; OpenAPI valid.

#### `TASK-03` — Skema PostgreSQL, RLS, Audit Trigger & Seed
* **Status:** selesai 25 November 2026. Bukti: `docs/evidence/m1.3-verification.md`.
* **Konteks Wajib:** `docs/02`, `docs/04`, `docs/08`, `docs/11`, ADR-004/007/008/013.
* **Cakupan:**
  * Migrasi 4 skema + `governance.tenants`, `refresh_tokens`, `mfa_recovery_codes`, `claims.disbursements`, `payroll.sales_achievements`, `attendance_summaries`, `leave_requests`, `payslips`, `tax_reports`, `tax_reconciliations`, `payments`.
  * RLS policies, audit trigger + `append_audit_log()` + advisory lock, UUIDv7.
  * Index strategis, materialized view, seed idempoten.
* **Gerbang:** migrasi bersih di PostgreSQL 16 lokal; I-04, I-06, I-15 lulus; `EXPLAIN` untuk query kunci. Neon branch production sudah dibuat dan dimigrasi (0000–0011).

#### `TASK-03A` — CI Quality Gate & Security Baseline
* **Status:** sebagian. Job typecheck, lint, test, format, Go, compose, Gitleaks, Semgrep, Trivy, pnpm audit, govulncheck, RLS audit, PII scan, dan audit chain aktif. Coverage gate aktif dengan threshold 90% dan lulus di M5.3. Workflow sudah dijalankan pada push `main`; PR nyata dan E2E full-stack belum menjadi job CI.
* **Konteks Wajib:** `docs/05`, `docs/10`.
* **Cakupan:** typecheck, lint, unit, integration, gitleaks, trivy, semgrep, coverage; cache pnpm; artifact.
* **Gerbang:** pipeline hijau di PR dummy; tidak ada secret/CRITICAL.

---

### FASE 2 — Vertical Slice: Klaim (BE → FE → Deploy Preview)

> **Urutan eksekusi:** TASK-04 → TASK-05 → TASK-08 → TASK-09. TASK-06/07 (payroll BE) boleh berjalan paralel setelah kontrak stabil. Jangan menunggu seluruh backend selesai sebelum membangun FE klaim.

#### `TASK-04` — Governance Service (Auth, Tenant, RBAC, Policy, Audit)
* **Status:** selesai 26 November 2026. Bukti: `docs/evidence/m2.1-verification.md`.
* **Konteks Wajib:** `docs/00`, `docs/02`, `docs/03`, `docs/08`, `docs/14`.
* **Cakupan:** login/refresh rotation, MFA, tenant/RBAC, policy draft/approve/publish atomic + dual control, audit read/verify, HMAC gateway middleware, `/healthz`, `/readyz`, pino redaction.
* **Gerbang:** publish policy mengarsipkan versi lama (I-07); forged header 401 (I-11); missing policy key (I-12); audit chain valid.
* **Catatan:** `MFA_ENFORCED=false` pada demo; produksi wajib mengaktifkan dan mendaftarkan MFA privileged. Rate limit login menunggu Upstash di TASK-08.

#### `TASK-05` — Claims Service (Submit, Upload, Decide, Disburse)
* **Status:** selesai 26 November 2026. Bukti: `docs/evidence/m2.2-verification.md`.
* **Konteks Wajib:** `docs/00`, `docs/03`, `docs/04`, `docs/11`, ADR-011.
* **Cakupan:** upload signature, submit dengan policy binding + idempotency, decision dengan `FOR UPDATE NOWAIT` + SoD, risk event ke QStash, disbursement via `packages/payments`.
* **Gerbang:** I-01, I-02, I-11, I-12 lulus.
* **Catatan:** evaluasi risiko berjalan sinkron sebagai jalur utama; worker Go M3.2 memeriksa `risk_evaluated_at` dan melewati klaim yang sudah dievaluasi. Event QStash tetap dikirim. Provider `XENDIT`/`MIDTRANS` belum dikonfigurasi, demo memakai `MOCK`.

#### `TASK-06` — Payroll Service (Personnel, Batch, Reports Orchestration)
* **Status:** selesai 26 November 2026. Bukti: `docs/evidence/m3.1-verification.md`.
* **Konteks Wajib:** `docs/02`, `docs/03`, `docs/04`, `docs/11`.
* **Cakupan:** employee/agent CRUD dengan hash+mask, sales achievements, attendance/leave summary, batch create/calculate, approval dan disbursement terpisah (`payroll.payments`, SoD), payslip/report request.
* **Gerbang:** batch dikirim sebagai 1 pesan QStash; idempotency; I-13, I-14; payslip/report metadata benar.
* **Catatan:** kalkulasi PPh 21/BPJS tetap milik TASK-07. Tanpa worker, batch berhenti di `CALCULATING`. Payslip dan report request menghasilkan event `QUEUED`, bukan PDF final.

#### `TASK-07` — Go Worker (Payroll, Anomaly, What-If, MV Refresh)
* **Status:** selesai 26 November 2026. Bukti: `docs/evidence/m3.2-verification.md`.
* **Konteks Wajib:** `docs/01`, `docs/04`, `docs/05`, `docs/09`, `docs/11`.
* **Cakupan:** pgx pool, shopspring/decimal, slog, QStash signature, 4 handler, worker pool, read-only tx untuk What-If.
* **Gerbang:** `go test -race -v ./...`; U-01..U-08/U-13/U-14/U-15 di worker; I-05; batch 500 item < 60s (lokal).
* **Catatan gate:** U-09..U-12, U-16..U-19 sudah tercakup pengujian M2. U-20 dan I-09 membutuhkan payslip PDF dan rekonsiliasi tahunan sehingga dieksekusi pada TASK-11. Batch 500 item selesai 214 ms. Tidak ada item yang ditulis untuk batch non-`CALCULATING`, dan replay tidak menambah item atau audit.

#### `TASK-08` — Edge Gateway (REST Proxy + GraphQL BFF)
* **Status:** selesai 26 November 2026. Bukti: `docs/evidence/m2.3-verification.md`.
* **Konteks Wajib:** `docs/01`, `docs/03`, `docs/08`.
* **Cakupan:** Hono, JWT verify, rate limit, HMAC headers, REST proxy, GraphQL Yoga (`misExecutiveSummary`, `claimAuditDetail`, `whatIfSimulations`), depth limit, DataLoader.
* **Gerbang:** `wrangler dev` smoke; header valid; GraphQL tanpa N+1; 429 berfungsi.
* **Catatan:** Live di `aletheia-edge.ridwanafzn.workers.dev`; preview lama `aletheia-edge-preview.ridwanafzn.workers.dev` juga masih aktif. Upstash Redis production aktif untuk rate limit.

#### `TASK-09` — Web Shell, Claims Workbench & Approval Queue
* **Status:** selesai 26 November 2026. Bukti: `docs/evidence/m2.3-verification.md`.
* **Konteks Wajib:** `docs/07`, `PRODUCT.md`, `DESIGN.md`, skill `impeccable`.
* **Cakupan:** app shell, auth, route guard, claims list/form/detail, upload, approval queue, decision dialog, audit drawer.
* **Gerbang:** typecheck/build < 200 KB; Playwright smoke; axe; screenshot desktop/mobile.
* **Catatan:** live di `aletheia-web-preview.pages.dev`. Initial JavaScript 140,7 KB gzip. Backend production live di Render; tidak ada tunnel.

---

### FASE 3 — Payroll & HRIS-lite

> **Urutan eksekusi:** TASK-06/07 (BE) → TASK-10 (FE payroll) → TASK-11 (payslip/report) → TASK-12 (payment). FE dimulai setelah kontrak batch/kalkulasi stabil; jangan menunggu seluruh laporan selesai.

#### `TASK-10` — Payroll Console & Employee Directory (FE)
* **Konteks Wajib:** `docs/07`, `docs/11`, `PRODUCT.md`, `DESIGN.md`.
* **Cakupan:** batch list/create/detail, calculation progress, breakdown, variance, employee directory, attendance/leave summary, approval/disburse.
* **Gerbang:** E2E payroll; I-08; screenshot; a11y.

#### `TASK-11` — Payslip, PPh 21/BPJS Reports & Bank File
* **Konteks Wajib:** `docs/04`, `docs/11`, `docs/03`.
* **Cakupan:** payslip PDF dari breakdown, PPh 21 monthly/annual, BPJS monthly, bank file, variance, checksum, signed download, audit.
* **Gerbang:** I-08, I-09, I-10; total rekonsiliasi 0.00; file checksum stabil.

#### `TASK-12` — Payment Adapter & Disbursement End-to-End
* **Konteks Wajib:** `docs/04`, `docs/08`, ADR-005/011.
* **Cakupan:** `PaymentProvider` adapter (Xendit/Midtrans opsional), webhook idempotent, state machine, claims/payroll integration. Interface + mock sudah dibuat di TASK-02.
* **Gerbang:** I-03, I-14, I-16; `PAID` hanya dari provider; reversal + audit.

---

### FASE 4 — MIS & GraphQL

#### `TASK-13` — MIS Analytics, Materialized View & What-If
* **Konteks Wajib:** `docs/04`, `docs/09`, `docs/11`.
* **Cakupan:** KPI MV, refresh concurrent, What-If replay read-only, variance, cache invalidation, GraphQL resolvers.
* **Gerbang:** I-05; KPI < 500ms; What-If tidak mengubah data produksi.

#### `TASK-14` — MIS Dashboard & What-If Sandbox (FE)
* **Konteks Wajib:** `docs/07`, `PRODUCT.md`, `DESIGN.md`.
* **Cakupan:** KPI cards, tren, filter, drill-down, side-by-side variance, simulation badge.
* **Gerbang:** E2E MIS; chart accessible; screenshot; a11y.

---

### FASE 5 — Hardening

#### `TASK-15` — Tenant RLS Audit, Security Hardening & Probes
* **Status:** selesai 26 November 2026. Bukti: `docs/evidence/m5.1-verification.md`.
* **Konteks Wajib:** `docs/08`, `docs/10`, ADR-003/004.
* **Cakupan:** audit RLS semua tabel (policy sudah dibuat di TASK-03), cross-tenant read/write tests, rate limit, CSP/CORS, PII scan, dependency dan image scan, audit verification job.
* **Gerbang:** I-06, I-11, I-15 lulus; RLS audit 35/35; Gitleaks, Semgrep, Trivy, pnpm audit, dan govulncheck bersih; security checklist lulus.
* **Catatan:** temuan role pemilik database ditutup pada M5.4. Service runtime memakai `aletheia_app` dengan tenant binding per request/transaksi; provisioning password role production sudah dilakukan. Bukti: `docs/evidence/m5.4-verification.md`.

#### `TASK-16` — Observability, SLO & Load Test
* **Status:** selesai 26 November 2026. Bukti: `docs/evidence/m5.2-verification.md`.
* **Konteks Wajib:** `docs/09`, `docs/05`.
* **Cakupan:** OTel trace/metrics/logs, dashboard, alert, k6 7 skenario, query optimization, evidence.
* **Gerbang:** SLO terukur; 7 skenario k6 lulus; dashboard dan alert aktif; query plan membaik; bukti di `docs/evidence/`.
* **Catatan:** QStash kini aktif; load test historis memanggil worker langsung. Edge hanya meneruskan `traceparent`; exporter span edge dan RUM LCP/INP ditunda ke task lanjutan.

#### `TASK-17` — E2E, Accessibility & Final QA
* **Status:** selesai 26 November 2026. Bukti: `docs/evidence/m5.3-verification.md`.
* **Konteks Wajib:** `docs/10`, `docs/07`.
* **Cakupan:** 21 test Playwright, 10 alur peran, axe pada layar kritis, keyboard-only, race, coverage domain, flaky policy.
* **Gerbang:** 21/21 lulus dua run berturut-turut; 0 flaky; axe 0 serious/critical; coverage domain 96,26% lines; integration 27/36/34 lulus; Go race lulus.

#### `TASK-18` — CI/CD Production & Deployment
* **Status:** selesai live 26 November 2026. Render menjalankan governance, claims, payroll, dan worker; Neon production aktif; Upstash QStash dan Cloudinary aktif; edge Workers dan web Pages live. Smoke production 15/15; async QStash/worker ~5 detik; web UI 3 peran; rollback edge, Pages, dan Render diuji. Production Monitor baseline `45816325368` dan pasca-drill `45821314200` lulus; sign-off menunggu 4 run terjadwal.
* **Konteks Wajib:** `docs/05`, `docs/12`.
* **Cakupan:** pipeline deploy, Cloudflare Pages/Workers, Render, Neon/Upstash/Cloudinary, smoke test, rollback.
* **Gerbang:** `/readyz` 200; demo live; rollback diuji; tidak ada secret.
* **Catatan:** bukti prasyarat ada di `docs/evidence/m5.4-verification.md`. CI database job sekarang mem-provision role dan menjalankan integration test dengan `DATABASE_URL_APP`. Runbook launch/rollback ada di `docs/runbooks/m6.2-launch.md`; preflight `pnpm deploy:check`; smoke `pnpm smoke:production`.

---

### FASE 6 — Portofolio

#### `TASK-19` — README, Screenshot, Video & Job Matrix
* **Status:** aset selesai 26 November 2026. README final, 8 screenshot inti + 3 mobile, video 2:16, akun demo, CHANGELOG, dan job matrix aktual tersedia. Live URL production aktif; async QStash dan rollback edge/Pages/Render lulus; M6.2 tinggal monitoring 24 jam dan sign-off.
* **Konteks Wajib:** `docs/12`, `docs/13`.
* **Cakupan:** README final, 8 screenshot desktop/mobile, video 2–3 menit, akun demo, CHANGELOG, job matrix status 3/4.
* **Gerbang:** reviewer dapat menjalankan demo < 3 menit; semua evidence ada; matrix ≥ 100%.
* **Catatan:** bukti di `docs/evidence/m6.1-verification.md`; screenshot dan video di `docs/evidence/m6.1/`. UI payslip/report selesai di M6.3; ESS/e-cuti/e-lembur selesai di M6.4; reimburse/organisasi selesai di M6.5. Bukti: `docs/evidence/m6.3-verification.md`, `docs/evidence/m6.4-verification.md`, dan `docs/evidence/m6.5-verification.md`.

---

## 3. Urutan Demo yang Harus Selalu Hidup

1. Login 6 peran.
2. Claims: submit → risk/conflict → approve/SoD → disburse.
3. Payroll: batch → calculate → variance → approve → disburse → payslip.
4. Reports: PPh 21 monthly/annual, BPJS, bank file.
5. MIS: KPI → What-If → variance.
6. Compliance: publish policy → transaksi lama tetap versi lama → audit chain valid.

Jika salah satu langkah mati, milestone belum selesai.

## 4. Seed Data Wajib (`pnpm db:seed`)

1. **Tenant:** `SAU-DEMO` (dan opsional `BPUI-DEMO` untuk uji isolasi).
2. **Cabang:** `JKT-HQ` (Rp 1.5 M), `BDG-01` (Rp 600 jt), `SBY-01` (Rp 750 jt).
3. **Akun:** 6 peran + 1 karyawan self-service; password demo hanya di README.
4. **Policy:** `v2026.10.01` (ARCHIVED), `v2026.11.01` (ACTIVE) per tenant.
5. **Kasus:**
   * A: klaim normal Surabaya, policy lama, approved + audit.
   * B: klaim Bandung Rp 18.5 jt, rekening sama dengan agen → `SHARED_BANK_ACCOUNT`, eskalasi.
   * C: batch payroll campuran TK/0, K/1, K/3 + agen komisi; payslip + laporan.
   * D: klaim tenant lain untuk uji isolasi (tidak terlihat).
6. **Idempoten:** seed dapat dijalankan ulang tanpa duplikasi.

## 5. Definition of Done per Task

- [ ] Kode + test + docs + ADR (jika perlu).
- [ ] Gate verifikasi lulus dengan output.
- [ ] Bukti disimpan (test report/screenshot/load/query plan).
- [ ] Tidak ada BLOCKER security/finance.
- [ ] Job matrix diperbarui.
- [ ] Tidak ada `TODO` tanpa issue.

## 6. Template Prompt Eksekusi

```text
Baca docs/00-context-and-vision.md dan [DOKUMEN KONTEKS TASK].
Eksekusi [TASK-XX] dari docs/06-execution-roadmap.md.

Aturan:
1. Patuhi seluruh "Batasan Keras" pada dokumen terkait dan docs/14 ADR.
2. Gunakan tipe dari packages/shared-contracts; jangan duplikasi DTO.
3. Jangan lanjut sebelum Gerbang Verifikasi lulus 100% dan bukti disimpan.
4. Jika ada keputusan yang mengubah arsitektur/scope, berhenti dan tanya pengguna.
5. Perbarui docs/13-job-targeting-matrix.md setelah selesai.
```

## 7. Batasan Keras Roadmap

> 1. Dilarang memulai TASK-01 tanpa persetujuan eksplisit.
> 2. Dilarang melewati gate verifikasi atau menandai selesai tanpa bukti.
> 3. Dilarang menambah full HRIS/THR/shift ke milestone tanpa keputusan baru.
> 4. Dilarang memecah repo atau mengganti stack tanpa ADR baru.
> 5. Dilarang mengorbankan invarian finansial demi kecepatan demo.
