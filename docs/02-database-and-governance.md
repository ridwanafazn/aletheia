# `02-database-and-governance.md` — Skema PostgreSQL, Optimasi Kueri & Tata Kelola Audit Aletheia

* **Nama Sistem:** Aletheia (*Enterprise Disbursement Governance & MIS Intelligence Platform*)

* **Status Dokumen:** Spesifikasi Basis Data & Tata Kelola (*Single Source of Truth* untuk Agen OpenCode)

* **Mesin Database Target:** Neon Serverless PostgreSQL 16+ (dengan PgBouncer Connection Pooler)

* **Akses Runtime:** Drizzle ORM (Express.js TypeScript Services) & `pgx/v5` (Go Async Worker)

* **Implementasi:** `packages/database` berisi skema Drizzle, migrasi SQL, RLS, audit chain, materialized view, dan seed.

## 1. Strategi Isolasi *Microservices* di Atas Neon *Free-Tier*

Pada paket *free-tier* Neon (`512 MB` penyimpanan dan satu proyek aktif), keempat *bounded context* tidak perlu dipisah ke empat instans server database fisik yang terpisah, melainkan menerapkan **Logical Schema Isolation** di dalam satu database produksi (`aletheia_prod`) dengan pemisahan hak akses (*database roles*) dan *environment branching* Neon:

1. **Pemisahan Skema (*PostgreSQL Schemas*):**

   * `governance`: Menyimpan pengguna, cabang, versi kebijakan (*Policy References*), dan buku besar audit permanen.

   * `claims`: Menyimpan pengajuan klaim, metadata dokumen Cloudinary, dan riwayat persetujuan berjenjang.

   * `payroll`: Menyimpan profil karyawan/agen, periode penggajian, dan rincian item pencairan.

   * `analytics`: Menyimpan peringatan anomali lintas-domain, *Materialized Views* MIS, dan catatan simulasi *What-If*.

2. **Aturan Kepemilikan Data (*Cross-Schema Boundary*):**

   * Layanan hanya boleh melakukan operasi `INSERT`, `UPDATE`, atau `DELETE` pada skemanya sendiri.

   * Lintas-skema hanya diizinkan untuk operasi baca (`SELECT`) oleh layanan `analytics-worker-go` dan lapisan agregasi GraphQL, tanpa *foreign key* lintas-skema yang mengikat secara kaku (*loose coupling*), cukup menyimpan UUID referensi.

3. **Neon Database Branching:**

   * `main` (Production): Cabang utama yang terhubung ke lingkungan produksi.

   * `staging`: Cabang turunan untuk pengujian integrasi CI/CD.

   * `dev`: Cabang pengembangan lokal agar migrasi skema tidak pernah merusak data utama.

## 1A. Model Tenant & *Row-Level Security*

Aletheia disiapkan untuk melayani banyak perusahaan klien dalam satu deployment (multi-tenant), dengan isolasi di level database.

1. **Tabel `governance.tenants`** — identitas perusahaan klien: `id`, `code`, `name`, `status`, `created_at`.
2. **`tenant_id` wajib** pada setiap tabel tenant-scoped (governance, claims, payroll, analytics). Primary key tetap UUID; `tenant_id` menjadi bagian dari unique constraint dan index.
3. **Sumber `tenant_id`** — hanya dari JWT terverifikasi (`tid`), diteruskan edge sebagai header internal bertanda tangan. Dilarang membaca dari body/query.
4. **RLS** — aktif di semua tabel tenant-scoped:
   ```sql
   ALTER TABLE claims.submissions ENABLE ROW LEVEL SECURITY;

   CREATE POLICY tenant_isolation ON claims.submissions
     USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
     WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
   ```
5. **Setelan transaksi** — service menjalankan `SET LOCAL app.tenant_id = $1` di awal transaksi; pool di-reset setelah commit/rollback.
6. **Role database** — `aletheia_app` (DML terbatas + INSERT audit), `aletheia_readonly` (analytics), `aletheia_migrator` (DDL). Tidak ada superuser aplikasi.
7. **Uji wajib** — tenant A tidak dapat membaca/menulis data tenant B meski memiliki UUID valid; hasil 404/403 tanpa membocorkan keberadaan data.
8. **Unique constraint** — selalu menyertakan `tenant_id`, misalnya `(tenant_id, email)`, `(tenant_id, claim_number)`, `(tenant_id, batch_code)`.

## 2. Diagram Hubungan Entitas (*Entity-Relationship Diagram*)

```
erDiagram
    GOVERNANCE_BRANCHES ||--o{ GOVERNANCE_USERS : "memiliki"
    GOVERNANCE_USERS ||--o{ GOVERNANCE_POLICY_VERSIONS : "menerbitkan"
    GOVERNANCE_USERS ||--o{ GOVERNANCE_AUDIT_LOGS : "pelaku"

    GOVERNANCE_POLICY_VERSIONS ||--o{ CLAIMS_SUBMISSIONS : "mengikat_aturan"
    CLAIMS_SUBMISSIONS ||--o{ CLAIMS_DOCUMENTS : "melampirkan"
    CLAIMS_SUBMISSIONS ||--o{ CLAIMS_APPROVAL_STEPS : "diproses_melalui"

    GOVERNANCE_POLICY_VERSIONS ||--o{ PAYROLL_BATCHES : "mengikat_tarif"
    PAYROLL_BATCHES ||--o{ PAYROLL_ITEMS : "memuat"
    PAYROLL_PERSONNEL ||--o{ PAYROLL_ITEMS : "menerima"

    CLAIMS_SUBMISSIONS ||--o{ ANALYTICS_ANOMALY_FLAGS : "dipindai"
    PAYROLL_PERSONNEL ||--o{ ANALYTICS_ANOMALY_FLAGS : "beririsan_dengan"
    GOVERNANCE_POLICY_VERSIONS ||--o{ ANALYTICS_WHAT_IF_RUNS : "dasar_simulasi"

```

## 3. Spesifikasi Tabel Inti per Skema

> **Template wajib setiap tabel tenant-scoped** (manifest di bawah fokus pada kolom domain; `tenant_id` tetap wajib meski tidak diulang):
>
> ```sql
> CREATE TABLE <schema>.<table> (
>   id UUID PRIMARY KEY,
>   tenant_id UUID NOT NULL,
>   -- kolom domain
>   created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
>   updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
> );
> ALTER TABLE <schema>.<table> ENABLE ROW LEVEL SECURITY;
> CREATE POLICY tenant_isolation ON <schema>.<table>
>   USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
>   WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
> ```
>
> Pengecualian: `governance.tenants` (root), `governance.audit_logs` (append-only; `created_at` = `recorded_at`), dan tabel referensi global.

