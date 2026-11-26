# `13-job-targeting-matrix.md` — Matriks Pemenuhan 100%+ untuk Dua Lowongan Target

* **Status Dokumen:** Matriks Targeting Karier (*Single Source of Truth* untuk Agen OpenCode)
* **Target:** Job 1 — Full Stack Developer, PT Siaga Abdi Utama (HRIS/Payroll)
* **Target:** Job 2 — Fullstack Developer, PT BPUI (React + Node/Express, PostgreSQL, MIS, DevOps)
* **Prinsip:** Setiap requirement harus punya **artefak yang bisa dilihat**, bukan sekadar klaim di dokumen.
* **Registry requirement:** `docs/13a-job-posts.md` (ID J1-R*, J1-P*, J2-R*).

## 0. Ringkasan Eksekutif

| Dimensi | Job 1 (SAU) | Job 2 (BPUI) |
| --- | --- | --- |
| Requirement teknis wajib tercakup di desain | 100% | 100% |
| Preferred qualification tercakup di desain | 100% | 100% |
| Kesiapan bukti saat ini | ~15% (desain, belum ada kode) | ~15% (desain, belum ada kode) |
| Target setelah implementasi | 120%+ | 120%+ |
| Gap yang tidak bisa ditutup proyek | Pengalaman formal 2 tahun | — |

**Kesimpulan:** rancangan sudah memetakan **seluruh requirement teknis dan preferred qualification** kedua lowongan; J1-R1 (gelar) dan J1-R2 (pengalaman formal 2 tahun) berada di luar artefak proyek dan ditandai `N/A`. Yang belum ada adalah implementasi dan artefak bukti. Karena itu, prioritas berikutnya bukan menambah dokumen, melainkan mengeksekusi vertical slice dan mengumpulkan evidence.

## 1. Metode Penilaian

| Skor | Arti |
| --- | --- |
| 0 | Tidak ada |
| 1 | Disebut di dokumen |
| 2 | Dirancang + task jelas |
| 3 | Diimplementasikan + bukti (test/screenshot/benchmark/deploy) |
| 4 | Di atas requirement + pembeda (differentiator) |

**Target:** semua requirement yang dapat dibuktikan = 3; minimal 3 item = 4. Requirement yang secara alami di luar artefak proyek (mis. pengalaman formal 2 tahun) diberi status `N/A` + strategi kompensasi, bukan skor 3. Total di atas 100% berarti kandidat tidak hanya memenuhi syarat minimum, tetapi menunjukkan kedalaman.

## 2. Job 1 — PT Siaga Abdi Utama (HRIS/Payroll)

| ID | Requirement | Bukti yang akan dibuat | Dokumen/Task | Status target | Gap saat ini |
| --- | --- | --- | --- | --- | --- |
| J1-R1 | S1 Informatika/SI | — | — | N/A | pribadi |
| J1-R2 | Min. 2 tahun full-stack | Riwayat commit/PR + demo live + studi kasus | `12`, README | N/A (pengalaman formal) | kompensasi: demo/portfolio |
| J1-R3 | HRIS/payroll experience | Modul HRIS-lite + payslip + PPh 21/BPJS | `11`, TASK-10/11 | 4 | master data, absensi, cuti, payroll console, kalkulasi TER/BPJS, approval, disbursement, payslip PDF, laporan CSV, dan rekonsiliasi live; UI payslip dan laporan belum |
| J1-R4 | Frontend JS/TS + React/Vue/Next | React 19 + TS + Vite, 7 layar | `07`, TASK-09/10/14 | 3 | UI klaim, payroll, employee directory, MIS dashboard, dan What-If sandbox live |
| J1-R5 | Backend Node/Go/Java | Express TS + Go worker | `01`, TASK-04..07 | 4 (dua bahasa) | 3 Express service dan Go worker live; race test lulus |
| J1-R6 | PostgreSQL design & query | ERD, migrasi, index, query plan | `02`, TASK-03 | 4 | selesai; bukti M1.3 |
| J1-R7 | REST API | Kontrak REST + error envelope + idempotency | `03`, TASK-05/06 | 3 | governance, claims, dan payroll live |
| J1-R8 | Git, debugging, testing | Branch/PR/ADR + test suite + CI | `10`, `12`, `CONTRIBUTING.md` | 3 | unit, integration, 21 E2E dua run, coverage 96,26%, security workflow, dan probe RLS live; pipeline PR belum dijalankan |
| J1-R9 | Analytical/problem solving | ADR + post-mortem + trade-off | `14`, `12` | 3 | sebagian |
| J1-R10 | Kolaborasi HR/Payroll/Product | Persona, alur peran, demo script | `00`, `12` | 3 | sebagian |
| J1-P1 | **PPh 21 & BPJS** | TER + annual + employer + laporan | `04`, `11` | 4 | TER, BPJS, payslip, laporan bulanan, bank file, variance, dan rekonsiliasi tahunan live |
| J1-P2 | **RBAC/approval/audit** | 6 role, SoD, hash chain | `00`, `08` | 4 | governance, claims, dan payroll SoD live |
| J1-P3 | **Large-scale & anti-duplikasi** | Goroutine pool, idempotency, `FOR UPDATE` | `02`, `04` | 4 | Go worker pool, idempotency, constraint, dan row lock live; batch 500 dalam 214 ms |
| J1-P4 | **Docker/CI-CD/cloud** | Multi-stage, GH Actions, deploy | `05`, `12` | 3 | desain |

