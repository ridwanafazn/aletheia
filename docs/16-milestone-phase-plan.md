# `16-milestone-phase-plan.md` — Milestone, Fase, Task & Deployment Free-Tier

* **Status Dokumen:** Rencana eksekusi per milestone (*view* dari `docs/06` dan `docs/12`)
* **Hierarki:** **7 milestone** → **19 fase** → **20 task** (`TASK-00`..`TASK-19`)
* **Prinsip:** setiap milestone harus menghasilkan demo yang bisa dilihat; deploy preview dilakukan sedini mungkin, bukan di akhir.
* **Target biaya:** **Rp 0 / free-tier** (Cloudflare, Neon, Upstash, Cloudinary, Render).

## 1. Ringkasan

| Milestone | Nama | Fase | Outcome / Demo | Deploy |
| --- | --- | --- | --- | --- |
| **M0** | Design & Agent Readiness | 1 | Dokumen, ADR, agent, skill, job matrix | — |
| **M1** | Foundation | 3 | Monorepo, kontrak, DB/RLS, CI | Local Docker Compose |
| **M2** | Claims Vertical Slice | 3 | Login → klaim → approval/SoD → audit | **Preview pertama** |
| **M3** | Payroll & HRIS-lite | 4 | Batch → PPh 21/BPJS → payslip → laporan | Preview/staging |
| **M4** | MIS & GraphQL | 2 | KPI lintas cabang + What-If | Preview/staging |
| **M5** | Hardening | 4 | RLS/security, observability, load, E2E, production CI/CD | **Staging + production demo** |
| **M6** | Portfolio & Launch | 2 | README, screenshot, video, demo live, evidence | **Production demo final** |

**Total:** 7 milestone, 19 fase, 20 task. Estimasi solo part-time: **8–12 minggu** (bukan janji; urutan lebih penting daripada deadline).

## 2. Definisi

- **Milestone** — checkpoint hasil/demo, bukan unit coding. Selesai jika demo dan gate milestone lulus.
- **Fase** — sub-deliverable di dalam milestone; biasanya 1–2 task.
- **Task** — unit eksekusi di `docs/06` dengan **Konteks Wajib** dan **Gerbang Verifikasi**.
- **Deploy preview** — environment sementara per PR/cabang, memakai Neon branch dan namespace Redis terpisah.
- **Production demo** — environment publik untuk portofolio, bukan untuk dana nyata.

## 3. Detail Milestone

### M0 — Design & Agent Readiness (1 fase)

| Fase | Task | Yang dituntaskan | Gate |
| --- | --- | --- | --- |
| M0.1 | TASK-00 | Dokumen 00–16 + 13a, ADR-001..018, 9 agent, skill, `PRODUCT.md`, `DESIGN.md`, job matrix, audit register | Dokumen konsisten; tidak ada kode; persetujuan pengguna |

**Deploy:** tidak ada.
**Demo:** review dokumen dan keputusan.

---

### M1 — Foundation (3 fase)

| Fase | Task | Yang dituntaskan | Gate |
| --- | --- | --- | --- |
| M1.1 | TASK-01, TASK-03A | **Selesai 25 November 2026.** pnpm workspace, TS strict, ESLint/Prettier, Dockerfile Express/Go, Nginx, compose, CI skeleton. TASK-03A sebagian, security scan menyusul. | `pnpm -r typecheck`; `docker compose config`; pipeline dummy hijau |
| M1.2 | TASK-02 | **Selesai 25 November 2026.** Zod, OpenAPI 3.1, GraphQL SDL, error codes, pagination, idempotency, `packages/payments` interface dan mock. | Contract test lulus; payload invalid ditolak |
| M1.3 | TASK-03 | **Selesai 25 November 2026.** 23 tabel, 22 RLS policy, audit chain, trigger SoD, materialized view, seed idempoten. | Migrasi bersih; I-04/I-06/I-15; `EXPLAIN` query kunci |