Seluruh tabel menggunakan **UUIDv7** yang dibuat di aplikasi (TypeScript/Go) sebagai *Primary Key* untuk mencegah fragmentasi indeks B-Tree, dengan pengecualian `governance.audit_logs.id` yang memakai `BIGSERIAL` untuk deteksi gap. Jangan mengandalkan `uuidv7()` karena target Neon PostgreSQL 16 belum menyediakannya; `gen_random_uuid()` (UUIDv4) hanya boleh untuk kolom non-ordering seperti `event_uuid`. Gunakan `NUMERIC(18, 2)` untuk seluruh nilai mata uang (dilarang keras menggunakan `FLOAT` atau `DOUBLE PRECISION`), serta `TIMESTAMPTZ` (UTC) untuk seluruh stempel waktu. Setiap tabel tenant-scoped wajib memiliki `tenant_id UUID NOT NULL`.

> **Aturan global:** seluruh tabel di Bagian 3 memiliki `tenant_id UUID NOT NULL` dan RLS, kecuali `governance.tenants` (root) dan tabel referensi global. Unique constraint selalu menyertakan `tenant_id`.

### A. Skema `governance` (Identitas, Kebijakan Berversi & Audit Permanen)

#### 0. `governance.tenants`

* `id` (`UUID`, PK)
* `code` (`VARCHAR(24)`, `UNIQUE`, `NOT NULL`) — contoh `SAU`, `BPUI`
* `name` (`VARCHAR(120)`, `NOT NULL`)
* `status` (`VARCHAR(16)`, `NOT NULL`) — `ACTIVE`, `SUSPENDED`
* `created_at` (`TIMESTAMPTZ`, `DEFAULT NOW()`)

#### 1. `governance.branches`

* `id` (`UUID`, PK)

* `code` (`VARCHAR(16)`, `NOT NULL`) — Contoh: `BDG-01`, `JKT-HQ`; `UNIQUE (tenant_id, code)`

* `name` (`VARCHAR(100)`, `NOT NULL`)

* `region` (`VARCHAR(50)`, `NOT NULL`)

* `monthly_disbursement_cap` (`NUMERIC(18, 2)`, `NOT NULL`) — cache dari policy; perubahan hanya melalui publish policy version baru.

* `cap_policy_version_id` (`UUID`, `NULLABLE`) — versi policy yang menetapkan cap.

* `created_at` (`TIMESTAMPTZ`, `DEFAULT NOW()`)

#### 2. `governance.users`

* `id` (`UUID`, PK)

* `branch_id` (`UUID`, FK ke `governance.branches.id`)

* `employee_number` (`VARCHAR(32)`, `NOT NULL`) — `UNIQUE (tenant_id, employee_number)`

* `full_name` (`VARCHAR(120)`, `NOT NULL`)

* `email` (`VARCHAR(150)`, `NOT NULL`) — `UNIQUE (tenant_id, email)`

* `password_hash` (`TEXT`, `NOT NULL`)

* `mfa_secret_encrypted` (`TEXT`, `NULLABLE`) — TOTP secret terenkripsi; wajib untuk role privileged di produksi.
* `mfa_enabled` (`BOOLEAN`, `DEFAULT FALSE`, `NOT NULL`)

* `role` (`VARCHAR(32)`, `NOT NULL`) — Enum aplikasi: `CLAIMS_OFFICER`, `HR_SPECIALIST`, `BRANCH_MANAGER`, `FINANCE_MANAGER`, `MIS_ANALYST`, `COMPLIANCE_ADMIN`

* `is_active` (`BOOLEAN`, `DEFAULT TRUE`, `NOT NULL`)

* `created_at` (`TIMESTAMPTZ`, `DEFAULT NOW()`)

#### 3. `governance.policy_versions` *(Inti Pilar Policy-as-Reference)*

Menyimpan aturan bisnis dinamis sebagai dokumen berversi yang tidak dapat diubah setelah berstatus `ACTIVE` atau `ARCHIVED`.

* `id` (`UUID`, PK)

* `domain` (`VARCHAR(24)`, `NOT NULL`) — `CLAIMS_POLICY` atau `PAYROLL_TAX_POLICY`

* `version_tag` (`VARCHAR(32)`, `NOT NULL`) — Contoh: `v2026.11.01`

* `status` (`VARCHAR(16)`, `NOT NULL`) — `DRAFT`, `ACTIVE`, `ARCHIVED`

* `rules_payload` (`JSONB`, `NOT NULL`) — Berisi parameter terstruktur (batas nominal approval per jenjang, bobot skor risiko klaim, lapisan tarif PPh 21, persentase BPJS, dan rumus komisi agen).

* `checksum_sha256` (`CHAR(64)`, `NOT NULL`) — Hash kriptografis dari `rules_payload` untuk verifikasi integritas.

* `effective_from` (`TIMESTAMPTZ`, `NOT NULL`)

* `published_by` (`UUID`, FK ke `governance.users.id`)
* `approved_by` (`UUID`, `NULLABLE`) — checker kedua; wajib berbeda dari `published_by` saat publish.

* `created_at` (`TIMESTAMPTZ`, `DEFAULT NOW()`)

* *Constraint:* `UNIQUE (tenant_id, domain, version_tag)`, *Partial Unique Index* `(tenant_id, domain) WHERE status = 'ACTIVE'` untuk memastikan hanya ada maksimal satu `ACTIVE` policy per tenant per `domain`, dan `CHECK (status <> 'ACTIVE' OR (approved_by IS NOT NULL AND approved_by <> published_by))` untuk dual control.

#### 4. `governance.audit_logs` *(Immutable Explainable Audit Trail)*

Buku besar catatan sejarah yang dilindungi oleh pemicu tingkat database (*database trigger*) agar tidak pernah bisa dimodifikasi maupun dihapus.

* `id` (`BIGSERIAL`, PK) — Nomor urut monotonik untuk mendeteksi celah penghapusan.

* `tenant_id` (`UUID`, `NOT NULL`)

* `event_uuid` (`UUID`, `NOT NULL`) — `UNIQUE (tenant_id, event_uuid)`

* `correlation_id` (`UUID`, `NOT NULL`)

* `actor_id` (`UUID`, `NOT NULL`)

* `actor_role` (`VARCHAR(32)`, `NOT NULL`)

* `domain` (`VARCHAR(32)`, `NOT NULL`) — `GOVERNANCE`, `CLAIMS`, `PAYROLL`, `ANALYTICS`

* `entity_type` (`VARCHAR(48)`, `NOT NULL`) — Contoh: `CLAIM_SUBMISSION`, `PAYROLL_BATCH`, `POLICY_VERSION`

* `entity_id` (`UUID`, `NOT NULL`)

* `action` (`VARCHAR(48)`, `NOT NULL`) — Contoh: `CLAIM_APPROVED`, `BATCH_DISBURSED`, `POLICY_PUBLISHED`

* `policy_version_id` (`UUID`, `NULLABLE`) — Referensi aturan yang berlaku saat keputusan diambil.

* `decision_context` (`JSONB`, `NOT NULL`) — Snapshot alasan persetujuan/penolakan, skor risiko saat itu, dan perubahan nilai (*before/after*).

* `prev_record_hash` (`CHAR(64)`, `NOT NULL`) — Hash dari baris audit sebelumnya (*tamper-evident hash chain*).