**Kesimpulan Job 1:** desain sudah mencakup **semua** requirement; yang kurang adalah implementasi + bukti. HRIS-lite menutup gap "HRIS" yang sebelumnya tipis.

### 2A. Cakupan Opsi Stack (Job 1)

Lowongan memakai frasa "at least one of" dan "one of", jadi pilihan berikut sengaja diambil:

| Opsi lowongan | Dipakai? | Alasan |
| --- | --- | --- |
| Vue.js | Tidak | React dipilih; Vue dapat dipelajari cepat, bukan pembeda. |
| React.js | **Ya** | React 19 + TypeScript + Vite. |
| Next.js | Tidak | Vite SPA + Cloudflare Workers BFF sudah memenuhi kebutuhan; Next akan menduplikasi BFF. |
| Java | Tidak | Go + Express mencakup dua dari tiga opsi backend. |
| Go (Golang) | **Ya** | `analytics-worker-go` untuk kalkulasi konkuren. |
| Node.js / Express.js | **Ya** | Tiga service Express TS. |
| NestJS | Tidak | Express dipilih untuk kontrol transaksi/idempotency yang eksplisit. |
| MySQL | Tidak | PostgreSQL 16 dipilih untuk JSONB, RLS, window function, dan materialized view. |

## 3. Job 2 — PT BPUI (Fullstack + MIS + DevOps)

| ID | Requirement | Bukti yang akan dibuat | Dokumen/Task | Status target | Gap saat ini |
| --- | --- | --- | --- | --- | --- |
| J2-R1 | React TS + Node/Express microservices | 3 Express service + 1 Go worker + React app | `01`, `12` | 3 | 3 Express service, Go worker, React, dan UI payroll live |
| J2-R2 | PostgreSQL advanced query/optimization | CTE, window, partial/covering/GIN, `EXPLAIN` | `02`, `09` | 4 | MV KPI, window MoM, partial index, security barrier, dan query plan cache |
| J2-R3 | REST + GraphQL integration | REST transaksional + GraphQL BFF | `03`, TASK-08/13 | 3 | GraphQL query KPI, tren, audit klaim, dan mutation What-If live |
| J2-R4 | Caching/load balancing/cloud-native | Redis, Nginx `least_conn`, edge, stateless | `01`, `09` | 3 | edge rate limit live; Redis dan load test belum |
| J2-R5 | Docker & containerization | Dockerfile per service + compose | `05`, TASK-01 | 3 | image governance dan claims terverifikasi; edge dan web di Cloudflare |
| J2-R6 | Kolaborasi tim MIS Analyst | Persona MIS + dashboard + What-If | `00`, `07`, `09` | 3 | MIS dashboard, tren, drill-down, dan What-If sandbox live |
| J2-R7 | Clean code, documented, review | TSDoc/GoDoc, lint, PR template, ADR | `05`, `12`, `14`, `CONTRIBUTING.md` | 3 | sebagian |
| J2-R8 | CI/CD, deploy, monitoring, maintenance | Pipeline + OTel + SLO + runbook | `05`, `09`, TASK-16/18 | 3 | preview dan security workflow tersedia; OTel, dashboard, SLO, load test, 21 E2E, dan coverage lulus; pipeline PR belum |
| J2-R9 | Patuh kebijakan perusahaan | Governance/compliance + proses PR/CI | `00`, `08`, `CONTRIBUTING.md` | 3 | kontrol governance, claims, dan UI audit live |

**Kesimpulan Job 2:** desain sudah mencakup **semua** requirement; gap utama ada di bukti operasional (dashboard, load test, pipeline hijau) dan artefak review.

## 4. Pembeda di Atas Requirement (Skor 4)

| Pembeda | Nilai bagi perekrut | Artefak |
| --- | --- | --- |
| Policy-as-reference berversi | Menunjukkan desain untuk regulasi yang berubah | `02`, `04`, demo ganti policy |
| Immutable hash-chain audit | Kontrol internal tingkat enterprise | `02`, `08`, audit explorer |
| Idempotency 2 lapis + race test | Bukti anti double-disbursement | I-02/I-03/I-14 |
| Multi-tenant + RLS | Siap untuk model bisnis HR outsourcing SAU | `02`, `08`, cross-tenant test |
| What-If simulation | Mendukung tim MIS/strategi | `04`, `07`, demo variance |
| Cross-domain anomaly detection | Fraud/conflict detection | `04`, demo Kasus B |
| Payslip + PPh 21 annual + BPJS employer | HRIS/payroll depth, bukan sekadar kalkulator | `11`, laporan |
| Payment adapter + mock | Disbursement realistis tanpa risiko | `01`, `03`, `04`, `14`, demo state machine |
| Observability + SLO + k6 | Bukti performa, bukan klaim | `09`, evidence |
| ADR + job matrix | Menunjukkan cara berpikir senior | `13`, `14` |