**Deploy:** local Docker Compose + Neon `dev` branch. Belum ada URL publik.
**Demo:** `docker compose up`, migrasi, seed, health check lokal.

---

### M2 — Claims Vertical Slice (3 fase)

| Fase | Task | Yang dituntaskan | Gate |
| --- | --- | --- | --- |
| M2.1 | TASK-04 | **Selesai 26 November 2026.** Governance: login, refresh rotation, MFA privileged, tenant/RBAC, policy draft/approve/publish, audit verify, HMAC gateway. | I-07, I-11, I-12; audit chain valid. Bukti: `docs/evidence/m2.1-verification.md` |
| M2.2 | TASK-05 | **Selesai 26 November 2026.** Claims: draft/revisi/submit, upload signature Cloudinary, evaluasi risiko dan flag konflik, review kepatuhan, keputusan `FOR UPDATE`, SoD, pencairan via `packages/payments`, webhook payment. | I-01, I-02, I-11, I-12. Bukti: `docs/evidence/m2.2-verification.md` |
| M2.3 | TASK-08, TASK-09 | **Selesai 26 November 2026.** Edge Hono + GraphQL BFF, rate limit, REST proxy; web shell, claims workbench, approval queue, audit drawer. | Playwright 5 lulus; initial 140,7 KB gzip; axe 0 serious; **preview live** di `aletheia-web-preview.pages.dev` dan `aletheia-edge-preview.ridwanafzn.workers.dev`; production edge: `aletheia-edge.ridwanafzn.workers.dev`. Bukti: `docs/evidence/m2.3-verification.md` |

**Deploy pertama (wajib):**
- Web → **Cloudflare Pages preview** (per PR).
- Edge → **Cloudflare Workers preview** (`wrangler deploy --env preview`).
- Services → **Render free** (governance, claims, payroll, worker).
- DB → **Neon branch** per PR.
- Redis/QStash → namespace `preview-<pr>`.
- Cloudinary → folder `preview/`.

**Demo:** login 6 role → buat klaim → risk/conflict → approve/SoD → audit.
**Status 26 November 2026:** M5.3 selesai. M5.4 live: service Render, Neon, Upstash QStash, Cloudinary, edge Workers, dan web Pages aktif; smoke production 15/15 lulus; async QStash/worker lulus (~5 detik); login enam peran, UI web, serta rollback edge, Pages, dan Render terverifikasi. M6.2 live; Production Monitor baseline `45816325368` dan pasca-drill `45821314200` lulus. Sisa 4 run terjadwal (24 jam), freeze deploy, dan sign-off. Render free tier memiliki cold start; jalankan `pnpm warm:production` sebelum demo.
**Catatan:** payroll BE (TASK-06/07) boleh berjalan paralel setelah kontrak stabil, tetapi tidak menghambat demo klaim.

---

### M3 — Payroll & HRIS-lite (4 fase)

| Fase | Task | Yang dituntaskan | Gate |
| --- | --- | --- | --- |
| M3.1 | TASK-06 | **Selesai 26 November 2026.** Personnel/agent CRUD, sales achievements, attendance/leave, batch create/calculate, approve/disburse terpisah, `payroll.payments`, payslip/report request. | I-13, I-14; metadata payslip/report. Bukti: `docs/evidence/m3.1-verification.md` |
| M3.2 | TASK-07 | **Selesai 26 November 2026.** Go worker: pgx, decimal, slog, signature QStash, kalkulasi batch, anomali klaim, What-If read-only, refresh MV. | `go test -race` lulus; U-01..U-08/U-13/U-14/U-15 lulus di worker; U-09..U-12/U-16..U-19 dari M2; I-05 lulus; batch 500 dalam 381 ms. U-20 dan I-09 menunggu TASK-11. Bukti: `docs/evidence/m3.2-verification.md` |
| M3.3 | TASK-10 | **Selesai 26 November 2026.** Payroll console, batch detail, breakdown drawer, variance, create batch, approval dan pencairan, employee directory, attendance dan leave summary. | 11 E2E lulus, 1 approval live lulus; axe 0 serious; bundle 142,1 KB gzip. I-08 menunggu payslip PDF TASK-11. Bukti: `docs/evidence/m3.3-verification.md` |
| M3.4 | TASK-11, TASK-12 | **Selesai 26 November 2026.** Payslip PDF, PPh 21 monthly/annual, BPJS monthly, bank file, variance, rekonsiliasi tahunan, payment webhook, reversal, retry, attempt_no. | I-08/I-09/I-10 dan I-03/I-14/I-16 lulus; Go 32 test race; payroll 19 test; live PDF 3.269 byte dan CSV 967 byte dengan checksum cocok. Bukti: `docs/evidence/m3.4-verification.md` |