* `record_hash` (`CHAR(64)`, `NOT NULL`) — SHA-256 dari canonical JSON (RFC 8785) seluruh kolom **kecuali `record_hash`** + `prev_record_hash`.

* `recorded_at` (`TIMESTAMPTZ`, `DEFAULT NOW()`, `NOT NULL`)

#### 5. `governance.refresh_tokens`

* `id` (`UUID`, PK)
* `tenant_id` (`UUID`, `NOT NULL`)
* `user_id` (`UUID`, FK ke `governance.users.id`)
* `token_hash` (`CHAR(64)`, `UNIQUE`, `NOT NULL`) — SHA-256 + pepper
* `family_id` (`UUID`, `NOT NULL`) — untuk reuse detection
* `expires_at` (`TIMESTAMPTZ`, `NOT NULL`)
* `revoked_at` (`TIMESTAMPTZ`, `NULLABLE`)
* `replaced_by` (`UUID`, `NULLABLE`)
* `user_agent` / `ip_hash` (`VARCHAR(255)` / `CHAR(64)`, `NULLABLE`)
* `created_at` (`TIMESTAMPTZ`, `DEFAULT NOW()`)

* *Constraint:* index `(tenant_id, user_id, expires_at)`; token lama tidak dihapus, hanya `revoked_at` diisi.

#### 6. `governance.mfa_recovery_codes`

* `id` (`UUID`, PK)
* `tenant_id` (`UUID`, `NOT NULL`)
* `user_id` (`UUID`, FK ke `governance.users.id`)
* `code_hash` (`CHAR(64)`, `NOT NULL`)
* `used_at` (`TIMESTAMPTZ`, `NULLABLE`)
* `created_at` (`TIMESTAMPTZ`, `DEFAULT NOW()`)

* *Constraint:* `UNIQUE (tenant_id, user_id, code_hash)`; kode sekali pakai.

#### 7. `governance.idempotency_records`

* `id` (`UUID`, PK)
* `tenant_id` (`UUID`, `NOT NULL`)
* `actor_id` (`UUID`, `NOT NULL`)
* `scope` (`VARCHAR(120)`, `NOT NULL`) — method dan pola path, misalnya `POST:/api/v1/claims/:id/decide`.
* `idempotency_key` (`VARCHAR(64)`, `NOT NULL`)
* `request_hash` (`CHAR(64)`, `NOT NULL`) — hash canonical payload untuk mendeteksi pemakaian kunci dengan body berbeda.
* `status` (`VARCHAR(16)`, `NOT NULL`) — `IN_PROGRESS` atau `COMPLETED`.
* `response_status` / `response_body` (`INTEGER` / `JSONB`, `NULLABLE`) — snapshot respons untuk replay.
* `created_at` / `completed_at` (`TIMESTAMPTZ`)

* *Constraint:* `UNIQUE (tenant_id, actor_id, scope, idempotency_key)`; RLS tenant isolation aktif. Baris ditulis dalam transaksi bisnis yang sama sehingga kegagalan akan membatalkan keduanya.

### B. Skema `claims` (Operasional Klaim & Persetujuan Berjenjang)

#### 1. `claims.submissions`

* `id` (`UUID`, PK)

* `claim_number` (`VARCHAR(32)`, `NOT NULL`) — Format: `CLM-<TENANT>-YYYYMM-XXXXXX`; `UNIQUE (tenant_id, claim_number)`

* `branch_id` (`UUID`, `NOT NULL`)

* `policy_version_id` (`UUID`, `NOT NULL`) — Terkunci permanen saat klaim dibuat.

* `claimant_name` (`VARCHAR(120)`, `NOT NULL`)

* `claimant_nik_hash` (`CHAR(64)`, `NOT NULL`) — Hash SHA-256 + salt untuk pencocokan anomali lintas-domain tanpa mengekspos NIK mentah di indeks.

* `claimant_nik_masked` (`VARCHAR(20)`, `NOT NULL`) — Contoh: `3273********0004`

* `bank_account_hash` (`CHAR(64)`, `NOT NULL`) — Hash rekening penerima untuk deteksi benturan kepentingan dengan karyawan/agen.

* `bank_account_masked` (`VARCHAR(24)`, `NOT NULL`)

* `claim_category` (`VARCHAR(32)`, `NOT NULL`) — `HEALTH`, `ACCIDENT`, `PROPERTY`, `GUARANTEE`

* `requested_amount` (`NUMERIC(18, 2)`, `NOT NULL`)

* `approved_amount` (`NUMERIC(18, 2)`, `NULLABLE`)

* `risk_score` (`SMALLINT`, `DEFAULT 0`, `NOT NULL`) — Skor `0-100` hasil evaluasi pekerja asinkron Go.

* `risk_evaluated_at` (`TIMESTAMPTZ`, `NULLABLE`) — `NULL` berarti evaluasi belum selesai; approval dilarang.

* `has_conflict_flag` (`BOOLEAN`, `DEFAULT FALSE`, `NOT NULL`)

* `status` (`VARCHAR(24)`, `NOT NULL`) — `DRAFT`, `SUBMITTED`, `RISK_PENDING`, `UNDER_REVIEW`, `RETURNED`, `ESCALATED`, `COMPLIANCE_REVIEW`, `APPROVED`, `REJECTED`, `DISBURSED`

* `compliance_reviewed_by` / `compliance_reviewed_at` (`UUID` / `TIMESTAMPTZ`, `NULLABLE`) — review flag kritis; bukan approval transaksi.

* `created_by` (`UUID`, `NOT NULL`) — ID *Claims Officer* (*Maker*).

* `idempotency_key` (`VARCHAR(64)`, `NOT NULL`) — `UNIQUE (tenant_id, idempotency_key)`

* `submitted_at` (`TIMESTAMPTZ`, `NULLABLE`)

* `finalized_at` (`TIMESTAMPTZ`, `NULLABLE`)

* `created_at` (`TIMESTAMPTZ`, `DEFAULT NOW()`)

* `updated_at` (`TIMESTAMPTZ`, `DEFAULT NOW()`)

#### 2. `claims.documents`

* `id` (`UUID`, PK)

* `claim_id` (`UUID`, FK ke `claims.submissions.id` ON DELETE CASCADE)

* `document_type` (`VARCHAR(32)`, `NOT NULL`) — `IDENTITY_CARD`, `MEDICAL_INVOICE`, `POLICE_REPORT`, `POLICY_CERT`

* `cloudinary_public_id` (`VARCHAR(255)`, `NOT NULL`)

* `secure_url` (`TEXT`, `NOT NULL`)

* `mime_type` (`VARCHAR(64)`, `NOT NULL`)

* `file_size_bytes` (`INTEGER`, `NOT NULL`)

* `uploaded_by` (`UUID`, `NOT NULL`)

* `uploaded_at` (`TIMESTAMPTZ`, `DEFAULT NOW()`)

#### 3. `claims.approval_steps`

* `id` (`UUID`, PK)

* `claim_id` (`UUID`, FK ke `claims.submissions.id`)

