# `03-api-and-graphql-contracts.md` — Kontrak Komunikasi REST, GraphQL & Strategi *Caching* Aletheia

* **Nama Sistem:** Aletheia (*Enterprise Disbursement Governance & MIS Intelligence Platform*)

* **Status Dokumen:** Spesifikasi Antarmuka & Kontrak Data (*Single Source of Truth* untuk Agen OpenCode)

* **Gerbang Utama:** Cloudflare Workers (Hono + GraphQL Yoga)

* **Layanan Backend:** Express.js (TypeScript + Zod Validation) & Go Worker

* **Lapisan Cache & State Cepat:** Upstash Redis (REST API)

## 1. Paradigma *Hybrid API* (REST vs GraphQL)

Aletheia memisahkan protokol komunikasi berdasarkan karakteristik beban kerja guna memaksimalkan keamanan mutasi finansial sekaligus efisiensi pembacaan analitik lintas-layanan:

| Protokol | Jalur & Peruntukan | Alasan Arsitektural | 
| ----- | ----- | ----- | 
| **RESTful API** | Seluruh operasi mutasi (`POST`, `PUT`, `PATCH`), pembuatan *upload signature* Cloudinary, autentikasi, pemrosesan *webhook* QStash, dan komunikasi sinkron antar-microservice. | Memudahkan penegakan *idempotency key*, kontrol *HTTP status code* yang eksplisit, validasi skema input ketat, serta *rate limiting* per titik akhir (*endpoint*). | 
| **GraphQL (BFF)** | Pembacaan agregat untuk **Dasbor MIS Analyst**, **Tampilan Audit Klaim 360 Derajat**, dan **Perbandingan Simulasi *What-If*** di lapisan Cloudflare Workers. | Menggabungkan data dari 3–4 layanan berbeda (`Governance`, `Claims`, `Payroll`, `Analytics`) dalam satu permintaan tunggal sehingga antarmuka React terhindar dari *over-fetching* dan *under-fetching*. | 

## 2. Keamanan Gerbang *Edge*, *Header* Konteks & *Rate Limiting*

### A. Protokol *Zero-Trust Internal* (`Edge -> Microservices`)

Setiap permintaan klien wajib melewati Cloudflare Workers. Setelah memverifikasi tanda tangan token JWT (`Authorization: Bearer <token>`), *Edge Worker* menyuntikkan *header* identitas terstandar ke layanan Express.js di belakangnya:

* `X-Correlation-Id`: UUIDv4 unik per permintaan untuk pelacakan log lintas-layanan.

* `X-User-Id`: UUID pengguna terautentikasi.

* `X-User-Role`: Peran pengguna (`CLAIMS_OFFICER`, `HR_SPECIALIST`, `BRANCH_MANAGER`, `FINANCE_MANAGER`, `MIS_ANALYST`, `COMPLIANCE_ADMIN`).

* `X-Branch-Id`: UUID cabang tempat pengguna bertugas.

* `X-Tenant-Id`: UUID tenant dari token terverifikasi. Wajib ada dan tidak boleh berasal dari body/query.

* `X-Gateway-Timestamp`: *Unix timestamp* dalam milidetik.

* `X-Request-Method` / `X-Request-Path`: method dan path yang ditandatangani, mencegah replay ke endpoint lain.

* `X-Body-Sha256`: SHA-256 dari body mentah (string kosong untuk GET), mencegah replay body berbeda.

* `X-Gateway-Signature`: Tanda tangan `HMAC-SHA256` dari `method + ":" + path + ":" + bodySha256 + ":" + userId + ":" + role + ":" + branchId + ":" + tenantId + ":" + timestamp` menggunakan `INTERNAL_GATEWAY_SECRET`. Layanan Express.js wajib menolak permintaan dengan `401 Unauthorized` jika tanda tangan tidak valid atau selisih waktu melebihi $30\text{ detik}$.

### B. Kebijakan *Sliding-Window Rate Limiting* (Upstash Redis)

Untuk melindungi kuota *free-tier* Neon dan kontainer backend, Cloudflare Workers menerapkan pembatasan laju permintaan berbasis Upstash Redis:

* **Endpoint Autentikasi (`/api/v1/auth/login`):** Maksimal $10\text{ permintaan/menit}$ per alamat IP.

* **Endpoint Mutasi Transaksional (`POST/PATCH` Klaim & Payroll):** Maksimal $30\text{ permintaan/menit}$ per `X-User-Id`.

* **Endpoint GraphQL & Eksekusi Simulasi *What-If*:** Maksimal $20\text{ permintaan/menit}$ per `X-User-Id`.

* **Endpoint Generate Laporan/Payslip/Rekonsiliasi:** Maksimal $10\text{ permintaan/menit}$ per `X-User-Id`; unduhan signed URL maksimal $30\text{ permintaan/menit}$.

## 3. Standar Amplop Respons & Kode Kesalahan RESTful API

Seluruh layanan Express.js wajib mengembalikan respons JSON dengan struktur seragam yang didefinisikan di `packages/shared-contracts`:

```
{
  "success": true,
  "correlation_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "data": {},
  "meta": {
    "next_cursor": "2026-11-25T03:15:00.000Z_019361a2",
    "has_more": true
  },
  "error": null
}

```

Jika terjadi kegagalan, `data` bernilai `null` dan `error` diisi dengan kode deterministik berikut agar antarmuka React dapat menampilkan pesan kontekstual:

| HTTP Status | Kode Kesalahan (`error.code`) | Kondisi Pemicu | 
| ----- | ----- | ----- | 
| `400` | `ERR_VALIDATION_FAILED` | Input tidak lolos validasi skema Zod (disertai array `details` per bidang). | 
| `401` | `ERR_UNAUTHORIZED_ACCESS` | Token JWT kedaluwarsa atau tanda tangan internal gateway tidak sah. | 
| `403` | `ERR_RBAC_FORBIDDEN` | Peran pengguna tidak memiliki izin mengakses titik akhir atau cabang terkait. | 
| `403` | `ERR_SOD_VIOLATION` | Pelanggaran *Segregation of Duties*: pengguna mencoba menyetujui pengajuan yang ia buat sendiri (*Maker == Approver*). | 
| `409` | `ERR_IDEMPOTENCY_CONFLICT` | Permintaan dengan `Idempotency-Key` yang sama sedang diproses atau transaksi sudah pernah dieksekusi. | 
| `409` | `ERR_CONCURRENT_LOCK` | Baris transaksi sedang dikunci oleh transaksi lain (`FOR UPDATE NOWAIT`). |
| `409` | `ERR_RISK_PENDING` | Klaim belum selesai dievaluasi (`risk_evaluated_at` NULL); approval ditolak sampai evaluasi selesai. |
| `409` | `ERR_COMPLIANCE_REVIEW_PENDING` | Klaim `CRITICAL` belum direview `COMPLIANCE_ADMIN`; approval transaksi ditolak. | 
| `422` | `ERR_POLICY_RULE_VIOLATION` | Pengajuan melanggar aturan pada versi kebijakan aktif (misal: nominal melebihi batas kewenangan jenjang *approver*). | 
| `404` | `ERR_NOT_FOUND` | Resource tidak ada **atau** berada di tenant lain (jangan membocorkan keberadaan). |
| `409` | `ERR_PAYMENT_STATE_CONFLICT` | Pencairan diminta saat status payment tidak valid (misalnya sudah `PAID`/`REVERSED`). |
| `424` | `ERR_PAYMENT_PROVIDER_FAILED` | Provider pembayaran menolak/gagal; sertakan referensi yang aman. |
| `409` | `ERR_REPORT_NOT_READY` | Laporan masih `QUEUED`/`GENERATING`; sertakan `Retry-After`. |
| `422` | `ERR_REPORT_GENERATION_FAILED` | Laporan gagal dibuat; tidak ada file setengah jadi. |
| `429` | `ERR_RATE_LIMIT_EXCEEDED` | Kuota permintaan per menit terlampaui (menyertakan header `Retry-After`). | 

## 4. Kontrak Titik Akhir (*Endpoints*) RESTful API Inti

Seluruh skema *request body* dan *response payload* wajib ditulis menggunakan **Zod** di dalam `packages/shared-contracts` sehingga tipe TypeScript otomatis terbaca oleh frontend, edge gateway, dan backend.

