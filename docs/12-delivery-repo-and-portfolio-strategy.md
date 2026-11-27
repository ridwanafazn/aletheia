# `12-delivery-repo-and-portfolio-strategy.md` — Strategi Repo, Urutan Pengerjaan & Kemasan Portofolio

* **Status Dokumen:** Keputusan Delivery (*Single Source of Truth* untuk Agen OpenCode)
* **Keputusan:** **Satu repo monorepo**, deploy FE/BE terpisah.
* **Target:** Portofolio yang bisa didemokan, diukur, dan diceritakan dalam interview.

## 1. Jawaban: Perlu 2 repo FE + BE?

**Tidak.** Untuk proyek ini, dua repo justru merugikan.

| Aspek | Monorepo (dipilih) | Dua repo |
| --- | --- | --- |
| Shared contracts | satu package, import langsung | harus publish package/private registry |
| Perubahan kontrak | satu PR atomik (schema + BE + FE) | dua PR, rawan drift |
| CI | satu pipeline, cache bersama | dua pipeline, duplikasi |
| Review | satu diff, mudah dilihat perekrut | tersebar, sulit dinilai |
| Deploy | tetap terpisah per app/service | terpisah |
| Onboarding | satu clone, satu install | dua clone, dua setup |
| Isolasi akses | via CODEOWNERS/branch protection | via repo permission |

**Kapan dua repo masuk akal:** tim FE/BE terpisah dengan release cadence berbeda, organisasi berbeda, atau kebutuhan compliance yang memisahkan akses. Itu bukan kondisi proyek ini.

**Rekomendasi:** monorepo dengan boundary tegas. Jika suatu hari perlu dipecah, `apps/*` dan `services/*` sudah menjadi garis potong alami.

## 2. Struktur Monorepo

```text
aletheia/
├── apps/
│   ├── web/                     # React 19 + Vite (Cloudflare Pages)
│   └── edge-gateway/            # Hono + GraphQL Yoga (Cloudflare Workers)
├── services/
│   ├── governance-service/      # Express TS: auth, RBAC, policy, audit
│   ├── claims-service/          # Express TS: claims, upload, decisions
│   ├── payroll-service/         # Express TS: personnel, batches, reports
│   └── analytics-worker-go/     # Go: payroll calc, anomaly, what-if, refresh
├── packages/
│   ├── shared-contracts/        # Zod, types, error codes, OpenAPI, GraphQL SDL
│   ├── payments/                # PaymentProvider interface + mock + adapter
│   ├── observability/           # OTel setup, logger, correlation
│   └── ui/                      # design system (opsional, jika web besar)
├── infra/
│   ├── docker/                  # multi-stage Dockerfiles
│   ├── nginx/                   # local load balancer
│   ├── observability/           # dashboards, alert rules
│   └── terraform/ (opsional)    # Cloudflare/Neon jika ingin IaC
├── tests/
│   ├── integration/
│   ├── e2e/
│   └── load/
├── docs/                        # spesifikasi + ADR + evidence
├── scripts/                     # verify-all, seed, db:*
├── .github/workflows/
├── docker-compose.yml
├── package.json                 # pnpm workspace root
├── pnpm-workspace.yaml
└── README.md
```

**Aturan boundary:** `apps/*` tidak mengimpor `services/*`; hanya `packages/*`. `services/*` tidak mengimpor `apps/*`. Cross-service hanya via HTTP/event.

## 3. Deploy Terpisah dalam Satu Repo

| Komponen | Target | Pipeline |
| --- | --- | --- |
| `apps/web` | Cloudflare Pages | build statis, preview per PR |
| `apps/edge-gateway` | Cloudflare Workers | `wrangler deploy`, preview per PR |
| `services/*` | Render (Docker) | Blueprint sync/API deploy, health check |
| `analytics-worker-go` | Render (Docker) | Blueprint sync/API deploy, health check |
| Database | Neon | branch per PR, migration job |
| Cache/Queue | Upstash | namespace per environment |
| Media | Cloudinary | folder per tenant/environment |

Setiap deploy independen; perubahan di `apps/web` tidak membangun ulang Go worker. Gunakan path filter di CI.

## 4. Branching, Commit & Review

