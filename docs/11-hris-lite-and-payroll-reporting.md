# `11-hris-lite-and-payroll-reporting.md` — HRIS-lite, Payslip & Pelaporan PPh 21/BPJS Aletheia

* **Status Dokumen:** Spesifikasi HRIS-lite & Pelaporan (*Single Source of Truth* untuk Agen OpenCode)
* **Keputusan:** HRIS-lite masuk milestone. Full HRIS dicatat sebagai future development dan **tidak** masuk fase pengerjaan.
* **Prinsip:** Payroll yang benar, transparan, dapat direkonsiliasi, dan siap diaudit.

> **Disclaimer:** Tarif, plafon, dan formulir pajak/BPJS berubah dari waktu ke waktu. Dokumen ini mendefinisikan **mekanisme**, bukan kebenaran hukum final. Semua angka berasal dari `PAYROLL_TAX_POLICY` yang berversi dan wajib diverifikasi dengan konsultan pajak sebelum digunakan untuk kewajiban nyata.

## 1. Ruang Lingkup HRIS-lite

| Modul | Termasuk | Tidak termasuk (future) |
| --- | --- | --- |
| Employee & agent master | profil, kontrak, PTKP, status, rekening masked | rekrutmen, onboarding dokumen |
| Attendance | ringkasan hari kerja, lembur, cuti tak dibayar | clock-in/out, geolokasi, shift scheduling |
| Leave | pengajuan & approval cuti, saldo ringkas | kebijakan cuti kompleks, carry-forward multi-tahun |
| Payroll | batch reguler, koreksi, komisi agen | THR/13th month otomatis (future), multi-currency |
| PPh 21 | TER bulanan, rekonsiliasi tahunan | e-Bupot/SPT langsung ke DJP |
| BPJS | potongan karyawan + kontribusi employer, rekap | integrasi API BPJS |
| Payslip | PDF per periode, verification code | portal employee penuh |
| Reporting | PPh 21 bulanan/tahunan, BPJS, bank file, variance | BI self-service, data warehouse |
| Multi-tenant | `tenant_id` + RLS | billing tenant, self-service signup |

**Alasan:** cukup untuk memenuhi makna "HRIS & payroll" di lowongan, tanpa tenggelam dalam absensi/shift yang tidak diminta.

## 2. Alur Kerja HRIS-lite

```text
Employee master
   → attendance/leave summary (periode)
   → payroll batch (REGULAR | CORRECTION)
   → calculate (Go worker, policy-bound)
   → review variance & anomalies
   → approve (Finance Manager, SoD)
   → disburse (payment adapter, idempotent)
   → payslip + PPh 21/BPJS reports + bank file
   → annual reconciliation (PPh 21)
```

Setiap langkah menulis audit dan dapat dilacak ke `batch_id`, `personnel_id`, dan `policy_version_id`.

## 3. Data Model Tambahan

Semua tabel memiliki `tenant_id UUID NOT NULL`, `created_at`, `updated_at`, dan RLS.

### 3.1 `payroll.personnel` (tambahan kolom)

| Kolom | Tipe | Catatan |
| --- | --- | --- |
| `join_date` | `DATE` | untuk proration |
| `termination_date` | `DATE NULL` | berhenti di tengah periode |
| `employment_status` | `VARCHAR(16)` | `PERMANENT`, `CONTRACT`, `PROBATION`, `INACTIVE` |
| `tax_id_hash` | `CHAR(64)` | NPWP/NIK pajak, hash + pepper |
| `tax_id_masked` | `VARCHAR(24)` | tampilan |
| `bpjs_kesehatan_masked` | `VARCHAR(24)` | nomor peserta |
| `bpjs_ketenagakerjaan_masked` | `VARCHAR(24)` | nomor peserta |
| `bank_code` | `VARCHAR(16)` | untuk bank file |
| `bank_name` | `VARCHAR(64)` | tampilan |

### 3.1A `payroll.sales_achievements`

Sumber tunggal `verified_sales` untuk komisi agen.

| Kolom | Tipe | Catatan |
| --- | --- | --- |
| `id` | UUID PK | |
| `tenant_id` / `personnel_id` | UUID | |
| `period_month` | `DATE` | |
| `verified_sales` | `NUMERIC(18,2)` | hanya baris `VERIFIED` yang dipakai |
| `verification_status` | `VARCHAR(16)` | `PENDING`, `VERIFIED`, `REJECTED` |
| `source` | `VARCHAR(24)` | `IMPORT`, `API`, `MANUAL` |
| `verified_by` / `verified_at` | UUID / TIMESTAMPTZ | |