### A. Domain 1: Governance & Policy Service (`governance-service`)

* `POST /api/v1/auth/login` — Autentikasi email & kata sandi; menerima `mfa_code` opsional bila pengguna sudah enrollment; mengembalikan `access_token` (JWT, TTL 15 menit) dan `refresh_token` (`HttpOnly` cookie, TTL 7 hari).

* `POST /api/v1/auth/refresh` — Rotasi token akses baru dan refresh token; reuse mencabut seluruh family.
* `POST /api/v1/auth/logout` — Mencabut seluruh family refresh token dan menghapus cookie.

* `POST /api/v1/auth/mfa/enroll` — Mulai enrollment TOTP; mengembalikan secret + recovery codes (sekali).
* `POST /api/v1/auth/mfa/verify` — Mengaktifkan MFA setelah kode TOTP valid; login berikutnya wajib menyertakan `mfa_code`.
* `POST /api/v1/auth/mfa/recovery` — Gunakan recovery code sekali pakai; audit dan cabut family jika mencurigakan.

* `GET /api/v1/policies` — Daftar versi kebijakan beserta status (`DRAFT`, `ACTIVE`, `ARCHIVED`).

* `GET /api/v1/policies/active/:domain` — Mengambil kebijakan aktif untuk domain `CLAIMS_POLICY` atau `PAYROLL_TAX_POLICY`.

* `POST /api/v1/policies` — Membuat draf versi kebijakan baru (khusus `COMPLIANCE_ADMIN`).

* `POST /api/v1/policies/:id/approve` — Checker kedua menyetujui draf (bukan pembuat draf); wajib berbeda `published_by`.

* `POST /api/v1/policies/:id/publish` — Mengaktifkan versi kebijakan baru dan otomatis mengarsipkan versi aktif sebelumnya dalam satu transaksi atomik. Hanya setelah `approved_by` terisi dan berbeda dari pembuat draf.

* `GET /api/v1/audit-logs` — Membaca catatan *immutable audit trail* dengan *cursor pagination* dan filter (`domain`, `entity_id`, `actor_id`, rentang tanggal).

### B. Domain 2: Claims Operations Service (`claims-service`)

* `POST /api/v1/claims/upload-signature` — Menghasilkan parameter tanda tangan unggah langsung ke Cloudinary (`folder`, `timestamp`, `signature`, `api_key`) dengan batas ukuran maksimal $5\text{ MB}$.

* `POST /api/v1/claims` — Membuat draf klaim baru (`DRAFT`; wajib `Idempotency-Key`). Mengikat otomatis `policy_version_id` yang aktif.
* `PATCH /api/v1/claims/:id` — Revisi klaim `DRAFT`/`RETURNED`; hanya maker; audit before/after.
* `POST /api/v1/claims/:id/submit` — Submit klaim; validasi dokumen wajib; status `RISK_PENDING` dan event `CLAIM_SUBMITTED_EVALUATE` ke QStash.

* `GET /api/v1/claims` — Daftar klaim dengan *cursor pagination* dan filter (`branch_id`, `status`, `has_conflict_flag`).

* `POST /api/v1/claims/:id/decide` — Keputusan persetujuan berjenjang oleh *Branch/Finance Manager*.

  * *Payload:* `{ "decision": "APPROVED" | "REJECTED" | "RETURNED", "approved_amount": "5000000.00", "reason_notes": "..." }`

  * *Aturan:* Wajib menyertakan `Idempotency-Key`, menegakkan `approver_id !== created_by`, memverifikasi batas kewenangan nominal pada `policy_version_id` yang terikat, menolak `approved_amount > requested_amount` dengan `422 ERR_POLICY_RULE_VIOLATION`, dan menolak keputusan jika `risk_evaluated_at IS NULL` dengan `409 ERR_RISK_PENDING`.
  * Maker yang mencoba memutuskan klaimnya sendiri menerima `403 ERR_SOD_VIOLATION` sebelum aturan status dievaluasi.
  * `RETURNED` mengubah status menjadi `RETURNED`; maker wajib memakai `PATCH /claims/:id` lalu `POST /claims/:id/submit` untuk mengajukan ulang. Setiap transisi diaudit; tidak ada edit setelah `APPROVED`.