* `step_level` (`SMALLINT`, `NOT NULL`) — `1` (*Branch Manager*), `2` (*Finance Manager / Escalated*)

* `approver_id` (`UUID`, `NOT NULL`)

* `decision` (`VARCHAR(16)`, `NOT NULL`) — `APPROVED`, `REJECTED`, `RETURNED`

* `reason_notes` (`TEXT`, `NOT NULL`) — Wajib diisi minimal 15 karakter.

* `decided_at` (`TIMESTAMPTZ`, `DEFAULT NOW()`)

* *Constraint:* `CHECK (approver_id IS NOT NULL)` + validasi aplikasi dan trigger bahwa `approver_id <> claims.submissions.created_by`; partial unique `(tenant_id, claim_id, step_level) WHERE decision IN ('APPROVED','REJECTED')` agar satu level hanya punya satu keputusan final.

#### 4. `claims.disbursements`

* `id` (`UUID`, PK)
* `tenant_id` (`UUID`, `NOT NULL`)
* `claim_id` (`UUID`, FK ke `claims.submissions.id`)
* `policy_version_id` (`UUID`, `NOT NULL`)
* `provider` (`VARCHAR(24)`, `NOT NULL`) — `MOCK`, `XENDIT`, `MIDTRANS`
* `provider_reference` (`VARCHAR(80)`, `NULLABLE`)
* `amount` (`NUMERIC(18, 2)`, `NOT NULL`)
* `status` (`VARCHAR(16)`, `NOT NULL`) — `PENDING`, `PROCESSING`, `PAID`, `FAILED`, `REVERSED`
* `idempotency_key` (`VARCHAR(64)`, `NOT NULL`)
* `requested_by` / `approved_by` (`UUID`, `NOT NULL`)
* `requested_at` / `paid_at` (`TIMESTAMPTZ`)
* `failure_reason` (`TEXT`, `NULLABLE`) — tanpa PII

* *Constraint:* `UNIQUE (tenant_id, idempotency_key)`, `UNIQUE (tenant_id, provider, provider_reference)`, partial unique `(tenant_id, claim_id) WHERE status IN ('PENDING','PROCESSING','PAID')`, index `(tenant_id, claim_id, status)`. Status `PAID` hanya boleh ditulis oleh handler provider/mock, bukan endpoint manual.

### C. Skema `payroll` (HRIS, Insentif Agen & Pencairan Massal)

> **Kolom tambahan HRIS-lite (wajib):** `personnel` menambahkan `join_date`, `termination_date`, `employment_status`, `tax_id_hash`, `tax_id_masked`, `bpjs_kesehatan_masked`, `bpjs_ketenagakerjaan_masked`, `bank_code`, `bank_name`; `batches` menambahkan `batch_type`, `period_start`, `period_end`, `calculated_at`, `calculation_version`, `variance_vs_batch_id`; `items` menambahkan `overtime_pay`, `proration_days`, `proration_basis`, `unpaid_leave_deduction`, `absence_deduction`, `bpjs_jht_deduction`, `bpjs_jp_deduction`, `bpjs_*_employer`, `taxable_income`, `ytd_gross`, `ytd_tax`, `payment_status`, `payment_intent_id`. Detail di `docs/11-hris-lite-and-payroll-reporting.md` §3.

#### 1. `payroll.personnel`

Menyimpan profil karyawan internal maupun agen eksternal yang berhak menerima gaji atau komisi.

* `id` (`UUID`, PK)

* `branch_id` (`UUID`, `NOT NULL`)

* `personnel_code` (`VARCHAR(32)`, `NOT NULL`) — `UNIQUE (tenant_id, personnel_code)`

* `user_id` (`UUID`, `NULLABLE`, FK ke `governance.users.id`) — tautan akun login untuk self-service/SoD cuti.

* `personnel_type` (`VARCHAR(16)`, `NOT NULL`) — `EMPLOYEE` atau `SALES_AGENT`

* `full_name` (`VARCHAR(120)`, `NOT NULL`)

* `nik_hash` (`CHAR(64)`, `NOT NULL`) — `UNIQUE (tenant_id, nik_hash)`

* `nik_masked` (`VARCHAR(20)`, `NOT NULL`)

* `bank_account_hash` (`CHAR(64)`, `NOT NULL`)

* `bank_account_masked` (`VARCHAR(24)`, `NOT NULL`)

* `ptkp_status` (`VARCHAR(8)`, `NOT NULL`) — `TK/0`, `TK/1`, `TK/2`, `TK/3`, `K/0`, `K/1`, `K/2`, `K/3`; `CHECK` terhadap daftar tersebut (untuk kalkulasi PPh 21).

* `risk_class` (`VARCHAR(8)`, `NOT NULL`) — kelas risiko JKK (`I`..`V`), dipetakan ke `jkk_rate_by_risk_class` pada policy.

* `base_salary` (`NUMERIC(18, 2)`, `DEFAULT 0`, `NOT NULL`)

* `fixed_allowance` (`NUMERIC(18, 2)`, `DEFAULT 0`, `NOT NULL`)

* `is_active` (`BOOLEAN`, `DEFAULT TRUE`, `NOT NULL`)

* `created_at` (`TIMESTAMPTZ`, `DEFAULT NOW()`)

#### 1A. `payroll.sales_achievements`

Sumber tunggal `verified_sales` untuk komisi agen; tanpa ini, komisi tidak boleh dihitung.

* `id` (`UUID`, PK)
* `tenant_id` (`UUID`, `NOT NULL`)
* `personnel_id` (`UUID`, FK ke `payroll.personnel.id`)
* `period_month` (`DATE`, `NOT NULL`)
* `verified_sales` (`NUMERIC(18, 2)`, `NOT NULL`)
* `verification_status` (`VARCHAR(16)`, `NOT NULL`) — `PENDING`, `VERIFIED`, `REJECTED`
* `source` (`VARCHAR(24)`, `NOT NULL`) — `IMPORT`, `API`, `MANUAL`
* `verified_by` / `verified_at` (`UUID` / `TIMESTAMPTZ`)
* `created_at` (`TIMESTAMPTZ`, `DEFAULT NOW()`)

* *Constraint:* `UNIQUE (tenant_id, personnel_id, period_month)`; `CHECK (verified_sales >= 0)`. Hanya baris `VERIFIED` yang boleh dipakai menghitung komisi.

#### 2. `payroll.batches`

* `id` (`UUID`, PK)

* `batch_code` (`VARCHAR(32)`, `NOT NULL`) — Contoh: `PAY-SAU-202611-BDG01`; `UNIQUE (tenant_id, batch_code)`

* `branch_id` (`UUID`, `NOT NULL`)

* `period_month` (`DATE`, `NOT NULL`) — Disimpan sebagai tanggal pertama bulan berjalan (`2026-11-01`).

* `batch_type` (`VARCHAR(24)`, `NOT NULL`) — `REGULAR`, `CORRECTION`, `THR`, `THIRTEENTH_MONTH`

