# `14-architecture-decision-records.md` — Architecture Decision Records Aletheia

* **Status Dokumen:** Kumpulan ADR (*Single Source of Truth* untuk Keputusan Arsitektur)
* **Format:** Context → Options → Decision → Consequences → Reversal cost
* **Aturan:** ADR yang mengubah kontrak/invarian wajib diperbarui sebelum implementasi.

---

## ADR-001 — Monorepo dengan Deploy Terpisah

**Context:** Proyek solo, banyak paket (web, edge, 3 service, Go worker, shared contracts), target portofolio yang mudah direview, dan kebutuhan deploy independen per komponen.

**Options:**
1. Dua repo (FE & BE).
2. Monorepo dengan deploy terpisah.
3. Monorepo tunggal dengan satu deploy.

**Decision:** Opsi 2. Satu repo `aletheia` berisi `apps/*`, `services/*`, `packages/*`, `infra/*`; pipeline deploy terpisah per komponen.

**Consequences:**
- Kontrak berubah dalam satu PR atomik; tidak ada drift.
- CI bisa memakai path filter; deploy tetap independen.
- Perekrut melihat satu repo yang koheren.
- Perlu disiplin boundary dan CODEOWNERS.

**Reversal cost:** Rendah–sedang. `apps/*` dan `services/*` sudah menjadi garis potong; memecah repo tinggal memindahkan folder + pipeline.

---

## ADR-002 — React 19 + Vite SPA, bukan Next.js

**Context:** Arsitektur sudah memiliki Cloudflare Workers sebagai API gateway + GraphQL BFF. Job 1 menyebut React/Vue/Next (salah satu), Job 2 menyebut React + Node/Express.

**Options:**
1. React 19 + Vite SPA.
2. Next.js App Router dengan SSR.
3. React + TanStack Start.

**Decision:** Opsi 1. SPA statis di Cloudflare Pages, routing dengan TanStack Router, data dengan TanStack Query.

**Consequences:**
- Bundle kecil, deploy sederhana, tidak ada runtime server FE.
- BFF tetap satu-satunya titik agregasi; tidak ada duplikasi logic.
- Tidak ada SSR/SEO, tetapi aplikasi ini internal/dashboard sehingga tidak krusial.
- Jika target perusahaan sangat menekankan Next.js, tambahkan studi kasus terpisah, bukan mengubah arsitektur inti.

**Reversal cost:** Sedang. Pindah ke Next.js berarti memindahkan routing/data fetching dan menambah runtime; kontrak API tetap sama.

---

## ADR-003 — `tenant_id` Sejak Awal, RLS di Fase Hardening

**Context:** SAU bergerak di HR services untuk banyak perusahaan klien; Aletheia awalnya single-tenant dengan cabang. Menambahkan tenant setelah data ada mahal.

**Options:**
1. Single-tenant per deployment.
2. `tenant_id` sejak desain, RLS di Fase 2/hardening.
3. Full multi-tenant + RLS sejak hari pertama.

**Decision:** Opsi 2. Semua tabel tenant-scoped memiliki `tenant_id`; JWT membawa `tid`; RLS policies dibuat di TASK-03 dan diuji di TASK-03 serta TASK-15 sebelum produksi. TASK-15 hanya hardening/audit lintas tenant, bukan pembuatan policy pertama.

**Consequences:**
- Tidak perlu migrasi besar saat go multi-tenant.
- Unique constraint harus menyertakan `tenant_id`.
- RLS menambah kompleksitas query dan test, tetapi terlokalisasi.
- Super-admin platform memerlukan jalur terpisah.

**Reversal cost:** Tinggi jika memilih single-tenant lalu berubah; rendah jika sudah `tenant_id` tetapi belum RLS.

---

## ADR-004 — Kepemilikan Audit Trail: INSERT-only + Advisory Lock

**Context:** Dokumen awal menyatakan hanya governance-service yang boleh menulis audit, tetapi transaksi klaim/payroll harus menulis audit dalam transaksi DB yang sama. Dua aturan ini bertabrakan dalam microservices.

**Options:**
1. Hanya governance-service menulis; service lain memanggil API (tidak atomic).
2. Semua service menulis langsung ke `governance.audit_logs` dengan role INSERT-only.
3. Transactional outbox + consumer audit (atomic lokal, tetapi audit tertunda).