* `POST /api/v1/claims/:id/compliance-review` — `COMPLIANCE_ADMIN`; mencatat resolusi `FALSE_POSITIVE` atau `CONFIRMED_FRAUD` untuk flag konflik. `CONFIRMED_FRAUD` menutup klaim sebagai `REJECTED`; `FALSE_POSITIVE` mengembalikan klaim ke jalur eskalasi. Review bukan approval transaksi.

### C. Domain 3: Payroll & Incentive Service (`payroll-service`)

* `GET /api/v1/employees` — Daftar karyawan dan agen terdaftar per cabang; filter `personnel_type`, `status`.
* `POST /api/v1/employees` — Registrasi data master karyawan atau agen baru (mengenkripsi/melakukan hashing NIK & nomor rekening sebelum disimpan).
* `/api/v1/personnel` adalah alias deprecated untuk `/employees`; jangan menambah kontrak baru di sana.

* `GET /api/v1/payroll/branches` — Daftar cabang tenant untuk form batch dan filter antarmuka. Akses HR, Finance, Compliance, dan MIS.
* `POST /api/v1/payroll/batches` — Menginisiasi periode penggajian baru (`period_month`, `branch_id`) yang terikat pada `PAYROLL_TAX_POLICY` aktif.

* `POST /api/v1/payroll/batches/:id/calculate` — Menerbitkan satu pesan *coarse-grained* ke Upstash QStash agar `analytics-worker-go` menghitung gaji, komisi agen, potongan BPJS, dan PPh 21 secara paralel.

* `POST /api/v1/payroll/batches/:id/approve` — Persetujuan final oleh `FINANCE_MANAGER`; menegakkan `approved_by !== created_by`, mencatat `approved_at`, dan mengubah status ke `APPROVED`. Wajib `Idempotency-Key`; hanya dari status `READY_FOR_APPROVAL`.

* `POST /api/v1/payroll/batches/:id/disburse` — Hanya untuk batch `APPROVED`; eksekusi pencairan massal idempoten per item melalui `packages/payments`. Wajib `Idempotency-Key`; status batch menjadi `DISBURSED` hanya jika semua payment terminal `PAID` (atau `PARTIAL` dengan daftar gagal).

### D. Domain 4: HRIS-lite, Payslip, Reporting & Disbursement

Semua endpoint di bawah memerlukan `tenant_id` dari token, RBAC, dan audit. Mutasi finansial memerlukan `Idempotency-Key`.

#### D.1 Employee & attendance

* `GET /api/v1/employees` — daftar karyawan/agen; filter `branch_id`, `personnel_type`, `status`; cursor pagination.
* `POST /api/v1/employees` — registrasi; NIK/rekening di-hash + masked; khusus `HR_SPECIALIST`.
* `PATCH /api/v1/employees/:id` — ubah profil/kompensasi; audit before/after.
* `GET /api/v1/attendance?period=YYYY-MM` — ringkasan absensi per personel.
* `PUT /api/v1/attendance/:personnelId/:period` — upsert ringkasan (hari kerja, cuti, lembur); khusus HR.
* `GET /api/v1/sales-achievements?period=YYYY-MM` — daftar `verified_sales` agen.
* `PUT /api/v1/sales-achievements/:personnelId/:period` — upsert + verifikasi sales; khusus HR/Finance; audit.
* `GET /api/v1/leave-requests` — daftar cuti; filter status/personel.
* `POST /api/v1/leave-requests` — ajukan cuti.
* `POST /api/v1/leave-requests/:id/decide` — approve/reject; `decided_by !== personnel_id` (SoD).

#### D.2 Payslip

* `POST /api/v1/payroll/batches/:id/payslips` — generate payslip untuk batch `APPROVED`/`DISBURSED`; idempotent per batch/personel.
* `GET /api/v1/payslips?period=YYYY-MM&personnel_id=...` — daftar payslip; HR melihat tenant, karyawan hanya miliknya.
* `GET /api/v1/payslips/:id` — metadata + signed URL berdurasi pendek.
* `GET /api/v1/payslips/:id/download` — unduh PDF; audit akses.

#### D.3 Reports