**Deploy:** update preview/staging; mock payment; report download via signed URL.
**Demo:** batch campuran TK/0, K/1, K/3 + agen komisi → approve → disburse → payslip + PPh 21/BPJS.
**Free-tier note:** QStash 1 pesan per batch (coarse-grained), bukan per karyawan.

---

### M4 — MIS & GraphQL (2 fase)

| Fase | Task | Yang dituntaskan | Gate |
| --- | --- | --- | --- |
| M4.1 | TASK-13 | **Selesai 26 November 2026.** KPI materialized view, security barrier, tren, What-If read-only, variance, cache 300 detik, invalidasi cache, GraphQL query dan mutation. | I-05 lulus; KPI MISS 14,81 ms dan HIT 0,75 ms; tidak ada mutasi produksi. Bukti: `docs/evidence/m4.1-verification.md` |
| M4.2 | TASK-14 | **Selesai 26 November 2026.** MIS dashboard, tren, filter, drill-down, What-If sandbox side-by-side, variance, screenshot desktop dan mobile. | 3 E2E MIS lulus; suite 13 lulus dan 2 opt-in skipped; axe 0 serious; bundle 143,1 KB gzip. Bukti: `docs/evidence/m4.2-verification.md` |

**Deploy:** preview/staging; GraphQL BFF aktif.
**Demo:** KPI lintas cabang + simulasi kenaikan komisi → variance.

---

### M5 — Hardening (4 fase)

| Fase | Task | Yang dituntaskan | Gate |
| --- | --- | --- | --- |
| M5.1 | TASK-15 | **Selesai 26 November 2026.** Audit RLS 26 tabel, cross-tenant read/write, security headers dan CSP, PII scan, Gitleaks, Semgrep, Trivy, pnpm audit, govulncheck, audit chain job. | I-06/I-11/I-15 lulus; 35/35 RLS checks; 0 secret, 0 SAST, 0 dependency/image CVE; security checklist lulus. Bukti: `docs/evidence/m5.1-verification.md` |
| M5.2 | TASK-16 | **Selesai 26 November 2026.** OTel trace/metrics/logs, 3 dashboard Grafana, 8 alert Prometheus, 7 skenario k6, query optimization, dan evidence. | SLO terukur; seluruh threshold k6 lulus; daftar klaim 5,85 ms menjadi 1,18 ms; 0 error. Bukti: `docs/evidence/m5.2-verification.md` |
| M5.3 | TASK-17 | **Selesai 26 November 2026.** 21 test Playwright, 10 alur peran, axe, keyboard, race, coverage domain, flaky policy. | 21/21 lulus dua run; 0 flaky; axe 0 serious; coverage 96,26% lines; Go race dan integration lulus. Bukti: `docs/evidence/m5.3-verification.md` |
| M5.4 | TASK-18 | **Live 26 November 2026.** Render (governance, claims, payroll, worker), Neon, Upstash QStash, Cloudinary, Cloudflare Workers, dan Pages aktif. Runtime RLS 36/36; smoke production 15/15; web UI 3 peran; rollback edge, Pages, dan Render diuji. | `/readyz` 200; demo live; rollback edge/Pages/Render diuji; tidak ada secret. Bukti: `docs/evidence/m5.4-verification.md`, `docs/evidence/m6.2-verification.md` |