* `correction_seq` (`SMALLINT`, `DEFAULT 0`, `NOT NULL`) — 0 untuk batch normal; 1..n untuk koreksi.

* `period_start` / `period_end` (`DATE`, `NOT NULL`) — Rentang periode eksplisit.

* `calculated_at` (`TIMESTAMPTZ`, `NULLABLE`)

* `calculation_version` (`VARCHAR(16)`, `NULLABLE`)

* `variance_vs_batch_id` (`UUID`, `NULLABLE`)

* `policy_version_id` (`UUID`, `NOT NULL`) — Mengikat versi tarif PPh 21, BPJS, dan rumus komisi agen.

* `status` (`VARCHAR(24)`, `NOT NULL`) — `DRAFT`, `CALCULATING`, `READY_FOR_APPROVAL`, `APPROVED`, `DISBURSING`, `DISBURSED`, `PARTIAL`, `REJECTED`, `CANCELLED`, `FAILED`

* `total_gross_amount` (`NUMERIC(18, 2)`, `DEFAULT 0`, `NOT NULL`)

* `total_tax_pph21` (`NUMERIC(18, 2)`, `DEFAULT 0`, `NOT NULL`)

* `total_bpjs_deduction` (`NUMERIC(18, 2)`, `DEFAULT 0`, `NOT NULL`)

* `total_bpjs_employer` (`NUMERIC(18, 2)`, `DEFAULT 0`, `NOT NULL`)

* `total_net_disbursed` (`NUMERIC(18, 2)`, `DEFAULT 0`, `NOT NULL`)

* `headcount` (`INTEGER`, `DEFAULT 0`, `NOT NULL`)

* `created_by` (`UUID`, `NOT NULL`)

* `approved_by` (`UUID`, `NULLABLE`)

* `approved_at` (`TIMESTAMPTZ`, `NULLABLE`)

* `idempotency_key` (`VARCHAR(64)`, `NOT NULL`) — `UNIQUE (tenant_id, idempotency_key)`

* `disbursed_at` (`TIMESTAMPTZ`, `NULLABLE`)

* `created_at` (`TIMESTAMPTZ`, `DEFAULT NOW()`)

* *Constraint:* `UNIQUE (tenant_id, branch_id, period_month, batch_type, correction_seq)`; `idempotency_key` unik per tenant; `CHECK (approved_by IS NULL OR approved_by <> created_by)`.

#### 3. `payroll.items`

* `id` (`UUID`, PK)

* `batch_id` (`UUID`, FK ke `payroll.batches.id` ON DELETE CASCADE)

* `personnel_id` (`UUID`, FK ke `payroll.personnel.id`)

* `gross_income` (`NUMERIC(18, 2)`, `NOT NULL`)
* `variable_allowance` (`NUMERIC(18, 2)`, `DEFAULT 0`, `NOT NULL`)

* `agent_commission` (`NUMERIC(18, 2)`, `DEFAULT 0`, `NOT NULL`)

* `bpjs_kesehatan_deduction` (`NUMERIC(18, 2)`, `NOT NULL`)

* `bpjs_ketenagakerjaan_deduction` (`NUMERIC(18, 2)`, `NOT NULL`)

* `pph21_tax_deduction` (`NUMERIC(18, 2)`, `NOT NULL`)

* `net_take_home_pay` (`NUMERIC(18, 2)`, `NOT NULL`)

* `calculation_breakdown` (`JSONB`, `NOT NULL`) — Rincian langkah perhitungan TER/progresif PPh 21 & komponen BPJS agar transparan saat diaudit.

* `payment_status` (`VARCHAR(16)`, `DEFAULT 'PENDING'`, `NOT NULL`) — `PENDING`, `PROCESSING`, `PAID`, `FAILED`, `REVERSED`

* `payment_intent_id` (`UUID`, `NULLABLE`) — tautan ke `payroll.payments` terbaru.

* `reconciliation_id` (`UUID`, `NULLABLE`) — tautan ke `payroll.tax_reconciliations` untuk item koreksi tahunan.

* *Constraint:* `UNIQUE (tenant_id, batch_id, personnel_id)` guna mencegah satu karyawan/agen dibayar dua kali dalam satu periode yang sama; `CHECK (gross_income >= 0)`. Net non-negatif divalidasi aplikasi sesuai `negative_net_policy` (bukan diasumsikan).

#### 4. `payroll.attendance_summaries`

* `id` (`UUID`, PK)
* `tenant_id` (`UUID`, `NOT NULL`)
* `personnel_id` (`UUID`, FK ke `payroll.personnel.id`)
* `period_month` (`DATE`, `NOT NULL`) — hari pertama bulan
* `working_days` / `present_days` / `paid_leave_days` / `unpaid_leave_days` / `absent_days` (`SMALLINT`, `NOT NULL`, default 0)
* `overtime_hours` (`NUMERIC(8, 2)`, default 0)
* `source` (`VARCHAR(16)`) — `MANUAL`, `IMPORT`, `API`
* `approved_by` / `approved_at` (`UUID` / `TIMESTAMPTZ`)
* `created_at` / `updated_at` (`TIMESTAMPTZ`)

* *Constraint:* `UNIQUE (tenant_id, personnel_id, period_month)`; `CHECK (unpaid_leave_days >= 0 AND unpaid_leave_days <= working_days AND overtime_hours >= 0)`.

#### 5. `payroll.leave_requests`

* `id` (`UUID`, PK)
* `tenant_id` (`UUID`, `NOT NULL`)
* `personnel_id` (`UUID`, FK)
* `leave_type` (`VARCHAR(24)`) — `ANNUAL`, `SICK`, `MATERNITY`, `UNPAID`, `OTHER`
* `start_date` / `end_date` (`DATE`, `NOT NULL`)
* `days` (`NUMERIC(6, 2)`, `NOT NULL`)
* `status` (`VARCHAR(16)`) — `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`
* `reason` (`TEXT`)
* `decided_by` / `decided_at` (`UUID` / `TIMESTAMPTZ`)
* `decision_notes` (`TEXT`, wajib jika `REJECTED`)
* `created_at` / `updated_at`

* *Constraint:* `CHECK (end_date >= start_date)`, `CHECK (days > 0)`.

#### 6. `payroll.payslips`

* `id` (`UUID`, PK)
* `tenant_id` (`UUID`, `NOT NULL`)
* `batch_id` (`UUID`, FK ke `payroll.batches.id`)
* `personnel_id` (`UUID`, FK ke `payroll.personnel.id`)
* `period_month` (`DATE`, `NOT NULL`)
* `secure_url` (`TEXT`, `NOT NULL`)
* `snapshot_hash_sha256` (`CHAR(64)`, `NOT NULL`) — hash data canonical yang dirender
* `file_checksum_sha256` (`CHAR(64)`, `NOT NULL`) — hash file PDF
* `verification_code` (`VARCHAR(16)`, `NOT NULL`)
* `published_at` (`TIMESTAMPTZ`)
* `viewed_at` (`TIMESTAMPTZ`, `NULLABLE`)
* `version` (`SMALLINT`, `DEFAULT 1`, `NOT NULL`)
* `supersedes_id` (`UUID`, `NULLABLE`)