* `GET /api/v1/reports?type=PPH21_MONTHLY&period=YYYY-MM` — daftar laporan + status.
* `POST /api/v1/reports` — generate laporan (`PPH21_MONTHLY`, `PPH21_ANNUAL`, `BPJS_MONTHLY`, `BANK_FILE`, `PAYROLL_VARIANCE`); body: `report_type`, `period_start`, `period_end`, `branch_id?`.
* `GET /api/v1/reports/:id` — metadata + checksum + status.
* `GET /api/v1/payslips/:id/download` — tautan bertanda tangan berumur pendek; audit `PAYSLIP_DOWNLOADED`.
* `GET /api/v1/reports/:id/download` — tautan bertanda tangan berumur pendek; 409 `ERR_REPORT_NOT_READY` jika belum siap; audit `REPORT_DOWNLOADED`.
* `GET /api/v1/payroll-files/:token` — penyajian berkas dengan token HMAC; tanpa JWT pengguna.
* `POST /api/v1/payroll/reconciliations` — hitung rekonsiliasi PPh 21 tahunan menjadi `DRAFT`; khusus HR dan Finance.
* `POST /api/v1/payroll/reconciliations/:id/post` — posting oleh Finance; pembuat rekonsiliasi tidak boleh memposting.
* `GET /api/v1/payroll/reconciliations?tax_year=YYYY` — daftar hasil.

#### D.4 Disbursement

* `POST /api/v1/claims/:id/disburse` — `FINANCE_MANAGER`; hanya klaim `APPROVED`; body `{ "provider": "MOCK" | "XENDIT" | "MIDTRANS" }`; wajib `Idempotency-Key`; status klaim berubah ke `DISBURSED` hanya setelah payment `PAID`; partial unique mencegah payment aktif kedua.
* `POST /api/v1/payroll/batches/:id/disburse` — sudah ada; kini memakai `packages/payments`.
* `GET /api/v1/claims/payments/:id` — status payment klaim (tenant-scoped).
* `GET /api/v1/payroll/payments/:id` — status payment payroll (tenant-scoped).
* `POST /api/v1/payroll/payments/:id/reverse` — reversal payment `PAID` oleh Finance; alasan wajib; audit dan sinkronisasi status batch.
* `POST /api/v1/payroll/batches/:id/retry` — retry item `FAILED` atau `REVERSED` pada batch `PARTIAL` atau `FAILED`; payment baru memakai `attempt_no` berikutnya.
* `POST /api/v1/claims/payments/webhook/:provider` — webhook provider/mock untuk klaim; verifikasi signature provider; idempotent; tanpa JWT pengguna.
* `POST /api/v1/payroll/payments/webhook/:provider` — webhook provider/mock untuk payroll; verifikasi signature provider; idempotent melalui `payroll.payment_webhook_events`; tanpa JWT pengguna.

### E. Domain 5: Async Worker Webhook (`analytics-worker-go`)

* `POST /internal/v1/qstash/consume` — Titik akhir tunggal penerima pesan dari Upstash QStash. Memverifikasi header `Upstash-Signature` dan mendistribusikan tugas berdasarkan `event_type`:

  * `CLAIM_SUBMITTED_EVALUATE`: Menghitung `risk_score` dan memindai benturan identitas/rekening lintas-domain.

  * `PAYROLL_BATCH_CALCULATE`: Menjalankan kalkulasi massal PPh 21, BPJS, dan komisi agen via *goroutine pool*.

  * `WHAT_IF_SIMULATION_RUN`: Mengeksekusi simulasi kebijakan pada data historis untuk *MIS Analyst*.

  * `MIS_VIEW_REFRESH`: Menjalankan `REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mis_monthly_kpi`.

  * `PAYSLIP_GENERATE`: Merender payslip dari `payroll.items.calculation_breakdown`, menyimpan PDF + checksum, lalu menandai siap.

  * `REPORT_GENERATE`: Menghasilkan PPh 21 bulanan/tahunan, BPJS, bank file, atau payroll variance; menyimpan metadata + checksum.

  * `PAYMENT_RECONCILE`: Merekonstruksi status payment tertunda dari provider/mock dan menandai `PAID`/`FAILED` secara idempotent.

  * `AUDIT_VERIFY`: Menghitung ulang hash chain per tenant dan menandai gap.