Constraint: `UNIQUE (tenant_id, personnel_id, period_month)`; `CHECK (verified_sales >= 0)`.

### 3.2 `payroll.attendance_summaries`

| Kolom | Tipe | Catatan |
| --- | --- | --- |
| `id` | UUID PK | UUIDv7 |
| `tenant_id` | UUID | RLS |
| `personnel_id` | UUID | FK |
| `period_month` | `DATE` | hari pertama bulan |
| `working_days` | `SMALLINT` | hari kerja tersedia |
| `present_days` | `SMALLINT` | hadir |
| `paid_leave_days` | `SMALLINT` | cuti dibayar |
| `unpaid_leave_days` | `SMALLINT` | cuti tak dibayar |
| `absent_days` | `SMALLINT` | tanpa keterangan |
| `overtime_hours` | `NUMERIC(8,2)` | lembur disetujui |
| `source` | `VARCHAR(16)` | `MANUAL`, `IMPORT`, `API` |
| `approved_by` | UUID | atasan |
| `approved_at` | TIMESTAMPTZ | |

Constraint: `UNIQUE (tenant_id, personnel_id, period_month)`.

### 3.3 `payroll.leave_requests`

| Kolom | Tipe | Catatan |
| --- | --- | --- |
| `id` | UUID PK | |
| `tenant_id` | UUID | |
| `personnel_id` | UUID | |
| `leave_type` | `VARCHAR(24)` | `ANNUAL`, `SICK`, `MATERNITY`, `UNPAID`, `OTHER` |
| `start_date` / `end_date` | `DATE` | |
| `days` | `NUMERIC(6,2)` | |
| `status` | `VARCHAR(16)` | `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED` |
| `reason` | `TEXT` | |
| `decided_by` / `decided_at` | UUID / TIMESTAMPTZ | |
| `decision_notes` | `TEXT` | wajib jika rejected |

### 3.4 `payroll.batches` (tambahan)

| Kolom | Tipe | Catatan |
| --- | --- | --- |
| `batch_type` | `VARCHAR(24)` | `REGULAR`, `CORRECTION`, `THR`, `THIRTEENTH_MONTH` |
| `correction_seq` | `SMALLINT` | default 0; 1..n untuk koreksi |
| `period_start` / `period_end` | `DATE` | eksplisit |
| `calculated_at` | TIMESTAMPTZ | |
| `calculation_version` | `VARCHAR(16)` | untuk reprocessing |
| `variance_vs_batch_id` | UUID NULL | pembanding |

Constraint: `UNIQUE (tenant_id, branch_id, period_month, batch_type, correction_seq)`.

> **Milestone:** hanya `REGULAR` dan `CORRECTION` yang diimplementasikan. `THR` dan `THIRTEENTH_MONTH` disiapkan di enum untuk future; jangan membangun formulanya tanpa keputusan baru.

### 3.5 `payroll.items` (tambahan)

| Kolom | Tipe | Catatan |
| --- | --- | --- |
| `overtime_pay` | `NUMERIC(18,2)` | |
| `variable_allowance` | `NUMERIC(18,2)` | tunjangan variabel periode |
| `proration_days` | `SMALLINT` | hari yang diprorata |
| `proration_basis` | `VARCHAR(16)` | `working_days` / `calendar_days` |
| `unpaid_leave_deduction` | `NUMERIC(18,2)` | |
| `absence_deduction` | `NUMERIC(18,2)` | potongan absensi |
| `bpjs_jht_deduction` | `NUMERIC(18,2)` | potongan karyawan |
| `bpjs_jp_deduction` | `NUMERIC(18,2)` | potongan karyawan |
| `bpjs_kesehatan_employer` | `NUMERIC(18,2)` | biaya perusahaan |
| `bpjs_jht_employer` | `NUMERIC(18,2)` | |
| `bpjs_jp_employer` | `NUMERIC(18,2)` | |
| `bpjs_jkk_employer` | `NUMERIC(18,2)` | |
| `bpjs_jkm_employer` | `NUMERIC(18,2)` | |
| `taxable_income` | `NUMERIC(18,2)` | dasar PPh 21 |
| `ytd_gross` / `ytd_tax` | `NUMERIC(18,2)` | untuk payslip & rekonsiliasi |
| `payment_status` | `VARCHAR(16)` | `PENDING`, `PROCESSING`, `PAID`, `FAILED`, `REVERSED` |
| `payment_intent_id` | `UUID` | tautan ke `payroll.payments` terbaru |

