# `13a-job-posts.md` — Requirement Registry Dua Lowongan Target

* **Status:** Artefak pendukung `docs/13-job-targeting-matrix.md`
* **Sumber:** screenshot lowongan yang diberikan pengguna (Nov 2026)
* **Tujuan:** memberi ID stabil agar setiap requirement dapat dilacak ke artefak dan status.

## Job 1 — Full Stack Developer, PT Siaga Abdi Utama (SAU)

**Konteks:** HRIS applications, termasuk payroll dan management modules; Jakarta; full-time.

### Required

| ID | Requirement | Bukti yang dicari |
| --- | --- | --- |
| J1-R1 | S1 Informatika/Sistem Informasi | di luar artefak proyek |
| J1-R2 | Min. 2 tahun full-stack; HRIS/payroll preferred | pengalaman formal; proyek menjadi bukti kemampuan |
| J1-R3 | Frontend JS/TS + Vue/React/Next | React 19 + TS |
| J1-R4 | Backend Java/Go/Node (Express/Nest) | Express TS + Go |
| J1-R5 | PostgreSQL/MySQL design & query | PostgreSQL 16 |
| J1-R6 | REST API development/integration | REST + OpenAPI |
| J1-R7 | Git, debugging, testing | branch/PR/test/CI |
| J1-R8 | Analytical & problem solving | ADR, post-mortem, trade-off |
| J1-R9 | Kolaborasi HR/Payroll/Product/technical | persona, alur peran, demo |

### Preferred

| ID | Requirement | Bukti yang dicari |
| --- | --- | --- |
| J1-P1 | Konsep payroll: PPh 21 & BPJS | TER + annual + BPJS employee/employer |
| J1-P2 | RBAC, approval workflow, audit trail | 6 role, SoD, hash chain |
| J1-P3 | Large-scale data, transaction, anti-duplicate | worker pool, idempotency, `FOR UPDATE` |
| J1-P4 | Docker, CI/CD, cloud | multi-stage, GH Actions, deploy |

## Job 2 — Fullstack Developer, PT BPUI

**Konteks:** aplikasi web full-stack React (TypeScript) + Node.js/Express microservices; PostgreSQL advanced; MIS; DevOps.

### Required

| ID | Requirement | Bukti yang dicari |
| --- | --- | --- |
| J2-R1 | React TS + Node/Express microservices | 3 Express service + React app |
| J2-R2 | PostgreSQL design, optimization, advanced query | index, CTE, window, `EXPLAIN` |
| J2-R3 | REST/GraphQL integration | REST transaksional + GraphQL BFF |
| J2-R4 | Performance & scalability: caching, load balancing, cloud-native | Redis, Nginx, edge, stateless |
| J2-R5 | Docker & containerization | Dockerfile + compose |
| J2-R6 | Kolaborasi tim MIS | dashboard KPI + What-If |
| J2-R7 | Clean code, documented, code review | TSDoc/GoDoc, lint, PR |
| J2-R8 | CI/CD, deployment, monitoring, maintenance | pipeline, OTel, SLO, runbook |
| J2-R9 | Mengikuti kebijakan/prosedur perusahaan | governance, audit, CONTRIBUTING |

## Aturan Pemakaian

1. Setiap baris di `docs/13-job-targeting-matrix.md` harus mengacu ke ID di sini.
2. Skor 3 hanya diberikan jika ada artefak yang dapat diperiksa (kode/test/screenshot/benchmark/deploy).
3. Requirement yang tidak dapat dipenuhi proyek (mis. pengalaman formal 2 tahun) diberi status `N/A` + strategi kompensasi, bukan skor 3.
4. Jika lowongan berubah, tambahkan ID baru; jangan menimpa ID lama.