* *Constraint:* `UNIQUE (tenant_id, batch_id, personnel_id, version)`; index `(tenant_id, personnel_id, period_month)`.

#### 7. `payroll.tax_reports`

* `id` (`UUID`, PK)
* `tenant_id` (`UUID`, `NOT NULL`)
* `report_type` (`VARCHAR(32)`) — `PPH21_MONTHLY`, `PPH21_ANNUAL`, `BPJS_MONTHLY`, `BANK_FILE`, `PAYROLL_VARIANCE`
* `branch_id` (`UUID`, `NULLABLE`) — NULL berarti seluruh cabang
* `policy_version_id` (`UUID`, `NOT NULL`)
* `period_start` / `period_end` (`DATE`, `NOT NULL`)
* `version` (`SMALLINT`, `DEFAULT 1`, `NOT NULL`)
* `status` (`VARCHAR(16)`) — `QUEUED`, `GENERATING`, `READY`, `FAILED`
* `file_url` (`TEXT`, `NULLABLE`)
* `snapshot_hash_sha256` (`CHAR(64)`, `NULLABLE`)
* `file_checksum_sha256` (`CHAR(64)`, `NULLABLE`)
* `total_gross` / `total_employee_bpjs` / `total_employer_bpjs` / `total_pph21` / `total_net` (`NUMERIC(18, 2)`, default 0)
* `headcount` (`INTEGER`, default 0)
* `reconciliation_delta` (`NUMERIC(18, 2)`, default 0) — harus 0.00 untuk laporan final
* `totals` (`JSONB`, `NOT NULL`, default `{}`) — breakdown tambahan
* `generated_by` / `generated_at` (`UUID` / `TIMESTAMPTZ`)
* `error_message` (`TEXT`, `NULLABLE`)
* `supersedes_id` (`UUID`, `NULLABLE`)

* *Constraint:* `UNIQUE (tenant_id, report_type, branch_id, period_start, period_end, version)`; `CHECK (status <> 'READY' OR (file_url IS NOT NULL AND file_checksum_sha256 IS NOT NULL AND snapshot_hash_sha256 IS NOT NULL))`; regenerate membuat baris baru, bukan menimpa.

#### 8. `payroll.tax_reconciliations`

* `id` (`UUID`, PK)
* `tenant_id` (`UUID`, `NOT NULL`)
* `personnel_id` (`UUID`, FK)
* `tax_year` (`SMALLINT`, `NOT NULL`)
* `policy_version_id` (`UUID`, `NOT NULL`)
* `annual_gross` / `ptkp_amount` / `biaya_jabatan` / `deductible_contributions` (`NUMERIC(18, 2)`)
* `annual_tax` / `ter_credits` / `difference` (`NUMERIC(18, 2)`)
* `status` (`VARCHAR(16)`) — `DRAFT`, `POSTED`, `VOID`
* `version` (`SMALLINT`, `DEFAULT 1`, `NOT NULL`)
* `settlement_batch_id` / `settlement_item_id` (`UUID`, `NULLABLE`) — tautan ke payroll batch/item tempat selisih diposting
* `posted_by` (`UUID`, `NULLABLE`)
* `posted_at` (`TIMESTAMPTZ`, `NULLABLE`)
* `created_by` (`UUID`, `NOT NULL`)

* *Constraint:* `UNIQUE (tenant_id, personnel_id, tax_year, version)`; partial unique `(tenant_id, personnel_id, tax_year) WHERE status = 'POSTED'`; `difference = annual_tax - ter_credits`; `CHECK (posted_by IS NULL OR posted_by <> created_by)` (SoD).

#### 9. `payroll.payments`

State machine pembayaran per item, terpisah dari batch, agar retry dan partial failure tidak silently skipped.

* `id` (`UUID`, PK)
* `tenant_id` (`UUID`, `NOT NULL`)
* `batch_id` (`UUID`, FK ke `payroll.batches.id`)
* `personnel_id` (`UUID`, FK ke `payroll.personnel.id`)
* `policy_version_id` (`UUID`, `NOT NULL`)
* `provider` (`VARCHAR(24)`, `NOT NULL`) — `MOCK`, `XENDIT`, `MIDTRANS`
* `provider_reference` (`VARCHAR(80)`, `NULLABLE`)
* `amount` (`NUMERIC(18, 2)`, `NOT NULL`)
* `status` (`VARCHAR(16)`, `NOT NULL`) — `PENDING`, `PROCESSING`, `PAID`, `FAILED`, `REVERSED`
* `idempotency_key` (`VARCHAR(64)`, `NOT NULL`)
* `attempt_no` (`SMALLINT`, `DEFAULT 1`, `NOT NULL`)
* `requested_by` / `approved_by` (`UUID`, `NOT NULL`)
* `requested_at` / `paid_at` (`TIMESTAMPTZ`)
* `failure_reason` (`TEXT`, `NULLABLE`) — tanpa PII

* *Constraint:* `UNIQUE (tenant_id, batch_id, personnel_id, attempt_no)`, `UNIQUE (tenant_id, idempotency_key)`, partial unique `(tenant_id, batch_id, personnel_id) WHERE status IN ('PENDING','PROCESSING','PAID')`, `CHECK (amount >= 0)`; index `(tenant_id, status, requested_at)` untuk rekonsiliasi. `payroll.items.payment_status` adalah denormalisasi dari baris terbaru di tabel ini.

### D. Skema `analytics` (Intelijen MIS, Deteksi Anomali & Simulasi *What-If*)

#### 1. `analytics.anomaly_flags`

* `id` (`UUID`, PK)

* `claim_id` (`UUID`, `NOT NULL`)

* `matched_personnel_id` (`UUID`, `NULLABLE`) — diisi untuk konflik yang melibatkan personel
* `matched_claim_id` (`UUID`, `NULLABLE`) — diisi untuk konflik antar-klaim (`MULTI_CLAIM_SAME_ACCOUNT`)

* `conflict_type` (`VARCHAR(32)`, `NOT NULL`) — `SHARED_BANK_ACCOUNT`, `SHARED_NIK_IDENTITY`, `MULTI_CLAIM_SAME_ACCOUNT`

* `severity` (`VARCHAR(16)`, `NOT NULL`) — `HIGH`, `CRITICAL`

* `evidence_summary` (`JSONB`, `NOT NULL`)

* `resolution_status` (`VARCHAR(20)`, `DEFAULT 'OPEN'`, `NOT NULL`) — `OPEN`, `CONFIRMED_FRAUD`, `FALSE_POSITIVE`

* `resolved_by` (`UUID`, `NULLABLE`)

* `detected_at` (`TIMESTAMPTZ`, `DEFAULT NOW()`)

* *Constraint:* `CHECK (matched_personnel_id IS NOT NULL OR matched_claim_id IS NOT NULL)`; partial unique index `(tenant_id, claim_id, matched_personnel_id, conflict_type) WHERE matched_personnel_id IS NOT NULL`; partial unique index `(tenant_id, claim_id, matched_claim_id, conflict_type) WHERE matched_claim_id IS NOT NULL` agar pemindaian ulang asinkron tetap idempoten.