### 3.6 `payroll.payslips`

| Kolom | Tipe | Catatan |
| --- | --- | --- |
| `id` | UUID PK | |
| `tenant_id` | UUID | |
| `batch_id` / `personnel_id` | UUID | `UNIQUE (tenant_id, batch_id, personnel_id, version)` |
| `period_month` | `DATE` | |
| `version` | `SMALLINT` | default 1 |
| `secure_url` | `TEXT` | Cloudinary signed |
| `snapshot_hash_sha256` | `CHAR(64)` | hash data canonical |
| `file_checksum_sha256` | `CHAR(64)` | hash file PDF |
| `verification_code` | `VARCHAR(16)` | untuk verifikasi manual |
| `published_at` | TIMESTAMPTZ | |
| `viewed_at` | TIMESTAMPTZ NULL | |
| `supersedes_id` | UUID NULL | versi sebelumnya |

### 3.7 `payroll.tax_reports`

| Kolom | Tipe | Catatan |
| --- | --- | --- |
| `id` | UUID PK | |
| `tenant_id` | UUID | |
| `report_type` | `VARCHAR(32)` | `PPH21_MONTHLY`, `PPH21_ANNUAL`, `BPJS_MONTHLY`, `BANK_FILE`, `PAYROLL_VARIANCE` |
| `branch_id` | UUID NULL | NULL = seluruh cabang |
| `policy_version_id` | UUID | versi kebijakan yang dipakai |
| `period_start` / `period_end` | `DATE` | |
| `version` | `SMALLINT` | default 1 |
| `supersedes_id` | UUID NULL | versi sebelumnya |
| `status` | `VARCHAR(16)` | `QUEUED`, `GENERATING`, `READY`, `FAILED` |
| `file_url` | `TEXT` | Cloudinary/Blob |
| `snapshot_hash_sha256` | `CHAR(64)` | hash data canonical |
| `file_checksum_sha256` | `CHAR(64)` | hash file ekspor |
| `total_gross` / `total_employee_bpjs` / `total_employer_bpjs` / `total_pph21` / `total_net` | `NUMERIC(18,2)` | total terketik |
| `headcount` | INTEGER | |
| `reconciliation_delta` | `NUMERIC(18,2)` | harus 0.00 untuk laporan final |
| `totals` | `JSONB` | breakdown tambahan |
| `generated_by` / `generated_at` | UUID / TIMESTAMPTZ | |
| `error_message` | `TEXT NULL` | tanpa PII |

Constraint: `UNIQUE (tenant_id, report_type, branch_id, period_start, period_end, version)`; `CHECK (status <> 'READY' OR (file_url IS NOT NULL AND file_checksum_sha256 IS NOT NULL AND snapshot_hash_sha256 IS NOT NULL))`; regenerate membuat versi baru dengan `supersedes_id` dan `version + 1`.

### 3.8 `payroll.tax_reconciliations`

| Kolom | Tipe | Catatan |
| --- | --- | --- |
| `id` | UUID PK | |
| `tenant_id` / `personnel_id` | UUID | |
| `tax_year` | `SMALLINT` | |
| `policy_version_id` | UUID | versi kebijakan untuk rekonsiliasi |
| `annual_gross` | `NUMERIC(18,2)` | |
| `ptkp_amount` | `NUMERIC(18,2)` | |
| `biaya_jabatan` | `NUMERIC(18,2)` | |
| `deductible_contributions` | `NUMERIC(18,2)` | |
| `annual_tax` | `NUMERIC(18,2)` | |
| `ter_credits` | `NUMERIC(18,2)` | |
| `difference` | `NUMERIC(18,2)` | positif = kurang bayar |
| `status` | `VARCHAR(16)` | `DRAFT`, `POSTED`, `VOID` |
| `version` | `SMALLINT` | default 1 |
| `settlement_batch_id` / `settlement_item_id` | UUID NULL | tautan posting selisih |
| `posted_by` | UUID NULL | harus ≠ `created_by` |
| `posted_at` | TIMESTAMPTZ | |

### 3.9 `payroll.payments`

State machine pembayaran per item; sumber kebenaran `PAID`/`FAILED`, bukan `payroll.items`.