**Decision:** Opsi 2. `governance.audit_logs` append-only; role aplikasi hanya `INSERT`; fungsi `governance.append_audit_log()` menghitung hash chain dan mengambil `pg_advisory_xact_lock(hashtext(tenant_id::text))` untuk serialisasi per tenant. Governance-service memiliki migrasi, trigger, API baca/verifikasi, dan job verifikasi. Service lain memanggil fungsi dalam transaksi yang sama.

**Consequences:**
- Audit atomic dengan perubahan status.
- Tidak ada fork hash chain karena advisory lock.
- Governance tidak lagi "satu-satunya penulis", tetapi tetap "pemilik skema dan verifier"; boundary diperbarui di dokumen.
- Throughput audit per tenant diserialisasi; untuk volume besar, partisi per tenant/rentang waktu.

**Reversal cost:** Tinggi. Mengganti ke outbox berarti mengubah kontrak audit dan jaminan atomicity.

---

## ADR-005 — Payment Adapter + Mock Provider

**Context:** Klaim dan payroll membutuhkan pencairan, tetapi integrasi bank/payment gateway nyata menambah KYC, biaya, dan risiko.

**Options:**
1. Status marking saja.
2. Adapter pattern + mock, Xendit/Midtrans opsional.
3. Integrasi provider nyata sejak awal.

**Decision:** Opsi 2. `packages/payments` mendefinisikan `PaymentProvider` (create, getStatus, cancel, parseWebhook); implementasi `MockPaymentProvider` untuk demo/test; adapter Xendit/Midtrans disiapkan tetapi tidak wajib.

**Consequences:**
- Demo tetap realistis tanpa dana nyata.
- State machine `PENDING → PROCESSING → PAID | FAILED | REVERSED` diuji.
- Webhook idempotency dan rekonsiliasi bisa didemokan.
- Provider nyata tinggal implementasi interface.

**Reversal cost:** Rendah. Menambah provider baru tidak mengubah domain.

---

## ADR-006 — HRIS-lite sebagai Milestone, Full HRIS sebagai Future

**Context:** Job 1 menekankan HRIS + payroll. Full HRIS (absensi, shift, performance, rekrutmen) terlalu luas untuk proyek solo dan menunda demo.

**Options:**
1. Payroll + reporting saja.
2. HRIS-lite: employee lifecycle, attendance/leave summary, payslip, PPh 21/BPJS reports.
3. Full HRIS.

**Decision:** Opsi 2. Full HRIS dicatat di `docs/11` sebagai future development dan tidak masuk fase pengerjaan.

**Consequences:**
- Cukup untuk menyebut "HRIS & payroll" dengan jujur.
- Fokus pada kedalaman payroll/pajak/audit, bukan luasnya modul.
- Absensi clock-in/out dan shift tidak dikerjakan.

**Reversal cost:** Rendah untuk menambah modul; tinggi jika ingin mengklaim full HRIS tanpa implementasi.

---

## ADR-007 — UUIDv7 untuk Primary Key

**Context:** Dokumen awal menyebut UUIDv7 tetapi juga `gen_random_uuid()`; `gen_random_uuid()` adalah UUIDv4 acak yang menyebabkan fragmentasi indeks.

**Options:**
1. `BIGSERIAL`.
2. UUIDv4 (`gen_random_uuid()`).
3. UUIDv7 (application-generated in TypeScript/Go).

**Decision:** Opsi 3. Gunakan UUIDv7 dari aplikasi (TS/Go); target Neon PostgreSQL 16 belum menyediakan `uuidv7()`, jadi jangan mengandalkan fungsi DB. `gen_random_uuid()` hanya untuk kolom non-ordering (misalnya `event_uuid`).

**Consequences:**
- Indeks B-Tree lebih padat, insert lebih lokal.
- ID dapat diurutkan berdasarkan waktu tanpa kolom tambahan.
- Perlu konsistensi generator di semua service.

**Reversal cost:** Sedang; migrasi PK besar, jadi keputusan harus konsisten sejak awal.

---

## ADR-008 — Model `analytics.anomaly_flags` yang Mencakup Konflik Non-Personel

**Context:** `MULTI_CLAIM_SAME_ACCOUNT` adalah konflik antar-klaim tanpa personel, tetapi skema awal mewajibkan `matched_personnel_id NOT NULL`.