> **Implementasi M3.4:** payslip PDF dan laporan CSV disimpan pada `payroll.generated_files` agar demo gratis tidak bergantung pada Cloudinary. Pada produksi, tabel berkas dapat diganti object storage tanpa mengubah kontrak unduhan. Tautan berkas memakai HMAC `FILE_SIGNING_SECRET` dan berlaku 300 detik.

> **Implementasi M3.2:** `CLAIM_SUBMITTED_EVALUATE`, `PAYROLL_BATCH_CALCULATE`, `WHAT_IF_SIMULATION_RUN`, dan `MIS_VIEW_REFRESH` aktif. Empat event lainnya mengembalikan `500` dengan pesan belum diimplementasikan agar QStash tidak menandainya selesai secara palsu. Event type yang benar-benar tidak dikenal diakui `200` sebagai `ignored` untuk kompatibilitas maju.

## 5. Skema GraphQL BFF (`apps/edge-gateway/schema.graphql`)

Lapisan GraphQL di Cloudflare Workers melayani kebutuhan agregasi analitik dan tampilan audit terpadu tanpa mengekspos struktur tabel internal secara mentah. `misExecutiveSummary` hanya membaca `analytics.v_mis_monthly_kpi` (security barrier), bukan materialized view langsung, sehingga `tenant_id` selalu difilter.

```
scalar DateTime
scalar Decimal
scalar JSON

enum PolicyDomain {
  CLAIMS_POLICY
  PAYROLL_TAX_POLICY
}

type BranchKpiSummary {
  branchId: ID!
  branchCode: String!
  branchName: String!
  reportMonth: String!
  totalClaimsSubmitted: Int!
  totalClaimsApprovedAmount: Decimal!
  claimApprovalRatePct: Float!
  avgTurnaroundHours: Float!
  totalPayrollDisbursed: Decimal!
  totalPph21Collected: Decimal!
  budgetUtilizationPct: Float!
  momVariancePct: Float!
}

type AnomalyFlagView {
  id: ID!
  conflictType: String!
  severity: String!
  matchedPersonnelCode: String
  matchedPersonnelName: String
  matchedPersonnelType: String
  matchedClaimNumber: String
  evidenceSummary: JSON!
  resolutionStatus: String!
  detectedAt: DateTime!
}

type AuditTrailEntry {
  id: ID!
  actorName: String!
  actorRole: String!
  action: String!
  policyVersionTag: String
  decisionContext: JSON!
  recordHash: String!
  recordedAt: DateTime!
}

type ClaimAuditDetail {
  id: ID!
  claimNumber: String!
  claimantName: String!
  claimantNikMasked: String!
  bankAccountMasked: String!
  claimCategory: String!
  requestedAmount: Decimal!
  approvedAmount: Decimal
  riskScore: Int!
  status: String!
  boundPolicyVersionTag: String!
  boundPolicyRules: JSON!
  documents: [ClaimDocumentView!]!
  anomalyFlags: [AnomalyFlagView!]!
  auditHistory: [AuditTrailEntry!]!
}

type ClaimDocumentView {
  id: ID!
  documentType: String!
  secureUrl: String!
  uploadedAt: DateTime!
}

type WhatIfSimulationResult {
  id: ID!
  simulationName: String!
  basePolicyVersionTag: String!
  actualTotalCost: Decimal!
  simulatedTotalCost: Decimal!
  varianceAmount: Decimal!
  variancePercentage: Float!
  impactBreakdown: JSON!
  createdAt: DateTime!
}

input WhatIfSimulationInput {
  simulationName: String!
  basePolicyVersionId: ID!
  simulatedRulesPayload: JSON!
  targetPeriodStart: String!
  targetPeriodEnd: String!
  branchId: ID
}

type WhatIfRunResult {
  eventId: ID!
  status: String!
  enqueued: Boolean!
  requestedAt: DateTime!
}

type Query {
  # Dasbor Eksekutif MIS Analyst (membaca dari Materialized View + cache)
  misExecutiveSummary(
    reportMonth: String!
    branchId: ID
  ): [BranchKpiSummary!]!

  # Tren beberapa bulan dari security barrier yang sama
  misTrend(
    reportMonth: String!
    branchId: ID
    months: Int = 6
  ): [BranchKpiSummary!]!

  # Tampilan Audit 360 Derajat
  claimAuditDetail(claimId: ID!): ClaimAuditDetail

  # Riwayat eksperimen simulasi kebijakan MIS Analyst
  whatIfSimulations(limit: Int = 10): [WhatIfSimulationResult!]!
}

type Mutation {
  # Menjalankan simulasi read-only melalui QStash dan worker Go
  runWhatIfSimulation(input: WhatIfSimulationInput!): WhatIfRunResult!
}

```