| Kolom | Tipe | Catatan |
| --- | --- | --- |
| `id` | UUID PK | |
| `tenant_id` / `batch_id` / `personnel_id` | UUID | |
| `policy_version_id` | UUID | |
| `provider` | `VARCHAR(24)` | `MOCK`, `XENDIT`, `MIDTRANS` |
| `provider_reference` | `VARCHAR(80)` | dari provider |
| `amount` | `NUMERIC(18,2)` | |
| `status` | `VARCHAR(16)` | `PENDING`, `PROCESSING`, `PAID`, `FAILED`, `REVERSED` |
| `idempotency_key` | `VARCHAR(64)` | unik per tenant |
| `attempt_no` | `SMALLINT` | default 1 |
| `requested_by` / `approved_by` | UUID | |
| `requested_at` / `paid_at` | TIMESTAMPTZ | |
| `failure_reason` | `TEXT NULL` | tanpa PII |

Constraint: `UNIQUE (tenant_id, batch_id, personnel_id, attempt_no)`, `UNIQUE (tenant_id, idempotency_key)`, partial unique `(tenant_id, batch_id, personnel_id) WHERE status IN ('PENDING','PROCESSING','PAID')`; `CHECK (amount >= 0)`.

## 4. Perhitungan

### 4.1 Gross

```text
gross = base_salary
      + fixed_allowance
      + variable_allowance
      + overtime_pay
      + agent_commission
      - unpaid_leave_deduction
      - absence_deduction
```

- Proration untuk join/termination di tengah periode: simpan `proration_days` + `proration_basis` (integer hari), lalu `RoundHalfUp(base × days / basis, 2)`. Jangan menyimpan factor 4-desimal yang menimbulkan drift.
- Overtime: jam pertama × `overtime_first_hour_multiplier`, jam berikutnya × `overtime_subsequent_multiplier`, hari istirahat × `overtime_rest_day_multiplier`. `hourly_rate` dari `hourly_rate_basis`; batas `max_overtime_hours_per_month` dari policy.
- `daily_rate` dari `daily_rate_basis`; jangan memilih `base/30` atau `base/working_days` secara implisit.
- Komisi agen: `commission_mode` (`FLAT_TIER` default; `MARGINAL` opsional) dan `verified_sales` dari `payroll.sales_achievements` berstatus `VERIFIED`.
- Unpaid leave: `daily_rate × unpaid_days`; `unpaid_days <= working_days` wajib.
- Jangan pernah menebak; jika policy key tidak ada, gagal `ERR_POLICY_RULE_VIOLATION`.

### 4.2 BPJS Karyawan

```text
bpjs_wage_base = sum(components in bpjs_wage_base_components)
kesehatan = min(bpjs_wage_base, kesehatan_salary_cap) × kesehatan_employee_rate
jht       = min(bpjs_wage_base, jht_salary_cap) × jht_employee_rate   # null cap = no cap
jp        = min(bpjs_wage_base, jp_salary_cap) × jp_employee_rate
total     = kesehatan + jht + jp
```

### 4.3 BPJS Employer (biaya perusahaan, bukan potongan)

```text
kesehatan_er = min(bpjs_wage_base, kesehatan_salary_cap) × kesehatan_employer_rate
jht_er       = min(bpjs_wage_base, jht_salary_cap) × jht_employer_rate
jp_er        = min(bpjs_wage_base, jp_salary_cap) × jp_employer_rate
jkk_er       = bpjs_wage_base × jkk_rate_by_risk_class[personnel.risk_class]
jkm_er       = bpjs_wage_base × jkm_rate
```

Semua employer contribution masuk `payroll.items` dan laporan BPJS, tetapi **tidak** mengurangi net karyawan. `agent_bpjs_applicable` menentukan apakah agen ikut BPJS; jangan default 0 tanpa policy.

### 4.4 PPh 21 Bulanan (TER)

1. `ptkp_status` → kategori (`A/B/C`) via `pph21_ter_mapping`.
2. Hitung `ter_base` = jumlah `ter_base_components` dikurangi `ter_base_exclusions`; jika key tidak ada, gagal `ERR_POLICY_RULE_VIOLATION`.
3. Cari bracket pertama `ter_base <= max_gross`.
4. `pph21 = RoundHalfUp(ter_base × rate, 2)`.
5. Simpan `ter_base` sebagai `taxable_income` dan `applied_ter_rate` di breakdown. Gunakan basis yang sama untuk lookup dan perkalian.

### 4.5 PPh 21 Tahunan (Rekonsiliasi)

Menggunakan policy `pph21_annual_brackets` dan `ptkp_amounts`:

```text
net_income = annual_gross
           - biaya_jabatan (rate × annual_gross, max per policy)
           - deductible_contributions (JHT/JP karyawan, sesuai policy)

pkp = max(0, net_income - ptkp_amount)
annual_tax = Σ_i max(0, min(pkp, upper_i) - lower_i) × rate_i
difference = annual_tax - ter_credits
```

Dengan `lower_i` = `upper_{i-1}` (0 untuk bracket pertama); bracket harus kontinu dan berakhir di `max_pkp` tak terhingga. Bukan lookup first-match.

- `difference > 0` → kurang bayar, potong pada periode Desember/Januari atau periode yang ditentukan policy.
- `difference < 0` → lebih bayar, refund/credit sesuai policy; jangan pernah membuat net negatif tanpa aturan eksplisit.
- Simpan `tax_reconciliations`; jangan menimpa `payroll.items` bulanan.
- Posting selisih melalui batch `CORRECTION` baru yang terhubung ke `settlement_batch_id`/`settlement_item_id`; payslip koreksi dirender dari batch itu.
- **Biaya jabatan dan komponen yang deductible wajib berasal dari policy**, bukan asumsi kode.

### 4.6 Pembulatan

- Nilai ledger: 2 desimal, `RoundHalfUp`.
- Pajak yang disetor: policy menentukan 0 atau 2 desimal; default 0 untuk remittance, 2 untuk perhitungan.
- Total batch = jumlah item setelah pembulatan; jangan membulatkan ulang total.
- Selisih pembulatan antar-level dicatat di `calculation_breakdown.rounding_adjustment`.

## 5. Payslip

### 5.1 Isi wajib

- Identitas tenant & cabang, periode, nomor payslip.
- Nama & kode personel, jabatan, status PTKP, rekening masked.
- Gross components (base, allowance, overtime, commission).
- Employee deductions (BPJS Kesehatan, JHT, JP, PPh 21).
- Employer contributions (informasi, tidak mengurangi net).
- Net take-home pay.
- YTD gross/tax (jika tersedia).
- Policy version tag, generated_at, verification code, snapshot hash, file checksum.
- Disclaimer: bukan bukti pembayaran resmi bank.

### 5.2 Aturan

- Payslip dirender dari `payroll.items.calculation_breakdown`, bukan dihitung ulang.
- Hanya dibuat setelah batch `APPROVED` atau `DISBURSED`.
- PDF disimpan di Cloudinary dengan signed URL; checksum disimpan di DB.
- Karyawan hanya bisa melihat payslip miliknya; HR dapat melihat sesuai tenant/cabang.
- Jangan pernah menampilkan NIK/rekening penuh.
- Regenerate menghasilkan versi baru (`version + 1`, `supersedes_id`); `snapshot_hash` sama untuk data yang sama, `file_checksum` baru. Jangan menimpa file lama.

## 6. Laporan & Ekspor

| Laporan | Format | Isi | Konsumen |
| --- | --- | --- | --- |
| PPh 21 bulanan | CSV/XLSX | per orang: NPWP masked, PTKP, gross, TER, tax, total | Finance, Compliance |
| PPh 21 tahunan | CSV/XLSX | annual gross, PTKP, PKP, annual tax, credits, difference | Finance, Compliance |
| BPJS bulanan | CSV/XLSX | employee/employer per komponen, headcount, total | HR, Finance |
| Bank transfer file | CSV sesuai template bank | beneficiary, rekening masked, amount, reference, checksum | Finance |
| Payroll variance | XLSX | per orang & total delta vs batch sebelumnya, reason | HR, Finance |
| Payslip | PDF | lihat Bagian 5 | karyawan, HR |

Aturan:
- Setiap file memiliki header metadata: tenant, periode, policy, generated_at, generated_by, checksum.
- File disimpan di object storage; DB menyimpan metadata + checksum, bukan isi biner.
- Generate ulang untuk snapshot data yang sama harus menghasilkan `snapshot_hash` yang sama; jika berbeda, investigasi. `file_checksum` dapat berbeda karena metadata file.
- Ekspor tidak boleh memuat NIK/rekening penuh; gunakan masked.
- Akses unduhan diaudit.

## 7. API Tambahan