#### 2. `analytics.what_if_simulations`

* `id` (`UUID`, PK)

* `simulation_name` (`VARCHAR(120)`, `NOT NULL`)

* `base_policy_version_id` (`UUID`, `NOT NULL`)

* `simulated_rules_payload` (`JSONB`, `NOT NULL`)

* `target_period_start` (`DATE`, `NOT NULL`)

* `target_period_end` (`DATE`, `NOT NULL`)

* `actual_total_cost` (`NUMERIC(18, 2)`, `NOT NULL`)

* `simulated_total_cost` (`NUMERIC(18, 2)`, `NOT NULL`)

* `variance_amount` (`NUMERIC(18, 2)`, `NOT NULL`)

* `variance_percentage` (`NUMERIC(7, 4)`, `NOT NULL`)

* `impact_breakdown` (`JSONB`, `NOT NULL`) — Perbandingan per cabang dan jumlah pengajuan yang berubah status.

* `created_by` (`UUID`, `NOT NULL`)

* `created_at` (`TIMESTAMPTZ`, `DEFAULT NOW()`)

#### 3. `analytics.mis_monthly_kpi` (*Materialized View*)

Menggabungkan data agregasi klaim dan *payroll* per cabang dan per bulan agar dasbor MIS Analyst terbuka dalam hitungan milidetik tanpa menjalankan `JOIN` berat secara langsung setiap kali halaman dibuka.

* Wajib memiliki kolom `tenant_id` dan unique index `(tenant_id, branch_id, report_month)` agar `REFRESH ... CONCURRENTLY` bekerja.
* Materialized view **tidak mendukung RLS**. Karena itu, akses GraphQL/worker hanya melalui `analytics.v_mis_monthly_kpi`, sebuah view `SECURITY BARRIER` yang memfilter `tenant_id = current_setting('app.tenant_id', true)::uuid`. Dilarang membaca MV langsung dari endpoint publik.
* Refresh dikoalesikan per tenant (debounce minimal 5 menit) agar tidak membebani Neon/QStash; lihat `docs/09`.

## 4. Strategi *Indexing* & *Advanced Querying* PostgreSQL

Untuk memenuhi standar performa sistem berbeban tinggi dan mengoptimalkan komputasi di atas Neon PostgreSQL, agen wajib mengimplementasikan indeks dan pola kueri berikut:

### A. Peta Indeks Strategis

> **Aturan tenant:** seluruh index komposit pada tabel tenant-scoped diawali `tenant_id` (misalnya `(tenant_id, branch_id, status, created_at DESC)`). Index tanpa `tenant_id` dianggap cacat desain karena tidak mendukung query RLS.

| Nama Indeks | Tabel & Kolom | Tipe Indeks | Alasan Optimasi | 
| ----- | ----- | ----- | ----- | 
| `idx_policy_active_domain` | `governance.policy_versions (tenant_id, domain) WHERE status = 'ACTIVE'` | **Partial Unique Index** | Menjamin hanya 1 kebijakan aktif per tenant per domain dan mempercepat lookup aturan aktif dalam $O(1)$. | 
| `idx_claims_branch_status_date` | `claims.submissions (tenant_id, branch_id, status, created_at DESC)` | **Composite B-Tree** | Mengeliminasi *Sequential Scan* saat *Branch Manager* memfilter antrean klaim di cabangnya. | 
| `idx_claims_pending_approval` | `claims.submissions (tenant_id, created_at ASC) WHERE status IN ('SUBMITTED', 'UNDER_REVIEW', 'ESCALATED')` | **Partial B-Tree** | Mengindeks khusus klaim aktif saja (sekitar 5-10% dari total data historis), menghemat ruang penyimpanan Neon secara drastis. | 
| `idx_claims_conflict_lookup` | `claims.submissions (tenant_id, bank_account_hash, claimant_nik_hash)` | **Composite Hash/B-Tree** | Mempercepat pencocokan silang (*cross-domain join*) antara pengajuan klaim baru dan tabel `payroll.personnel`. | 
| `idx_payroll_items_batch_cover` | `payroll.items (tenant_id, batch_id) INCLUDE (net_take_home_pay, pph21_tax_deduction, payment_status)` | **Covering Index** | Memungkinkan PostgreSQL menghitung total rekap *batch* langsung dari indeks (*Index-Only Scan*) tanpa menyentuh blok tabel utama. | 
| `idx_policy_rules_gin` | `governance.policy_versions USING GIN (rules_payload jsonb_path_ops)` | **GIN Index** | Mempercepat pencarian parameter spesifik di dalam struktur kebijakan JSONB saat simulasi *What-If*. | 
| `idx_audit_tenant_recorded` | `governance.audit_logs (tenant_id, recorded_at DESC, id DESC)` | **Composite B-Tree** | Keyset pagination audit per tenant. |
| `idx_attendance_tenant_period` | `payroll.attendance_summaries (tenant_id, period_month, personnel_id)` | **Composite B-Tree** | Rekap absensi per periode. |
| `idx_payslips_tenant_personnel` | `payroll.payslips (tenant_id, personnel_id, period_month DESC)` | **Composite B-Tree** | Riwayat payslip per karyawan. |
| `idx_tax_reports_tenant_type` | `payroll.tax_reports (tenant_id, report_type, period_start DESC)` | **Composite B-Tree** | Daftar laporan & cegah duplikasi. |
| `idx_claim_disbursements_tenant_status` | `claims.disbursements (tenant_id, status, requested_at)` | **Partial B-Tree** `WHERE status IN ('PENDING','PROCESSING')` | Antrean pencairan aktif. |
| `idx_payroll_payment_pending` | `payroll.items (tenant_id, batch_id) WHERE payment_status IN ('PENDING','PROCESSING')` | **Partial B-Tree** | Rekonsiliasi pembayaran tertunda. |

### B. Pola *Advanced Querying* Wajib (CTE, Window Functions & Materialized View)

1. **Deteksi Lonjakan Beban *Payroll* & Klaim Lintas Bulan (*Window Functions*):**
   Layanan MIS Analytics menggunakan `Common Table Expressions (CTE)` digabung dengan fungsi jendela `LAG()` dan `SUM() OVER (PARTITION BY branch_id ORDER BY month)` untuk menghitung rasio pertumbuhan pengeluaran cabang dari bulan ke bulan (*Month-over-Month Variance*) serta tingkat penyerapan pagu anggaran cabang secara kumulatif.

2. **Pembaruan *Materialized View* Tanpa Mengunci Bacaan:**
   `analytics.mis_monthly_kpi` wajib memiliki `UNIQUE INDEX` pada kombinasi `(tenant_id, branch_id, report_month)` agar `analytics-worker-go` dapat mengeksekusi `REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mis_monthly_kpi;` setelah setiap persetujuan klaim atau pencairan *payroll* tanpa memblokir pengguna yang sedang membaca dasbor.