### Pencegahan Masalah $N+1$ pada GraphQL BFF

* **Pembatasan Kedalaman Kueri (*Query Depth Limiting*):** Maksimal kedalaman kueri GraphQL dibatasi hingga $4\text{ tingkat}$ untuk mencegah serangan kueri bersarang.

* **Batching Lintas-Layanan:** Saat resolver `claimAuditDetail` atau `misExecutiveSummary` mengumpulkan metadata cabang dan versi kebijakan, Cloudflare Workers menggunakan pola *request-scoped DataLoader* untuk menggabungkan daftar ID unik menjadi satu panggilan internal (`POST /internal/v1/policies/batch-lookup`) alih-alih melakukan panggilan HTTP berulang per baris data.

> **Implementasi M4.1:** `misExecutiveSummary` dan `misTrend` membaca security barrier `analytics.v_mis_monthly_kpi` melalui governance service. Cache in-process berlaku 300 detik dengan header `x-cache`, dan endpoint `POST /api/v1/analytics/cache/invalidate` membersihkan cache tenant. `runWhatIfSimulation` memanggil `POST /api/v1/analytics/what-if`, menulis audit `WHAT_IF_REQUESTED`, lalu mempublikasikan `WHAT_IF_SIMULATION_RUN`. Worker membuka transaksi read-only untuk replay sehingga tabel payroll dan claims tidak berubah. Tanpa token QStash, respons tetap `QUEUED` dengan `enqueued=false`.

## 5A. OpenAPI, GraphQL SDL & *Contract Testing*

1. **OpenAPI 3.1** dihasilkan dari skema Zod di `packages/shared-contracts`; artifact ada di `packages/shared-contracts/openapi.json` dan disajikan di `/openapi.json` pada staging.
2. **GraphQL SDL** disimpan di `apps/edge-gateway/schema.graphql`; resolver divalidasi terhadap SDL; introspection dimatikan di produksi.
3. **Breaking change** wajib versi baru (`/api/v2`) atau migration note + ADR. Menghapus field/enum adalah breaking.
4. **Contract test** memvalidasi contoh request/response terhadap schema; payload dengan field tak dikenal ditolak.
5. **Contoh wajib** untuk setiap endpoint baru: sukses, validasi gagal, unauthorized, forbidden, not found, conflict.
6. **Idempotency** diuji untuk semua endpoint finansial; replay mengembalikan respons asli dengan `X-Idempotent-Replay: true`.

## 6. Protokol Anti-Duplikasi Transaksi (*Idempotency Protocol*)

Seluruh titik akhir finansial kritis (`POST /claims`, `POST /claims/:id/decide`, `POST /payroll/batches/:id/disburse`) wajib mengimplementasikan mekanisme penguncian dua lapis:

1. **Lapisan Cepat (Upstash Redis):**

   * Klien mengirimkan header `Idempotency-Key: <UUIDv4>`.

   * Layanan menjalankan perintah atomik `SET aletheia:idem:<tenant>:<user>:<method>:<path>:<key> "IN_PROGRESS" NX EX 86400`.

   * Jika hasil `SET` adalah `null`:

     * Apabila nilai yang tersimpan adalah `"IN_PROGRESS"`, kembalikan HTTP `409 Conflict` (`ERR_IDEMPOTENCY_CONFLICT`).

     * Apabila nilai yang tersimpan adalah salinan JSON respons sebelumnya, kembalikan respons tersebut secara langsung dengan HTTP `200 OK` dan header `X-Idempotent-Replay: true` tanpa menyentuh database.