**Deploy:**
- **Staging full** (Neon staging, Upstash staging, Cloudinary staging).
- **Production demo** (Neon main, Upstash production, Cloudinary production).
- Urutan: migration → governance → claims/payroll → worker → edge → web → smoke.

---

### M6 — Portfolio & Launch (2 fase)

| Fase | Task | Yang dituntaskan | Gate |
| --- | --- | --- | --- |
| M6.1 | TASK-19 | **Aset selesai 26 November 2026.** README final, 8 screenshot inti + 3 mobile, video 2:16, akun demo, CHANGELOG, job matrix aktual. | Reviewer dapat menjalankan demo < 3 menit via `dev-up.sh` atau live URL; evidence lengkap. Bukti: `docs/evidence/m6.1-verification.md` |
| M6.2 | Launch (bagian dari TASK-19/18) | **Live, monitoring berjalan.** Smoke production 15/15, web UI 3 peran, async QStash/worker (~5 detik), rollback edge/Pages/Render, dan CSP lulus. Sisa: 4 run Production Monitor (24 jam), freeze deploy, sign-off. Runbook: `docs/runbooks/m6.2-launch.md`; bukti: `docs/evidence/m6.2-verification.md`. | Semua endpoint sehat; tidak ada P0; matrix ≥ 100% |
| M6.3 | Follow-up HRIS surface | **Selesai 26 November 2026.** Pusat slip gaji `/payslips`, laporan `/reports`, tombol buat slip di detail batch, seed berkas demo, E2E, axe, dan bundle 143,7 KB. Bukti: `docs/evidence/m6.3-verification.md`. | Slip dan laporan dapat dibuat serta diunduh; E2E lulus |
| M6.4 | Employee self-service | **Selesai 26 November 2026.** Role `EMPLOYEE`, `/me`, `/workforce`, saldo cuti, e-cuti, e-lembur, SoD, RLS, E2E, dan axe. Bukti: `docs/evidence/m6.4-verification.md`. | Karyawan dapat melihat data sendiri dan mengajukan cuti/lembur; HR dapat memutuskan |

**Deploy final:** production demo di free-tier, dengan akun demo dan data sintetis.
**Demo:** 6 role → claims → payroll → payslip/report → MIS → policy/audit.

## 4. Deployment Matrix

| Environment | Web | Edge | Services/Worker | Database | Cache/Queue | Media |
| --- | --- | --- | --- | --- | --- | --- |
| Local | Vite dev | `wrangler dev` | Docker Compose | Postgres/Neon dev | Upstash dev/local | Cloudinary dev |
| Preview (M2.3+) | Cloudflare Pages preview | CF Workers preview | Render preview | Neon branch per PR | namespace `preview-*` | folder `preview/` |
| Staging (M5.4) | CF Pages staging | CF Workers staging | Render staging | Neon staging | namespace `staging` | folder `staging/` |
| Production demo (M5.4–M6.2) | CF Pages production | CF Workers production | Render production | Neon main | namespace `prod` | folder `prod/` |

## 5. Kuota Free-Tier & Mitigasi

| Layanan | Batas | Mitigasi |
| --- | --- | --- |
| **Cloudflare Pages** | 500 build/bulan; request/bandwidth statis besar | Preview per PR; batasi build; cache aset |
| **Cloudflare Workers** | 100.000 request/hari; CPU 10 ms | Edge hanya auth, rate limit, routing, forward; tanpa agregasi berat |
| **Neon PostgreSQL** | 512 MB; ~100 pooled conn; auto-suspend | Pool max 5/service; keyset pagination; arsip; PgBouncer; retry backoff |
| **Upstash Redis** | 10.000 command/hari; 256 MB | Hanya rate limit, lock, idempotency, cache agregasi; TTL + pipeline; tanpa `KEYS *` |
| **Upstash QStash** | 500 pesan/hari | 1 pesan per batch/periode, bukan per karyawan; DLQ; idempotent |
| **Cloudinary** | 25 credit/bulan | Upload ≤ 5 MB; format PDF/JPG/PNG/WEBP; transformasi minimal; signed URL |
| **Render** | 512 MB/container; sleep saat idle | `NODE_OPTIONS=--max-old-space-size=256`; `GOMEMLIMIT=128MiB`; `/healthz`; `pnpm warm:production`; cold-start tolerance |