3. **Target Kinerja Kueri:**
   Setiap kueri analitik di `analytics` dan daftar paginasi di `claims`/`payroll` wajib menggunakan *keyset/cursor pagination* (berbasis `created_at, id`) dan diuji dengan `EXPLAIN (ANALYZE, BUFFERS)` agar tidak memunculkan `Seq Scan` pada tabel dengan lebih dari $10.000$ baris.

## 5. Penegakan Integritas Transaksi & Anti-Duplikasi

### A. Perlindungan *Immutable Audit Trail* (Database Trigger)

**Kepemilikan (ADR-004):** `governance-service` memiliki skema, migrasi, API baca, dan job verifikasi. Role aplikasi (`aletheia_app`) hanya memiliki izin `EXECUTE` pada `governance.append_audit_log()`; tidak ada `INSERT` langsung ke `governance.audit_logs`. Layanan klaim/payroll menulis audit melalui fungsi tersebut di dalam transaksi yang sama. Ini menyelesaikan konflik antara "hanya governance yang menulis" dan "audit harus atomic dengan transaksi".

**Hash chain per tenant:** `record_hash = SHA256(canonical_row + prev_record_hash)`. Fungsi `append_audit_log()` mengambil `pg_advisory_xact_lock(hashtext(tenant_id::text))` sebelum membaca `prev_record_hash`, sehingga tidak ada fork chain meskipun banyak instance menulis bersamaan.

Agen wajib menyertakan fungsi pemicu PostgreSQL berikut di dalam skrip migrasi awal agar perlindungan buku besar audit ditegakkan di level mesin database:

```
CREATE OR REPLACE FUNCTION governance.prevent_audit_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'SECURITY_VIOLATION: Records in governance.audit_logs are immutable and cannot be updated or deleted.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_immutable_audit_logs
BEFORE UPDATE OR DELETE ON governance.audit_logs
FOR EACH ROW EXECUTE FUNCTION governance.prevent_audit_mutation();

```

**Aturan tambahan:** `REVOKE INSERT, UPDATE, DELETE ON governance.audit_logs FROM aletheia_app;` dan `GRANT EXECUTE ON FUNCTION governance.append_audit_log(...) TO aletheia_app;`. Fungsi wajib `SECURITY DEFINER` dengan `search_path` tetap, memaksa `tenant_id` dari argumen tervalidasi, menghitung `record_hash` dari canonical JSON (RFC 8785) kolom kecuali `record_hash`, dan memakai genesis hash `repeat('0', 64)` untuk baris pertama. Actor sistem memakai UUID `SYSTEM_ACTOR` yang terdokumentasi. Job verifikasi harian menghitung ulang chain per tenant dan memicu alert `audit_chain_broken` jika ada gap. Backup/PITR diuji minimal sekali per fase.

### B. Penguncian Konkurensi & *Idempotency* Pencairan

1. **Persetujuan Klaim (`claims.submissions`):** Saat *Manager* menekan tombol *Approve*, transaksi SQL wajib mengunci baris klaim menggunakan `SELECT ... FROM claims.submissions WHERE id = $1 FOR UPDATE NOWAIT`. Jika dua manajer mencoba menyetujui klaim yang sama pada milidetik yang sama, permintaan kedua langsung ditolak dengan status konflik (`409 Conflict`).

2. **Pencairan Massal *Payroll* (`payroll.payments`):** Pekerja Go tidak memakai `ON CONFLICT DO NOTHING` untuk payment. Untuk setiap item, ia membuat baris `payroll.payments` dengan `attempt_no` baru dan melakukan transisi kondisional `UPDATE ... SET status = 'PROCESSING' WHERE status IN ('PENDING','FAILED')`. Unique `(tenant_id, batch_id, personnel_id, attempt_no)` dan `(tenant_id, idempotency_key)` mencegah duplikasi; retry webhook QStash hanya memproses baris yang belum terminal. Batch tidak boleh menjadi `DISBURSED` jika ada item `FAILED`; gunakan `PARTIAL` dan daftar gagal eksplisit.

## 6. Batasan Keras Basis Data untuk Agen OpenCode

> **Instruksi Wajib bagi Seluruh Agen Pengembangan:**
>
> 1. **Tipe Data Keuangan Mutlak:** Dilarang keras menggunakan tipe `FLOAT`, `REAL`, atau `DOUBLE PRECISION` untuk kolom nominal uang, tarif pajak, atau persentase iuran. Wajib menggunakan `NUMERIC(18, 2)` untuk mata uang dan `NUMERIC(7, 4)` untuk persentase.
>
> 2. **Larangan `OFFSET` Pagination pada Tabel Transaksi:** Jangan pernah menggunakan `LIMIT ... OFFSET ...` untuk daftar klaim, item *payroll*, maupun log audit karena performanya menurun linear pada halaman besar. Gunakan *cursor-based pagination* `(created_at, id)`.
>
> 3. **Privasi Data Sensitif (PII):** Nomor Induk Kependudukan (NIK) dan nomor rekening bank tidak boleh disimpan dalam bentuk teks terang (*plaintext*) yang dapat dibaca langsung oleh kueri analitik. Simpan versi tersamar (`*_masked`) untuk tampilan UI dan hash SHA-256 berlapis *server-side pepper* (`*_hash`) untuk pencocokan anomali lintas-domain.
>
> 4. **Transaksi Atomik untuk Mutasi + Audit:** Setiap operasi perubahan status penting (penerbitan kebijakan, persetujuan klaim, persetujuan *batch payroll*) wajib menulis catatan ke `governance.audit_logs` di dalam blok transaksi yang sama (`BEGIN ... COMMIT`) melalui fungsi `governance.append_audit_log()`. Pola *Transactional Outbox* hanya boleh untuk event non-audit; audit tidak boleh ditunda.
>
> 5. **Tenant Wajib:** Setiap tabel tenant-scoped memiliki `tenant_id`, RLS aktif, dan unique constraint yang menyertakan `tenant_id`. Query tanpa `tenant_id` dianggap bug keamanan.
>
> 6. **UUIDv7 untuk PK:** Dilarang memakai `gen_random_uuid()` untuk primary key yang mengandalkan urutan waktu. Gunakan UUIDv7 yang dibuat aplikasi (TS/Go); `uuidv7()` belum tersedia di PostgreSQL 16/Neon.
>
> 7. **Audit Append-Only:** Role aplikasi hanya memiliki `EXECUTE` pada `governance.append_audit_log()`; tidak ada `INSERT`/`UPDATE`/`DELETE` langsung ke `governance.audit_logs`. Hash chain diserialisasi per tenant dengan advisory lock.
>
> 8. **Laporan Immutable:** Payslip dan laporan pajak/BPJS tidak boleh ditimpa. Regenerate membuat baris baru (`version + 1`, `supersedes_id`); `snapshot_hash` sama untuk data yang sama, `file_checksum` baru. Data bulanan tidak boleh diubah oleh rekonsiliasi tahunan.