| Method | Endpoint | Peran | Catatan |
| --- | --- | --- | --- |
| GET | `/api/v1/employees` | HR, Finance | filter cabang/status |
| POST | `/api/v1/employees` | HR | hash NIK/rekening |
| PATCH | `/api/v1/employees/:id` | HR | audit before/after |
| GET | `/api/v1/sales-achievements?period=YYYY-MM` | HR, Finance | daftar `verified_sales` |
| PUT | `/api/v1/sales-achievements/:personnelId/:period` | HR/Finance | upsert + verifikasi; audit |
| GET | `/api/v1/attendance?period=YYYY-MM` | HR | ringkasan |
| PUT | `/api/v1/attendance/:personnelId/:period` | HR | upsert ringkasan |
| GET | `/api/v1/leave-requests` | HR, Manager | filter status |
| POST | `/api/v1/leave-requests` | HR | ajukan |
| POST | `/api/v1/leave-requests/:id/decide` | Manager | SoD |
| GET | `/api/v1/payslips?period=YYYY-MM` | HR | list |
| GET | `/api/v1/payslips/:id` | HR/self | signed URL |
| POST | `/api/v1/payroll/batches/:id/payslips` | HR | generate |
| GET | `/api/v1/reports` | HR/Finance/Compliance | list |
| POST | `/api/v1/reports` | HR/Finance | generate |
| GET | `/api/v1/reports/:id/download` | sesuai peran | signed URL |
| POST | `/api/v1/payroll/reconciliations` | Finance | annual |
| GET | `/api/v1/payroll/reconciliations` | Finance/Compliance | list |

Semua mutasi finansial memakai `Idempotency-Key`; semua endpoint memakai tenant/branch scope.

## 8. Multi-Tenant

- Satu deployment melayani banyak tenant; `tenant_id` dari JWT.
- Policy, personel, batch, payslip, laporan, dan audit terisolasi per tenant.
- RLS aktif; service menetapkan `app.tenant_id`.
- Admin tenant tidak bisa melihat tenant lain; super-admin platform (jika ada) memakai jalur terpisah dengan audit.
- Format nomor dokumen menyertakan tenant prefix agar tidak bentrok.

## 9. Kriteria Penerimaan

- [x] Employee lifecycle (create/update/deactivate) dengan PII masked.
- [x] Attendance/leave summary per periode; approval cuti dengan SoD.
- [x] Payroll batch reguler + koreksi; kalkulasi async; breakdown lengkap.
- [x] PPh 21 TER bulanan + rekonsiliasi tahunan; perbedaan diposting tanpa menimpa bulanan.
- [x] BPJS karyawan + employer, cap benar, dan laporan bulanan CSV.
- [x] Payslip PDF dari breakdown; checksum; tautan bertanda tangan dan audit unduhan.
- [x] Laporan PPh 21 bulanan dan tahunan, BPJS, bank file, dan variance; checksum; audit unduhan.
- [x] Semua perhitungan memakai policy version yang terikat.
- [x] Employee self-service untuk slip, absensi, saldo cuti, e-cuti, dan e-lembur (M6.4).
- [ ] Persetujuan cuti otomatis memperbarui attendance summary payroll.
- [x] Tidak ada PII mentah di UI/log/ekspor.
- [ ] Test U-01..U-20 + I-08..I-10 lulus.

## 10. Future Development (di luar milestone)

- Absensi clock-in/out, geolokasi, shift scheduling, overtime otomatis.
- THR/13th month otomatis dengan formula policy.
- Reimbursement, benefit, loan, kasbon.
- Performance review, recruitment, onboarding.
- Integrasi e-Bupot/SPT DJP dan API BPJS.
- Multi-currency dan payroll lintas negara.
- Portal employee penuh + mobile app. Self-service web untuk slip, absensi, cuti, dan lembur sudah ada di M6.4.
- Data warehouse/BI self-service.

Future items **tidak** boleh masuk milestone tanpa persetujuan eksplisit; dokumen ini menandainya sebagai backlog.

## 11. Batasan Keras HRIS-lite

> 1. Dilarang menambahkan absensi clock-in/out ke milestone tanpa keputusan baru.
> 2. Dilarang menghitung pajak/BPJS tanpa policy version.
> 3. Dilarang menimpa payslip/laporan lama; gunakan versi baru + supersedes.

> **Implementasi M3.4:** payslip dan laporan disimpan pada `payroll.generated_files` dan disajikan melalui tautan HMAC berumur pendek. Ini pengganti object storage pada demo gratis. Rekonsiliasi tahunan dicatat pada `tax_reconciliations` dan diposting sebagai `POSTED`; pembuatan batch `CORRECTION` otomatis masih ditunda.
> 4. Dilarang mengekspor NIK/rekening penuh.
> 5. Dilarang membuat laporan dari data yang belum final/approved.
> 6. Dilarang mengklaim kepatuhan pajak final tanpa verifikasi konsultan.