**Options:**
1. Tetap NOT NULL; konflik non-personel tidak disimpan.
2. Buat `matched_personnel_id` nullable + `matched_claim_id` nullable + check minimal satu.
3. Tabel terpisah per jenis konflik.

**Decision:** Opsi 2. Tambahkan `matched_claim_id UUID NULL`; constraint `CHECK (matched_personnel_id IS NOT NULL OR matched_claim_id IS NOT NULL)`; unique index memakai `COALESCE` atau partial index per tipe.

**Consequences:**
- Semua tipe konflik dapat disimpan.
- Query harus menangani nullable.
- Unique constraint lebih kompleks tetapi tetap idempoten.

**Reversal cost:** Rendah.

---

## ADR-009 — PPh 21 Bulanan TER + Rekonsiliasi Tahunan

**Context:** Dokumen awal hanya mencakup TER bulanan. Payroll yang kredibel membutuhkan rekonsiliasi tahunan (progressive brackets, PTKP, kredit TER) dan pelaporan.

**Options:**
1. TER bulanan saja.
2. TER bulanan + rekonsiliasi tahunan + laporan.
3. Hitung annual setiap bulan (bukan TER).

**Decision:** Opsi 2. TER untuk withholding bulanan; rekonsiliasi tahunan memakai `pph21_annual_brackets`, `ptkp_amounts`, dan komponen deductible dari policy. Hasil disimpan di `payroll.tax_reconciliations`; data bulanan tidak ditimpa.

**Consequences:**
- Perhitungan lebih lengkap dan realistis.
- Perlu policy tambahan dan test boundary.
- Ada disclaimer: bukan nasihat pajak final; verifikasi dengan konsultan.

**Reversal cost:** Rendah; tabel dan endpoint terpisah.

---

## ADR-010 — Observability: OpenTelemetry + Grafana Cloud/Axiom

**Context:** Job 2 mensyaratkan monitoring dan maintenance; free-tier membatasi biaya.

**Options:**
1. Logs saja.
2. OTel + Grafana Cloud/Axiom + Prometheus metrics.
3. Self-hosted ELK/Prometheus stack.

**Decision:** Opsi 2. OTel SDK di Express/Go, OTLP ke Grafana Cloud/Axiom; `/metrics` untuk scrape opsional; dashboard JSON di `infra/observability/`.

**Consequences:**
- Trace lintas edge → service → DB.
- SLO dan alert dapat dibuktikan.
- Perlu redaksi PII dan sampling.
- Biaya free-tier cukup untuk demo.

**Reversal cost:** Rendah; OTel adalah standar terbuka.

---

## ADR-011 — Klaim Memiliki Alur Pencairan Eksplisit

**Context:** Status `DISBURSED` ada di enum klaim, tetapi tidak ada endpoint/tabel pencairan. Ini membuat status mati atau alur tak jelas.

**Options:**
1. Hapus `DISBURSED` dari klaim.
2. Tambahkan `claims.disbursements` + endpoint + payment adapter.
3. Gabungkan ke payroll disbursement.

**Decision:** Opsi 2. `claims.disbursements` menyimpan provider, reference, amount, status, idempotency key, timestamps; endpoint `POST /claims/:id/disburse` (Finance Manager) memakai `packages/payments`. Klaim menjadi `DISBURSED` hanya setelah payment `PAID`.

**Consequences:**
- Alur end-to-end lengkap.
- Perlu state machine dan rekonsiliasi.
- Tidak mencampur domain klaim dan payroll.

**Reversal cost:** Rendah; dapat dihapus jika klaim tidak dicairkan langsung.

---

## ADR-012 — Redis untuk Rate Limit, Lock, Idempotency & Cache Terpilih

**Context:** Upstash free tier 10k command/hari; setiap request tidak boleh boros.

**Options:**
1. Redis untuk semua cache/rate limit.
2. Redis hanya untuk rate limit mutasi, lock, idempotency, cache agregasi.
3. Tanpa Redis; pakai PostgreSQL.

**Decision:** Opsi 2. TTL eksplisit, pipeline untuk multi-command, hindari `KEYS *`; cache agregasi 10 menit; rate limit per endpoint/user.

**Consequences:**
- Kuota lebih terkendali.
- Fallback DB saat Redis down.
- Perlu metric command count.

**Reversal cost:** Rendah.

---

## ADR-013 — Audit Chain Serialization per Tenant