**Aturan:** jika pemakaian > 60% kuota harian, kurangi cache/rate limit atau naikkan paket. Jangan menambah service baru tanpa ADR.

## 6. Urutan Eksekusi & Paralelisasi

```text
M0
 └─ M1.1 → M1.2 → M1.3
      ├─ M2.1 → M2.2 → M2.3  ← demo pertama (preview live)
      │        └─ M3.1 → M3.2 → M3.3 → M3.4
      │             └─ M4.1 → M4.2
      └─────────────────────→ M5.1 → M5.2 → M5.3 → M5.4
                                                   └─ M6.1 → M6.2
```

- **Jangan** menunggu seluruh backend selesai sebelum FE.
- M3.1/M3.2 boleh berjalan paralel dengan M2.3 setelah kontrak stabil.
- M4 dimulai setelah data payroll/klaim stabil.
- M5.4 hanya setelah M5.1–M5.3 lulus.
- M6.2 hanya setelah production smoke lulus.

## 7. Kriteria "Milestone Selesai"

| Milestone | Selesai jika |
| --- | --- |
| M0 | Dokumen/ADR/agent/skill konsisten; pengguna setuju |
| M1 | Typecheck, contract test, migrasi, RLS/audit test lulus |
| M2 | Preview live; login/klaim/approval/SoD/audit berjalan |
| M3 | Batch 500 item; payslip; PPh 21/BPJS report; mock payment |
| M4 | KPI + What-If; tidak ada mutasi produksi |
| M5 | Security, SLO, load, E2E, production deploy lulus |
| M6 | Demo live < 3 menit; evidence lengkap; matrix ≥ 100% |

## 8. Risiko Free-Tier

| Risiko | Dampak | Mitigasi |
| --- | --- | --- |
| Cold start/sleep Render | demo lambat | health check, loading state, `pnpm warm:production` |
| Neon auto-suspend | query pertama lambat | retry backoff, connection pool, keep-alive ringan |
| Redis quota habis | rate limit/idempotency gagal | fallback DB, command budget, pipeline, TTL |
| QStash 500/hari | batch gagal | coarse-grained, dedup, DLQ, monitor |
| Cloudinary credit | upload gagal | 5 MB limit, kompresi, hapus file demo lama |
| Workers CPU 10 ms | request gagal | edge hanya auth/route/forward |
| Data demo membengkak | storage penuh | reset seed, arsip, hapus file lama |

## 9. Yang Tidak Termasuk Milestone

- Full HRIS (clock-in/out, shift scheduling, rekrutmen, performance).
- THR/13th month otomatis.
- Integrasi langsung DJP e-Bupot/SPT dan API BPJS.
- Multi-currency/global payroll.
- Dana nyata/provider produksi tanpa KYC dan persetujuan.

Item di atas adalah **future development** dan tidak boleh masuk milestone tanpa keputusan baru.

## 10. Batasan Keras

> 1. Dilarang memulai M1 tanpa persetujuan pengguna.
> 2. Dilarang menunda deploy preview sampai M5; preview wajib di M2.3.
> 3. Dilarang mengorbankan invarian finansial demi demo.
> 4. Dilarang memakai data nyata/PII di demo.
> 5. Dilarang mengklaim milestone selesai tanpa gate dan evidence.
> 6. Dilarang menambah service/fitur di luar scope tanpa ADR.
