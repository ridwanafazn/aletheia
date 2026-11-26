# Dokumentasi Aletheia

Mulai dari `HANDOVER.md` di root repository. Dokumen ini adalah indeks spesifikasi dan keputusan.

## Urutan baca

1. `../HANDOVER.md` — status, quick start, akun, batasan, troubleshooting.
2. `00-context-and-vision.md` — tujuan, persona, ruang lingkup.
3. `01-architecture-and-infra.md` — arsitektur, port, deployment target.
4. `06-execution-roadmap.md` — task, status, dan aturan berhenti.
5. `02-database-and-governance.md` — schema, RLS, audit chain, idempotency.
6. `03-api-and-graphql-contracts.md` — kontrak REST dan GraphQL.
7. `04-business-rules-and-engines.md` — PPh 21, BPJS, komisi, routing klaim.
8. `08-security-and-compliance.md` — keamanan, PII, checklist rilis.
9. `09-observability-and-performance.md` — OTel, SLO, load test, alert.
10. `10-testing-and-quality-strategy.md` — piramida test, coverage, flaky policy.

## Daftar dokumen

| Dokumen | Isi |
| --- | --- |
| `00-context-and-vision.md` | Konteks produk, target pengguna, batasan |
| `01-architecture-and-infra.md` | Arsitektur service, edge, worker, deployment |
| `02-database-and-governance.md` | Schema, RLS, audit, policy, idempotency |
| `03-api-and-graphql-contracts.md` | REST, GraphQL, error envelope |
| `04-business-rules-and-engines.md` | Kalkulasi payroll dan aturan klaim |
| `05-devops-and-verification.md` | Docker, CI/CD, verifikasi, runbook |
| `06-execution-roadmap.md` | Roadmap task dan status terkini |
| `07-frontend-architecture-and-ux.md` | Struktur UI, aksesibilitas, desain |
| `08-security-and-compliance.md` | Security checklist, RLS, PII, supply chain |
| `09-observability-and-performance.md` | Telemetri, SLO, dashboard, load test |
| `10-testing-and-quality-strategy.md` | Strategi test, coverage, flaky policy |
| `11-hris-lite-and-payroll-reporting.md` | Data HRIS, payslip, laporan pajak |
| `12-delivery-repo-and-portfolio-strategy.md` | Delivery, portfolio, job targeting |
| `13-job-targeting-matrix.md` | Pemetaan requirement lowongan ke bukti |
| `13a-job-posts.md` | Ringkasan lowongan target |
| `14-architecture-decision-records.md` | ADR |
| `15-audit-fix-register.md` | Temuan audit dan status perbaikan |
| `16-milestone-phase-plan.md` | Rencana fase dan status milestone |
| `runbooks/m6.2-launch.md` | Launch, smoke, rollback, dan monitoring production |
| `evidence/m6.2-verification.md` | Bukti production: smoke, web UI, async QStash, rollback, monitoring |
| `evidence/m6.3-verification.md` | Bukti slip gaji, laporan PPh 21/BPJS, E2E, axe, dan bundle |
| `evidence/m6.4-verification.md` | Bukti employee self-service, e-cuti, e-lembur, E2E, dan axe |
| `evidence/m6.5-verification.md` | Bukti reimburse, struktur organisasi, E2E, dan axe |

## Evidence

Indeks bukti ada di `evidence/README.md`. Bukti terbaru:

* `evidence/m5.3-verification.md`
* `evidence/m5.2-verification.md`
* `evidence/m5.1-verification.md`
* `evidence/load/`
* `evidence/slo/`
* `evidence/query-plans/`