**Context:** Hash chain membutuhkan urutan penulisan; multi-instance service dapat menulis bersamaan.

**Options:**
1. Chain global (satu lock untuk semua tenant).
2. Chain per tenant dengan advisory lock per tenant.
3. Tanpa chain, hanya append-only.

**Decision:** Opsi 2. `pg_advisory_xact_lock(hashtext(tenant_id::text))`; `prev_record_hash` dari baris terakhir tenant; genesis hash untuk baris pertama.

**Consequences:**
- Tidak ada fork chain.
- Throughput per tenant diserialisasi; tenant besar perlu partisi/arsip.
- Verifikasi per tenant mudah.

**Reversal cost:** Tinggi; mengubah skema hash berarti migrasi audit.

---

## ADR-014 — Pemisahan `packages/payments` dari Service

**Context:** Klaim dan payroll sama-sama membutuhkan pencairan; menduplikasi logika provider di dua service berisiko.

**Options:**
1. Duplikasi adapter di claims/payroll.
2. Package bersama `packages/payments`.
3. Service payment terpisah.

**Decision:** Opsi 2. Interface + mock + adapter di package; masing-masing service memiliki tabel pembayaran sendiri dan memanggil package: `claims.disbursements` (claims-service) dan `payroll.payments` (payroll-service). Webhook provider diarahkan ke service pemilik berdasarkan prefix referensi (`CLM-` vs `PAY-`) melalui endpoint terpisah; tidak ada endpoint `GET /payments/:id` lintas-service.

**Consequences:**
- Satu kontrak provider, test sekali.
- Tidak menambah service/container.
- Tabel tetap terpisah sesuai bounded context.
- Provider harus mengonfigurasi dua webhook URL (claims & payroll) atau router tipis di edge berdasarkan prefix; jangan menulis ke dua skema dalam satu handler.
- Payment intent unik per entity mencegah double payment meski idempotency key berbeda.

**Reversal cost:** Rendah; bisa diekstrak menjadi service jika volume besar.

---

## ADR-015 — Payment Intent & Ownership per Bounded Context

**Context:** Audit menemukan bahwa `payroll.items` tidak punya state machine pembayaran yang tahan retry, dan `claims.disbursements` bisa punya dua payment aktif dengan idempotency key berbeda. Webhook provider juga tidak jelas pemiliknya.

**Options:**
1. Satu tabel payment global.
2. Payment intent per service: `claims.disbursements` + `payroll.payments`.
3. Status di `payroll.items` saja.

**Decision:** Opsi 2. Setiap service memiliki tabel payment sendiri. Unique parsial `(tenant_id, claim_id) WHERE status IN ('PENDING','PROCESSING','PAID')` untuk klaim dan `(tenant_id, batch_id, personnel_id) WHERE status IN (...)` untuk payroll. Webhook diarahkan ke service pemilik berdasarkan prefix referensi (`CLM-`/`PAY-`); tidak ada handler yang menulis ke dua skema.

**Consequences:**
- double payment dicegah oleh constraint, bukan hanya kode.
- retry membuat `attempt_no` baru hanya setelah `FAILED`.
- provider harus mengonfigurasi dua URL webhook atau router tipis di edge.
- `GET /payments/:id` global dihapus; gunakan endpoint per service.

**Reversal cost:** Tinggi; mengubah model payment berarti migrasi data dan kontrak webhook.

---

## ADR-016 — Audit Writer `SECURITY DEFINER` & Canonical Hash

**Context:** Role aplikasi memiliki `INSERT` langsung ke `audit_logs`, sehingga fungsi hash chain bisa dilewati. Definisi hash juga sirkular karena menyertakan `record_hash`.

**Options:**
1. Grant `INSERT` langsung.
2. `SECURITY DEFINER` function, `EXECUTE` only, canonical JSON.
3. Outbox + consumer.

**Decision:** Opsi 2. `governance.append_audit_log()` dimiliki governance, `SECURITY DEFINER`, `search_path` tetap, memaksa `tenant_id`, menghitung hash dari canonical JSON (RFC 8785) kolom kecuali `record_hash` + `prev_record_hash`, genesis `repeat('0',64)`, actor sistem terdokumentasi. Role aplikasi hanya `EXECUTE`; tidak ada `INSERT/UPDATE/DELETE` langsung.