- **Trunk-based:** `main` selalu deployable; branch pendek `feat/...`, `fix/...`, `docs/...`.
- **Conventional Commits:** `feat(claims): ...`, `fix(payroll): ...`, `docs(adr): ...`.
- **PR wajib:** deskripsi, screenshot (UI), test evidence, risiko, rollback.
- **PR template:** what/why/how/test/risk/screenshot/checklist.
- **CODEOWNERS:** finance/payroll → finance reviewer; `docs/**` → architect; `.github/**` → devops.
- **Branch protection:** 1 approval, CI green, no force push, linear history.
- **ADR:** keputusan arsitektur yang mengubah kontrak/invarian wajib ADR.
- **Changelog:** `CHANGELOG.md` per milestone; link ke PR/issue.
- **Issue labels:** `phase/*`, `area/*`, `type/*`, `priority/*`, `good-first-task`.

## 5. Environment Matrix

| Environment | Database | Redis/QStash | Cloudinary | Tujuan |
| --- | --- | --- | --- | --- |
| local | Docker Postgres/Neon dev | Upstash dev / local | dev folder | development |
| preview | Neon branch per PR | namespace `pr-<n>` | `preview/` | review |
| staging | Neon staging | staging | `staging/` | E2E/load |
| production | Neon main | production | `prod/` | demo/production |

- Secret tidak pernah di repo; gunakan `.env.example`.
- Preview environment dihapus setelah PR merge (TTL).
- Migration dijalankan sebelum deploy service; rollback via migration down/forward plan.

## 6. Urutan Pengerjaan: BE atau FE Dulu?

**Jawaban: contract-first, lalu backend per vertical slice, FE langsung menyusul slice yang sama.** Jangan membangun seluruh BE lalu seluruh FE.

### Fase 0 — Fondasi (tanpa kode produk)
- Docs, ADR, agents/skills, design references (`PRODUCT.md`, `DESIGN.md`), job matrix.
- Tidak ada inisialisasi proyek sampai disetujui.

### Fase 1 — Kontrak & Data
1. `packages/shared-contracts` (Zod, error codes, OpenAPI/SDL).
2. Migrasi skema + RLS + audit trigger + seed.
3. CI skeleton + `scripts/verify-all.sh`.

### Fase 2 — Vertical slice pertama (Claims)
1. Governance auth + RBAC + policy active (BE).
2. Claims submit + upload signature + decision (BE).
3. Web login + claims workbench + approval queue (FE).
4. Integration/E2E + deploy preview.
**Demo checkpoint:** login → submit → approve/SoD → audit.

### Fase 3 — Payroll & HRIS-lite
1. Personnel + attendance/leave summary (BE).
2. Batch + Go calculation + PPh 21/BPJS (BE).
3. Payroll console + breakdown + approval (FE).
4. Payslip + reports (BE+FE).
**Demo checkpoint:** batch 500 item → approve → payslip → PPh 21/BPJS report.

### Fase 4 — MIS & Edge GraphQL
1. Materialized view + KPI + What-If (BE/worker).
2. Edge BFF GraphQL + DataLoader (BE edge).
3. MIS dashboard + What-If sandbox (FE).
**Demo checkpoint:** KPI lintas cabang + simulasi variance.

### Fase 5 — Hardening
1. Tenant RLS + cross-tenant tests.
2. Observability + SLO + dashboards.
3. k6 load test + query optimization.
4. Security probes + fixes.
5. A11y + E2E lengkap.

### Fase 6 — Portofolio
1. Deploy production demo + seed.
2. README, screenshots, video, architecture diagram.
3. Test/coverage/load evidence.
4. Blog post/ADR highlights.
5. Interview narrative + job matrix update.

## 7. Milestone & Estimasi Kasar

> Detail per milestone/fase dan deployment free-tier: `docs/16-milestone-phase-plan.md`.

| Milestone | Isi | Estimasi solo (part-time) |
| --- | --- | --- |
| M0 | Docs + agents + design refs | 2–3 hari |
| M1 | Contracts + DB + CI | 1 minggu |
| M2 | Claims vertical slice | 1–2 minggu |
| M3 | Payroll + HRIS-lite | 2–3 minggu |
| M4 | MIS + GraphQL | 1–2 minggu |
| M5 | Hardening + load + security | 1–2 minggu |
| M6 | Portfolio + deploy | 3–5 hari |

Ini bukan janji; gunakan sebagai urutan, bukan deadline. Yang penting: setiap milestone punya demo yang bisa dilihat.

## 8. Kemasan Portofolio

### 8.1 README (wajib)

