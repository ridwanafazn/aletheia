# `docs/evidence` — Indeks Bukti Teknis

Folder ini menyimpan bukti yang dapat diperiksa reviewer: verifikasi milestone, hasil load test, query plan, screenshot SLO, dan demo access.

## Milestone

| File | Isi | Status |
| --- | --- | --- |
| `m1.1-verification.md` | Fondasi workspace dan tooling | Selesai |
| `m1.2-verification.md` | Kontrak, database, dan policy | Selesai |
| `m1.3-verification.md` | Edge, auth, dan observability dasar | Selesai |
| `m2.1-verification.md` | Governance service | Selesai |
| `m2.2-verification.md` | Claims service | Selesai |
| `m2.3-verification.md` | Edge BFF dan web workbench | Selesai |
| `m3.1-verification.md` | Payroll service | Selesai |
| `m3.2-verification.md` | Go worker dan kalkulasi | Selesai |
| `m3.3-verification.md` | Payroll console dan employee directory | Selesai |
| `m3.4-verification.md` | Payslip, laporan, payment lifecycle | Selesai |
| `m4.1-verification.md` | MIS backend | Selesai |
| `m4.2-verification.md` | MIS frontend | Selesai |
| `m5.1-verification.md` | RLS, security hardening, scan | Selesai |
| `m5.2-verification.md` | OTel, SLO, load test, query optimization | Selesai |
| `m5.3-verification.md` | E2E, axe, coverage, final QA | Selesai |
| `m5.4-verification.md` | Runtime RLS, role `aletheia_app`, tenant binding, worker Go, deployment | Live di Render/Cloudflare/Neon/Upstash/Cloudinary |
| `m6.1-verification.md` | README, screenshot, video, akun demo, CHANGELOG, job matrix | Aset selesai; live URL aktif |
| `m6.2-verification.md` | Smoke, web UI, async QStash, rollback edge/Pages/Render, cold start, monitoring | Live; monitoring 24 jam berjalan |
| `m6.3-verification.md` | Pusat slip gaji, laporan PPh 21/BPJS, E2E, axe, bundle | Selesai 26 November 2026 |
| `m6.4-verification.md` | Employee self-service, e-cuti, e-lembur, SoD, E2E, axe | Selesai 26 November 2026 |
| `m6.5-verification.md` | Reimburse, organization management, E2E, axe | Selesai 27 November 2026 |
| `m6.6-verification.md` | Paket tenant, feature gating, invoice biaya payroll, E2E, axe | Selesai 27 November 2026 |
| `stage-3a-leave-attendance.md` | Approval cuti ke attendance summary, cuti lintas bulan, guard kapasitas, test | Selesai 27 November 2026 |
| `design-phase1-verification.md` | Quiet Ledger foundation, tokens, shell, komponen, E2E, axe | Selesai 27 November 2026 |
| `design-phase2-verification.md` | Overview, reports v2, organization v2, charts, E2E, axe | Selesai 27 November 2026 |
| `design-phase3-verification.md` | Payroll, employees, workforce, ruang saya, claims, E2E, axe | Selesai 27 November 2026 |
| `design-phase4-verification.md` | MIS v2, audit ledger, motion, mobile polish, E2E, axe | Selesai 27 November 2026 |
| `design-phases-production-deploy.md` | Deploy production M6.3–M6.6 dan desain fase 1–4, migrasi, smoke, async | Live 27 November 2026 |

## Load test

`load/` berisi:

* `2026-11-26-summary.md`
* `2026-11-26-smoke.md`
* `2026-11-26-claims-read.md`
* `2026-11-26-claim-submit.md`
* `2026-11-26-approval-race.md`
* `2026-11-26-payroll-batch.md`
* `2026-11-26-mis-dashboard.md`
* `2026-11-26-payment-retry.md`

Semua threshold lulus. Tidak ada threshold yang diturunkan.

## Query plan

`query-plans/` berisi:

* `README.md`
* `before-claims-list.txt`
* `after-claims-list.txt`
* `after-claims-tenant-list.txt`
* `before-audit-list.txt`
* `after-audit-list.txt`

Hasil utama: daftar klaim per cabang 5,853 ms menjadi 1,183 ms; daftar klaim per tenant 0,290 ms.

## SLO dan observability

`slo/` berisi:

* `index.html` — galeri bukti.
* `m5.2-overview.png`
* `m5.2-domain.png`
* `m5.2-data-layer.png`
* `m5.2-jaeger-trace.png`

## Demo

* `demo-access.md` — akun, role, URL, cara menjalankan ulang.
* `m5.3/coverage-summary.json` — ringkasan coverage domain.
* `m6.1/` — 8 screenshot inti, 3 mobile, dan `aletheia-demo.webm` (2:16).
* `m6.1/screenshots.md` — indeks screenshot inti.
* `m6.3/` — screenshot slip gaji, laporan, dan slip gaji mobile.
* `m6.4/` — screenshot Ruang Saya, absensi, cuti/lembur, workforce, dan mobile.
* `m6.5/` — screenshot reimburse dan struktur organisasi.
* `m6.6/` — screenshot invoice biaya payroll dan badge paket tenant.
* `design-phase1/` — screenshot Quiet Ledger foundation: login, payroll, reports, organization, mobile reports.
* `design-phase2/` — screenshot overview, reports v2, organization v2, dan mobile overview.
* `design-phase3/` — screenshot payroll, karyawan, workforce, reimburse, klaim, ruang saya, dan mobile.
* `design-phase4/` — screenshot MIS, What-If, audit, audit terverifikasi, mobile MIS/audit, dan verifikasi web production.

## Metadata

Setiap bukti baru wajib mencantumkan:

* Tanggal dan lingkungan.
* Perintah reproduksi.
* Hasil ringkas.
* Analisis singkat bila ada kegagalan.
* Tanpa PII, token, atau kredensial.

Baseline M1–M5.3 ada pada commit `a302555` dan tag `v0.5.3`. Perubahan M5.4 runtime dicatat pada riwayat Git setelah baseline tersebut.