## 5. Evidence Checklist (Harus Ada Sebelum Melamar)

- [ ] URL demo live (atau video 2–3 menit jika gratis tidak memungkinkan).
- [ ] 6 akun demo + data seed realistis.
- [ ] README dengan arsitektur, screenshot, cara jalan, akun demo.
- [ ] Test report: unit, integration, E2E, race; coverage domain ≥ 90%.
- [ ] Load test report: p95, error rate, batch 500 item.
- [ ] Query plan before/after untuk minimal 3 query.
- [ ] Bundle analyzer + ukuran gzip.
- [ ] Security checklist + hasil probe (SoD, replay, cross-tenant, audit tamper).
- [ ] 5–8 ADR yang menjelaskan trade-off.
- [ ] Screenshot desktop + mobile untuk 8 layar inti (login, claims, approval, payroll, payslip, reports, MIS, audit).
- [ ] Video walkthrough 2–3 menit.
- [ ] CHANGELOG + riwayat PR yang rapi.
- [ ] Job matrix ini diperbarui dengan status aktual.

## 6. Gap Prioritas (Urut Dampak)

| Prioritas | Gap | Aksi | Task |
| --- | --- | --- | --- |
| P0 | Fondasi ada, domain/demo belum | Bangun vertical slice claims + deploy | TASK-01..05, 08, 09 |
| P0 | HRIS breadth | Payslip + PPh 21/BPJS report | TASK-11 |
| P1 | Bukti performa | k6 + dashboard + query plan | TASK-16 |
| P1 | Artefak proses | PR template, ADR, CONTRIBUTING | TASK-00/19 |
| P2 | Multi-tenant RLS | `tenant_id` + policy + test | TASK-03/15 |
| P2 | Payment realism | Adapter + mock + state machine | TASK-12 |
| P3 | Full HRIS | **Tidak dikerjakan**; catat future | backlog |

## 7. Narasi Interview per Requirement

Gunakan **STAR + bukti**:

| Pertanyaan | Cerita | Bukti |
| --- | --- | --- |
| "Ceritakan sistem payroll yang pernah Anda bangun." | Aletheia: policy-bound payroll, PPh 21 TER + annual, BPJS, payslip | demo + `11` |
| "Bagaimana mencegah double payment?" | Idempotency Redis + unique constraint + state machine + race test | I-03/I-14 |
| "Bagaimana Anda menangani perubahan aturan pajak?" | Policy versioning + checksum + transaksi lama tetap versi lama | `04` + demo |
| "Bagaimana memastikan audit tidak bisa diubah?" | Append-only + trigger + hash chain + advisory lock | I-04 |
| "Bagaimana Anda mengoptimalkan query?" | Keyset pagination, partial/covering index, `EXPLAIN` before/after | evidence |
| "Bagaimana Anda menguji konkurensi?" | 5 approval paralel, `FOR UPDATE NOWAIT`, `go test -race` | I-02 |
| "Bagaimana Anda mendesain untuk multi-tenant?" | `tenant_id` + RLS + JWT scope + cross-tenant test | `08` |
| "Bagaimana Anda bekerja dengan tim MIS?" | KPI dashboard + What-If + read-only analytics | `07`/`09` |
| "Bagaimana Anda memantau produksi?" | OTel, SLO, alert, runbook, k6 | `09` |

## 8. Aturan Maintenance

- Setiap task selesai: ubah status di tabel dari 2 → 3 (atau 3 → 4) hanya jika bukti ada.
- Setiap requirement baru dari lowongan lain: tambahkan baris + artefak.
- Jangan menaikkan skor karena "sudah dirancang"; skor 3 butuh bukti.
- Review matrix setiap akhir fase; lampirkan di README.
- Jika suatu requirement tidak bisa dipenuhi (misalnya 2 tahun pengalaman formal), tulis strategi kompensasinya (proyek, kontribusi open source, studi kasus).

## 9. Batasan Keras

> 1. Dilarang mengklaim skor 3 tanpa artefak.
> 2. Dilarang menambah fitur hanya untuk "terlihat keren" tanpa dipetakan ke requirement.
> 3. Dilarang mengorbankan invarian finansial demi mengejar fitur.
> 4. Dilarang memakai data nyata/PII di demo.
> 5. Dilarang menandai "selesai" jika matrix belum diperbarui.