**Status 27 November 2026:** live di `https://aletheia-web-preview.pages.dev` dengan edge `https://aletheia-edge.ridwanafzn.workers.dev`, web commit `21c0a9a`; smoke production 15/15, async QStash/worker ~5 detik, dan rollback edge/Pages/Render lulus. Workflow Warm Production berjalan tiap 10 menit. Bukti: `docs/evidence/demo-history-seed.md`.

- Nama, tagline, status (design/implementation/live).
- Masalah yang dipecahkan (3 kalimat).
- Arsitektur (Mermaid) + stack.
- Fitur utama + screenshot.
- Demo live + akun seed (read-only untuk publik).
- Cara menjalankan lokal.
- Test/coverage/load badges.
- Docs index.
- Keputusan desain kunci (ADR).
- Lisensi.

### 8.2 Artefak bukti

| Artefak | Lokasi | Untuk |
| --- | --- | --- |
| Screenshot desktop/mobile | `docs/assets/screens/` | UI/UX |
| Video demo 2–3 menit | YouTube/Loom | alur end-to-end |
| Coverage report | CI artifact/`docs/evidence/` | kualitas |
| Load test summary | `docs/evidence/load/` | performa |
| Query plan before/after | `docs/evidence/query-plans/` | PostgreSQL |
| Bundle analyzer | `docs/evidence/bundle/` | frontend perf |
| Security checklist | `docs/08` + hasil probe | keamanan |
| ADR | `docs/14` | keputusan |
| PR history | GitHub | code review |

### 8.3 Demo script (2–3 menit)

1. Login sebagai Claims Officer → buat klaim → upload → submit.
2. Login Branch Manager → lihat risk/conflict → approve; coba approve klaim sendiri → ditolak (SoD).
3. Login HR → buat batch payroll → kalkulasi → breakdown PPh 21/BPJS.
4. Login Finance → approve → disburse → payslip + laporan.
5. Login MIS → dashboard + What-If → variance.
6. Login Compliance → publish policy baru → klaim lama tetap versi lama → audit chain valid.

### 8.4 Akun demo

- 6 akun per peran, password demo di README (hanya untuk demo).
- Data seed realistis: 3 cabang, 2 policy version, klaim normal + konflik, batch payroll campuran.
- Tombol "reset demo" (opsional) untuk mengembalikan seed.

## 9. Risiko & Mitigasi

| Risiko | Mitigasi |
| --- | --- |
| Scope creep (full HRIS) | HRIS-lite dikunci; future di backlog |
| Free-tier habis | quota budget, cache selektif, load test kecil |
| Demo data membocorkan PII | data sintetis, masked, reset |
| Terlalu lama tanpa demo | vertical slice + deploy preview tiap fase |
| Dokumen dan kode drift | contract-first, CI schema check |
| Reviewer tidak menemukan bukti | job matrix + evidence folder |
| Multi-tenant terlambat | `tenant_id` sejak awal, RLS di Fase 5 |

## 10. Definition of Done Portofolio

- [ ] Demo live dapat diakses publik (atau video jika biaya).
- [ ] 6 peran dapat login dan menjalankan alur utama.
- [ ] Semua gate CI hijau; coverage domain ≥ 90%.
- [ ] Load test threshold lulus; hasil terdokumentasi.
- [ ] Security checklist lulus; tidak ada BLOCKER.
- [ ] README + screenshot + video + ADR lengkap.
- [ ] Job-targeting matrix ≥ 100% untuk requirements, ≥ 80% untuk preferred.
- [ ] Tidak ada PII nyata di repo/demo.

## 11. Narasi Interview

Gunakan struktur **Problem → Constraint → Decision → Evidence → Trade-off**:

1. **Problem:** disbursement governance, double payment, audit, policy changes.
2. **Constraint:** free-tier, microservices, payroll regulations, multi-tenant readiness.
3. **Decision:** policy-as-reference, idempotency 2 lapis, audit hash chain, RLS, monorepo.
4. **Evidence:** test I-01..I-16, load test, query plan, screenshot, ADR.
5. **Trade-off:** kompleksitas vs auditability; Vite vs Next; HRIS-lite vs full HRIS.

## 12. Batasan Keras Delivery

> 1. Dilarang memulai kode sebelum Fase 0 disetujui.
> 2. Dilarang memecah repo tanpa keputusan baru.
> 3. Dilarang membangun seluruh BE sebelum ada FE slice yang bisa didemokan.
> 4. Dilarang mengorbankan invarian demi kecepatan demo.
> 5. Dilarang mengklaim "selesai" tanpa deploy/demo dan bukti test.