**Consequences:**
- bypass aplikasi tidak mungkin tanpa mengubah fungsi/role.
- hash dapat diverifikasi ulang secara deterministik.
- perubahan kolom audit memerlukan versi canonical baru + migrasi.
- throughput per tenant diserialisasi advisory lock.

**Reversal cost:** Tinggi; migrasi hash chain harus menghitung ulang seluruh ledger.

---

## ADR-017 — Analytics Materialized View & Security Barrier

**Context:** PostgreSQL tidak mendukung RLS pada materialized view; `analytics.mis_monthly_kpi` berpotensi membaca agregat lintas tenant.

**Options:**
1. MV tanpa RLS, filter di aplikasi.
2. MV + `SECURITY BARRIER` view yang memfilter `tenant_id`.
3. MV per tenant.

**Decision:** Opsi 2. MV memiliki `tenant_id` dan unique index `(tenant_id, branch_id, report_month)`. Semua akses GraphQL/worker melalui `analytics.v_mis_monthly_kpi` yang memfilter `current_setting('app.tenant_id')`. Refresh dikoalesikan per tenant (debounce 5 menit).

**Consequences:**
- isolasi tenant tetap di database, bukan hanya kode.
- refresh tidak membanjiri Neon/QStash.
- view menambah satu lapisan query; ukur dengan `EXPLAIN`.

**Reversal cost:** Rendah–sedang; view bisa diubah tanpa mengubah MV.

---

## ADR-018 — Risk & Compliance Gate Sebelum Approval

**Context:** Evaluasi risiko berjalan async setelah submit, tetapi klaim sudah bisa di-approve sebelum evaluasi selesai. Konflik `CRITICAL` juga tidak punya status review compliance.

**Options:**
1. Approval bebas; risiko hanya informasi.
2. Status `RISK_PENDING` + `COMPLIANCE_REVIEW`, approval ditolak sampai gate terlewati.
3. Blocking synchronous scan.

**Decision:** Opsi 2. Submit → `RISK_PENDING`; worker mengisi `risk_evaluated_at`. Jika konflik `CRITICAL`, status `COMPLIANCE_REVIEW` dan `COMPLIANCE_ADMIN` mencatat review (bukan approval transaksi). `FINANCE_MANAGER` baru boleh approve setelah gate terlewati; error `409 ERR_RISK_PENDING`/`ERR_COMPLIANCE_REVIEW_PENDING`.

**Consequences:**
- kontrol fraud tidak bisa dilewati dengan menekan approve cepat.
- latency approval bergantung worker; monitoring queue wajib.
- compliance memiliki jejak review terpisah dari approval.

**Reversal cost:** Rendah; status/gate dapat dilonggarkan dengan ADR baru.

---

## Ringkasan Keputusan

| ADR | Keputusan | Dampak |
| --- | --- | --- |
| 001 | Monorepo + deploy terpisah | kontrak tidak drift |
| 002 | React 19 + Vite SPA | FE sederhana, BFF tunggal |
| 003 | `tenant_id` + RLS policy di TASK-03, audit di TASK-15 | siap multi-tenant |
| 004 | Audit INSERT-only + advisory lock | atomic + tamper-evident |
| 005 | Payment adapter + mock | disbursement realistis |
| 006 | HRIS-lite | fokus & cukup untuk lowongan |
| 007 | UUIDv7 | indeks sehat |
| 008 | Anomaly nullable | semua konflik tersimpan |
| 009 | TER + annual reconciliation | payroll kredibel |
| 010 | OTel + Grafana/Axiom | monitoring terbukti |
| 011 | Claims disbursement | alur end-to-end |
| 012 | Redis selektif | kuota aman |
| 013 | Chain per tenant | tidak ada fork |
| 014 | `packages/payments` | tidak duplikasi |
| 015 | Payment intent per service + partial unique | double payment dicegah DB |
| 016 | Audit `SECURITY DEFINER` + canonical hash | tidak bisa bypass |
| 017 | MV + security barrier view | isolasi tenant analytics |
| 018 | Risk/compliance gate | approval tidak mendahului scan |

## Batasan Keras ADR

> 1. Dilarang mengubah keputusan ADR tanpa ADR baru.
> 2. Dilarang mengimplementasikan kontrak yang bertentangan dengan ADR aktif.
> 3. Dilarang menghapus ADR lama; tandai `Superseded by ADR-XXX`.
> 4. Setiap ADR wajib menyebutkan reversal cost.