2. **Lapisan Permanen (Neon PostgreSQL):**

   * Kolom `idempotency_key` pada tabel `claims.submissions` dan `payroll.batches` memiliki *Unique Constraint*. Setelah transaksi database berhasil di-*commit*, hasil respons disimpan kembali ke kunci Redis dengan `TTL 24 jam`.

## 7. Strategi *Distributed Caching* & *Cache Invalidation* (Upstash Redis)

Untuk menjaga konsumsi perintah harian Upstash tetap jauh di bawah batas $10.000\text{ perintah/hari}$ sambil mempertahankan latensi sub-$50\text{ ms}$ pada pembacaan berulang:

| Kunci Cache Redis | Pola & Data yang Disimpan | TTL | Pemicu Pembersihan (*Invalidation Trigger*) | 
| ----- | ----- | ----- | ----- | 
| `aletheia:policy:active:<tenant>:<domain>` | JSON dokumen kebijakan aktif (`CLAIMS_POLICY` / `PAYROLL_TAX_POLICY`). | `3600s` (1 jam) | Dihapus seketika (`DEL`) saat `POST /api/v1/policies/:id/publish` sukses dijalankan. | 
| `analytics:mis:kpi:<tenant>:<month>:<branch>` | Cache in-process `BranchKpiSummary` untuk dasbor MIS Analyst. | `300s` (5 menit) | Dihapus oleh `POST /api/v1/analytics/cache/invalidate`; TTL menjadi batas stale setelah refresh MV. |
| `aletheia:claims:pending-count:<tenant>:<branch>` | Jumlah antrean klaim aktif yang menunggu persetujuan manajer cabang. | `120s` (2 menit) | Dihapus saat klaim baru diajukan (`POST /claims`) atau diputuskan (`POST /claims/:id/decide`). | 

## 8. Batasan Keras API & Kontrak untuk Agen OpenCode

> **Instruksi Wajib bagi Seluruh Agen Pengembangan:**
>
> 1. **Single Source of Truth untuk Tipe Data:** Dilarang mendefinisikan ulang *interface* DTO (*Data Transfer Object*) secara terpisah di folder `apps/web` dan `services/*`. Seluruh skema wajib diekspor dari `packages/shared-contracts` menggunakan Zod (`z.infer<typeof Schema>`).
>
> 2. **Wajib Validasi Header Idempotency:** Titik akhir pengajuan klaim, persetujuan klaim, dan eksekusi pencairan *payroll* wajib menolak permintaan tanpa header `Idempotency-Key` dengan status `400 Bad Request`.
>
> 3. **Dilarang Mengekspos Stack Trace & PII Mentah:** Middleware penanganan kesalahan global Express.js dan GraphQL Yoga tidak boleh mengirimkan `err.stack` atau detail kueri SQL ke klien di lingkungan `production`, serta wajib memastikan field NIK/rekening yang dikembalikan selalu dalam format `*_masked`.
>
> 4. **Isolasi GraphQL Read-Only:** Skema GraphQL pada fase ini dikhususkan hanya untuk operasi `Query` (pembacaan dan agregasi analitik). Seluruh operasi `Mutation` tetap melalui jalur RESTful API agar terlindungi penuh oleh mekanisme *rate limiting* dan *idempotency key*.
>
> 5. **Tenant Header Wajib:** Setiap request internal wajib membawa `X-Tenant-Id` yang ditandatangani. Resource milik tenant lain selalu mengembalikan `404 ERR_NOT_FOUND` (bukan 403) agar keberadaannya tidak bocor; mismatch header internal mengembalikan `401`.
>
> 6. **Payment Adapter:** Endpoint pencairan tidak boleh memanggil provider langsung; gunakan `packages/payments`. Status `PAID` hanya dari webhook/provider, bukan input manual.
>
> 7. **Laporan & Payslip Immutable:** Endpoint generate tidak boleh menimpa file lama; hasil baru memiliki `supersedes_id`, checksum, dan audit. Download wajib signed URL + audit.
>
> 8. **Idempotency Diperluas:** `POST /claims/:id/disburse`, `POST /reports`, `POST /payslips`, dan `POST /payroll/reconciliations` juga wajib `Idempotency-Key` dan unique constraint terkait.