# `04-business-rules-and-engines.md` — Aturan Deterministik Kebijakan, *Payroll* & Mesin Analitik Aletheia

* **Nama Sistem:** Aletheia (*Enterprise Disbursement Governance & MIS Intelligence Platform*)
* **Status Dokumen:** Spesifikasi Logika Inti & Mesin Komputasi (*Single Source of Truth* untuk Agen OpenCode)
* **Runtime Eksekusi:** `analytics-worker-go` (Go 1.26 dengan `shopspring/decimal`) & Layanan Validasi Express.js (TypeScript dengan `decimal.js`)

---

## 1. Struktur Dokumen Kebijakan Berversi (`governance.policy_versions.rules_payload`)

Sesuai filosofi **Policy-as-Reference**, seluruh parameter aturan bisnis perusahaan disimpan di dalam kolom `rules_payload` (`JSONB`) dan dikunci pada setiap transaksi saat transaksi dibuat. Agen dilarang menanam angka parameter di bawah ini sebagai konstanta mati di dalam kode sumber.

### A. Skema Referensi Kebijakan Klaim (`domain = 'CLAIMS_POLICY'`)

```json
{
  "approval_tiers": {
    "level_1_branch_manager_max": "25000000.00",
    "level_2_finance_manager_max": "150000000.00",
    "auto_escalate_risk_threshold": 65,
    "force_escalate_on_conflict": true
  },
  "required_documents_by_category": {
    "HEALTH": ["IDENTITY_CARD", "MEDICAL_INVOICE"],
    "ACCIDENT": ["IDENTITY_CARD", "MEDICAL_INVOICE", "POLICE_REPORT"],
    "PROPERTY": ["IDENTITY_CARD", "POLICY_CERT", "POLICE_REPORT"],
    "GUARANTEE": ["IDENTITY_CARD", "POLICY_CERT"]
  },
  "optional_documents_by_category": {
    "HEALTH": ["POLICY_CERT"],
    "ACCIDENT": ["POLICY_CERT"],
    "PROPERTY": ["MEDICAL_INVOICE"],
    "GUARANTEE": ["MEDICAL_INVOICE"]
  },
  "risk_scoring_weights": {
    "missing_optional_evidence_points": 15,
    "high_amount_ratio_threshold": 0.80,
    "high_amount_ratio_points": 25,
    "repeat_bank_account_30d_points": 30,
    "cross_domain_conflict_points": 50
  },
  "sla_target_hours": 48
}
```

### B. Skema Referensi Kebijakan Payroll & Pajak (`domain = 'PAYROLL_TAX_POLICY'`)

```json
{
  "bpjs_parameters": {
    "kesehatan_employee_rate": "0.0100",
    "kesehatan_salary_cap": "12000000.00",
    "jht_employee_rate": "0.0200",
    "jht_salary_cap": null,
    "jp_employee_rate": "0.0100",
    "jp_salary_cap": "10042300.00",
    "bpjs_wage_base_components": ["base_salary", "fixed_allowance"],
    "agent_bpjs_applicable": false
  },
  "pph21_ter_mapping": {
    "CATEGORY_A": ["TK/0", "TK/1", "K/0"],
    "CATEGORY_B": ["TK/2", "TK/3", "K/1", "K/2"],
    "CATEGORY_C": ["K/3"]
  },
  "ter_base_components": ["base_salary", "fixed_allowance", "variable_allowance", "overtime_pay", "agent_commission"],
  "ter_base_exclusions": [],
  "pph21_ter_brackets": {
    "CATEGORY_A": [
      { "max_gross": "5400000.00", "rate": "0.0000" },
      { "max_gross": "5650000.00", "rate": "0.0025" },
      { "max_gross": "5950000.00", "rate": "0.0050" },
      { "max_gross": "6300000.00", "rate": "0.0075" },
      { "max_gross": "6750000.00", "rate": "0.0100" },
      { "max_gross": "7500000.00", "rate": "0.0125" },
      { "max_gross": "8550000.00", "rate": "0.0150" },
      { "max_gross": "9650000.00", "rate": "0.0175" },
      { "max_gross": "10050000.00", "rate": "0.0200" },
      { "max_gross": "10350000.00", "rate": "0.0225" },
      { "max_gross": "10700000.00", "rate": "0.0250" },
      { "max_gross": "11050000.00", "rate": "0.0300" },
      { "max_gross": "11600000.00", "rate": "0.0350" },
      { "max_gross": "12500000.00", "rate": "0.0400" },
      { "max_gross": "13750000.00", "rate": "0.0500" },
      { "max_gross": "15100000.00", "rate": "0.0600" },
      { "max_gross": "16950000.00", "rate": "0.0700" },
      { "max_gross": "19750000.00", "rate": "0.0800" },
      { "max_gross": "24150000.00", "rate": "0.0900" },
      { "max_gross": "26450000.00", "rate": "0.1000" },
      { "max_gross": "999999999999.00", "rate": "0.1500" }
    ],
    "CATEGORY_B": [
      { "max_gross": "6200000.00", "rate": "0.0000" },
      { "max_gross": "6500000.00", "rate": "0.0025" },
      { "max_gross": "6850000.00", "rate": "0.0050" },
      { "max_gross": "7300000.00", "rate": "0.0075" },
      { "max_gross": "9200000.00", "rate": "0.0100" },
      { "max_gross": "10750000.00", "rate": "0.0150" },
      { "max_gross": "11250000.00", "rate": "0.0200" },
      { "max_gross": "11600000.00", "rate": "0.0250" },
      { "max_gross": "12600000.00", "rate": "0.0300" },
      { "max_gross": "13600000.00", "rate": "0.0400" },
      { "max_gross": "14950000.00", "rate": "0.0500" },
      { "max_gross": "16400000.00", "rate": "0.0600" },
      { "max_gross": "18450000.00", "rate": "0.0700" },
      { "max_gross": "21850000.00", "rate": "0.0800" },
      { "max_gross": "26000000.00", "rate": "0.0900" },
      { "max_gross": "999999999999.00", "rate": "0.1500" }
    ],
    "CATEGORY_C": [
      { "max_gross": "6600000.00", "rate": "0.0000" },
      { "max_gross": "6950000.00", "rate": "0.0025" },
      { "max_gross": "7350000.00", "rate": "0.0050" },
      { "max_gross": "7800000.00", "rate": "0.0075" },
      { "max_gross": "8850000.00", "rate": "0.0100" },
      { "max_gross": "9800000.00", "rate": "0.0125" },
      { "max_gross": "10950000.00", "rate": "0.0150" },
      { "max_gross": "11200000.00", "rate": "0.0175" },
      { "max_gross": "12050000.00", "rate": "0.0200" },
      { "max_gross": "12950000.00", "rate": "0.0300" },
      { "max_gross": "14150000.00", "rate": "0.0400" },
      { "max_gross": "15550000.00", "rate": "0.0500" },
      { "max_gross": "17050000.00", "rate": "0.0600" },
      { "max_gross": "19500000.00", "rate": "0.0700" },
      { "max_gross": "22700000.00", "rate": "0.0800" },
      { "max_gross": "26600000.00", "rate": "0.0900" },
      { "max_gross": "999999999999.00", "rate": "0.1500" }
    ]
  },
  "agent_commission_tiers": [
    { "min_sales": "0.00", "max_sales": "50000000.00", "commission_rate": "0.0250" },
    { "min_sales": "50000000.01", "max_sales": "150000000.00", "commission_rate": "0.0400" },
    { "min_sales": "150000000.01", "max_sales": "999999999999.00", "commission_rate": "0.0550" }
  ],
  "commission_mode": "FLAT_TIER",
  "bpjs_employer_rates": {
    "kesehatan_employer_rate": "0.0400",
    "jht_employer_rate": "0.0370",
    "jp_employer_rate": "0.0200",
    "jkk_rate_by_risk_class": { "I": "0.0024", "II": "0.0054", "III": "0.0089", "IV": "0.0127", "V": "0.0174" },
    "jkm_rate": "0.0030"
  },
  "ptkp_amounts": {
    "TK/0": "54000000.00",
    "TK/1": "58500000.00",
    "K/0": "58500000.00",
    "TK/2": "63000000.00",
    "K/1": "63000000.00",
    "TK/3": "67500000.00",
    "K/2": "67500000.00",
    "K/3": "72000000.00"
  },
  "pph21_annual_brackets": [
    { "max_pkp": "60000000.00", "rate": "0.0500" },
    { "max_pkp": "250000000.00", "rate": "0.1500" },
    { "max_pkp": "500000000.00", "rate": "0.2500" },
    { "max_pkp": "5000000000.00", "rate": "0.3000" },
    { "max_pkp": "999999999999.00", "rate": "0.3500" }
  ],
  "annual_deductions": {
    "biaya_jabatan_rate": "0.0500",
    "biaya_jabatan_max_annual": "6000000.00",
    "deductible_employee_contributions": ["JHT", "JP"]
  },
  "reconciliation_posting_period": "DECEMBER",
  "overpayment_treatment": "REFUND_OR_CREDIT",
  "negative_net_policy": "REJECT",
  "tax_remittance_rounding": 0,
  "prorate_fixed_allowance": true,
  "attendance": {
    "proration_basis": "working_days",
    "daily_rate_basis": "base_salary/working_days",
    "hourly_rate_basis": "base_salary/(working_days*8)",
    "overtime_first_hour_multiplier": "1.5000",
    "overtime_subsequent_multiplier": "2.0000",
    "overtime_rest_day_multiplier": "2.0000",
    "max_overtime_hours_per_month": 40
  }
}
```

> **Catatan:** Nilai di atas adalah contoh untuk seed/demo. Semua angka wajib berasal dari policy version yang terikat pada transaksi; jangan menyalinnya sebagai konstanta kode. Verifikasi dengan konsultan pajak sebelum penggunaan nyata. **Tabel `pph21_ter_brackets` di contoh ini sengaja dipotong dan tidak lengkap sampai tarif tertinggi; jangan dipakai produksi.** Policy publish validator wajib menolak tabel yang tidak kontinu, tidak mencakup `max_gross` tak terhingga, atau berhenti di bawah tarif tertinggi yang diwajibkan policy.

---

## 2. Mesin Evaluasi Klaim & Persetujuan Berjenjang

### A. Validasi Kelengkapan Dokumen (Synchronous pada `POST /claims`)
Sebelum status klaim berubah dari `DRAFT` ke `SUBMITTED`, `claims-service` wajib memvalidasi bahwa seluruh jenis dokumen pada `required_documents_by_category[claim_category]` di dalam kebijakan yang terikat telah tercatat di tabel `claims.documents`. Jika belum lengkap, sistem menolak dengan `422 ERR_POLICY_RULE_VIOLATION`.

Setelah submit, status menjadi `RISK_PENDING`; `analytics-worker-go` mengisi `risk_score` dan `risk_evaluated_at`. Approval hanya boleh dilakukan setelah `risk_evaluated_at` terisi; jika belum, endpoint mengembalikan `409 ERR_RISK_PENDING`.

> **Catatan implementasi M3.2:** `claims-service` tetap menjalankan evaluator risiko deterministik secara sinkron di dalam transaksi submit. Event `CLAIM_SUBMITTED_EVALUATE` dikirim ke QStash; handler Go memeriksa `risk_evaluated_at` dan melewati klaim yang sudah dievaluasi sehingga tidak terjadi evaluasi ganda. Jalur sinkron dapat dipensiunkan setelah token QStash aktif dan hasil worker terbukti ekuivalen. Jika event tidak terkirim, submit tetap berhasil karena hasil risiko sudah tersimpan.

### B. Kalkulasi Skor Risiko Deterministik (`analytics-worker-go`)
Saat event `CLAIM_SUBMITTED_EVALUATE` diterima oleh pekerja Go, skor risiko $S_{\text{risk}} \in [0, 100]$ dihitung secara deterministik berdasarkan parameter bobot kebijakan:

$$S_{\text{risk}} = \min\left(100,\; W_{\text{ratio}} + W_{\text{repeat}} + W_{\text{conflict}} + W_{\text{optional}}\right)$$

Dengan aturan komponen:
1. **Rasio Nominal ($W_{\text{ratio}}$):** Jika $\frac{\text{requested\_amount}}{\text{level\_1\_branch\_manager\_max}} \ge \text{high\_amount\_ratio\_threshold}$, tambahkan `high_amount_ratio_points`.
2. **Frekuensi Rekening ($W_{\text{repeat}}$):** Jika ditemukan $\ge 2$ pengajuan klaim lain pada tenant yang sama dengan `bank_account_hash` identik dalam $30\text{ hari}$ terakhir, tambahkan `repeat_bank_account_30d_points`.
3. **Benturan Lintas-Domain ($W_{\text{conflict}}$):** Jika pemindaian lintas-modul pada tenant yang sama mendeteksi irisan identitas atau rekening dengan `payroll.personnel`, tambahkan `cross_domain_conflict_points` dan set `has_conflict_flag = true`.
4. **Bukti Opsional Hilang ($W_{\text{optional}}$):** Jika dokumen opsional yang diminta policy tidak ada, tambahkan `missing_optional_evidence_points`. Dokumen wajib yang hilang tetap ditolak secara sinkron, bukan diberi skor.

### C. Matriks Rute Otorisasi (*Approval Routing*)
Ketika *Approver* mengeksekusi `POST /api/v1/claims/:id/decide`, layanan mengevaluasi hak kewenangan berdasarkan nilai transaksi dan skor risiko:

| Kondisi Transaksi | Jenjang Otorisasi Wajib | Peran yang Diizinkan Memutuskan |
| :--- | :--- | :--- |
| $\text{requested\_amount} \le L_1$ **DAN** $S_{\text{risk}} < T_{\text{risk}}$ **DAN** `has_conflict_flag == false` | **Level 1** (Cabang) | `BRANCH_MANAGER` (pada cabang yang sama) atau `FINANCE_MANAGER`. |
| $L_1 < \text{requested\_amount} \le L_2$ **ATAU** $S_{\text{risk}} \ge T_{\text{risk}}$ **ATAU** `has_conflict_flag == true` | **Level 2** (Eskalasi Pusat) | Wajib disetujui oleh `FINANCE_MANAGER` setelah melalui peninjauan Level 1 (status otomatis berubah menjadi `ESCALATED`). |
| $\text{requested\_amount} > L_2$ | **Ditolak Kebijakan** | Sistem menolak dengan `422 ERR_POLICY_RULE_VIOLATION` (melebihi pagu maksimal produk). |

*(Keterangan: $L_1 = \text{level\_1\_branch\_manager\_max}$, $L_2 = \text{level\_2\_finance\_manager\_max}$, $T_{\text{risk}} = \text{auto\_escalate\_risk\_threshold}$).*

---

## 3. Mesin Kalkulasi *Payroll*, BPJS & Pajak PPh 21 (`analytics-worker-go`)

Seluruh operasi aritmatika keuangan di dalam pekerja Go wajib menggunakan pustaka desimal eksak (`github.com/shopspring/decimal`) dengan pembulatan standar akuntansi (`RoundHalfUp` ke $2\text{ tempat desimal}$ untuk Rupiah).

### Tahap 1: Penentuan Penghasilan Bruto ($G$)

Rumus kanonik (sama dengan `docs/11`):

$$\text{gross} = \text{base\_salary} + \text{fixed\_allowance} + \text{variable\_allowance} + \text{overtime\_pay} + \text{agent\_commission} - \text{unpaid\_leave\_deduction} - \text{absence\_deduction}$$

* **Karyawan (`EMPLOYEE`):** `agent_commission = 0`; komponen lain mengikuti kontrak/periode.
* **Agen (`SALES_AGENT`):** `agent_commission` dihitung dari `verified_sales` (tabel `payroll.sales_achievements`) menggunakan `agent_commission_tiers` dan `commission_mode` (`FLAT_TIER` default; `MARGINAL` opsional). Validasi tier saat publish: tidak ada gap/overlap, `min_sales`/`max_sales` kontinu, dan dokumentasikan cliff jika memakai `FLAT_TIER`.
* `variable_allowance`, `overtime_pay`, dan potongan absensi disimpan per item; jangan menebak jika komponen tidak ada (default 0 hanya jika policy menyatakannya).

### Tahap 2: Kalkulasi Iuran BPJS (Porsi Karyawan)
Untuk karyawan (`EMPLOYEE`), dasar perhitungan adalah `bpjs_wage_base` = jumlah komponen pada `bpjs_wage_base_components` (default `base_salary + fixed_allowance`), bukan seluruh gross. Jangan memasukkan overtime/komisi kecuali policy menyatakannya.

1. **BPJS Kesehatan ($1\%$):**
   $$B_{\text{kes}} = \min(\text{bpjs\_wage\_base},\; \text{kesehatan\_salary\_cap}) \times \text{kesehatan\_employee\_rate}$$
2. **BPJS Ketenagakerjaan — JHT ($2\%$) & JP ($1\%$):**
   $$B_{\text{jht}} = \min(\text{bpjs\_wage\_base},\; \text{jht\_salary\_cap}) \times \text{jht\_employee\_rate}$$
   $$B_{\text{jp}} = \min(\text{bpjs\_wage\_base},\; \text{jp\_salary\_cap}) \times \text{jp\_employee\_rate}$$
   Jika `jht_salary_cap` null, tidak ada plafon.
3. **Total Potongan BPJS:**
   $$B_{\text{total}} = B_{\text{kes}} + B_{\text{jht}} + B_{\text{jp}}$$

*(Catatan: untuk `SALES_AGENT`, BPJS hanya dihitung jika `agent_bpjs_applicable = true`; default `false` dan tidak boleh diasumsikan 0 tanpa membaca policy.)*

### Tahap 3: Kalkulasi Pajak Penghasilan Pasal 21 (Metode TER Bulanan)
1. Tentukan kategori TER (`CATEGORY_A`, `CATEGORY_B`, atau `CATEGORY_C`) dengan mencocokkan `personnel.ptkp_status` terhadap `pph21_ter_mapping`.
2. Hitung `ter_base` = jumlah `ter_base_components` dikurangi `ter_base_exclusions`; jika key tidak ada, gagal `ERR_POLICY_RULE_VIOLATION` (bukan default 0).
3. Cari lapisan tarif efektif ($R_{\text{ter}}$) pada `pph21_ter_brackets[category]` di mana $\text{ter\_base} \le \text{max\_gross}$ pertama yang terpenuhi.
4. Hitung potongan pajak PPh 21 bulanan:
   $$T_{\text{pph21}} = \text{RoundHalfUp}(\text{ter\_base} \times R_{\text{ter}},\; 2)$$
5. Simpan `ter_base` sebagai `taxable_income` dan `applied_ter_rate` di breakdown. Gunakan basis yang sama untuk lookup dan perkalian.

### Tahap 4: Penghasilan Bersih (*Net Take-Home Pay*) & Snapshot Audit
$$P_{\text{net}} = G - B_{\text{total}} - T_{\text{pph21}}$$

Hasil perhitungan beserta parameter perantara wajib disimpan ke kolom `payroll.items.calculation_breakdown` dengan format berikut agar tim audit dan karyawan dapat menelusuri setiap Rupiah potongan:

```json
{
  "policy_version_tag": "v2026.11.01",
  "ptkp_status": "K/1",
  "ter_category": "CATEGORY_B",
  "applied_ter_rate": "0.0200",
  "ter_base": "11000000.00",
  "gross_components": {
    "base_salary": "9000000.00",
    "fixed_allowance": "2000000.00",
    "variable_allowance": "0.00",
    "overtime_pay": "0.00",
    "agent_commission": "0.00",
    "unpaid_leave_deduction": "0.00",
    "absence_deduction": "0.00"
  },
  "deduction_components": {
    "bpjs_kesehatan": "110000.00",
    "bpjs_jht": "220000.00",
    "bpjs_jp": "100423.00",
    "pph21_tax": "220000.00"
  },
  "employer_components": {
    "bpjs_kesehatan": "440000.00",
    "bpjs_jht": "407000.00",
    "bpjs_jp": "200846.00",
    "bpjs_jkk": "26400.00",
    "bpjs_jkm": "33000.00"
  },
  "net_take_home_pay": "10349577.00",
  "rounding_adjustment": "0.00"
}
```

---

## 4. Mesin Deteksi Anomali & Benturan Kepentingan Lintas-Domain

Setiap kali pengajuan klaim baru masuk atau dimodifikasi, `analytics-worker-go` menjalankan pemindaian silang terhadap seluruh baris aktif di `payroll.personnel` menggunakan hash SHA-256 yang telah diberi *server-side pepper*:

| Kode Konflik (`conflict_type`) | Kondisi Pencocokan SQL | Tingkat Keparahan | Dampak Sistemik |
| :--- | :--- | :--- | :--- |
| `SHARED_NIK_IDENTITY` | `claims.submissions.claimant_nik_hash = payroll.personnel.nik_hash AND claims.submissions.tenant_id = payroll.personnel.tenant_id` (dengan `personnel_type = 'SALES_AGENT'`) | `CRITICAL` | Menandai indikasi agen mengajukan klaim atas nama dirinya sendiri (*self-dealing*). |
| `SHARED_BANK_ACCOUNT` | `claims.submissions.bank_account_hash = payroll.personnel.bank_account_hash AND claims.submissions.tenant_id = payroll.personnel.tenant_id` | `CRITICAL` | Menandai indikasi pencairan klaim nasabah diarahkan ke rekening bank milik karyawan internal atau agen perusahaan. |
| `MULTI_CLAIM_SAME_ACCOUNT` | Ditemukan $\ge 3$ klaim berbeda dalam $30\text{ hari}$ dengan `bank_account_hash` identik pada tenant yang sama | `HIGH` | Menandai pola pemecahan klaim (*claim splitting*) untuk menghindari batas eskalasi Level 1. |

Setiap kecocokan akan disimpan secara idempoten ke `analytics.anomaly_flags` dan otomatis mengubah klaim ke status `COMPLIANCE_REVIEW` jika severity `CRITICAL`. `COMPLIANCE_ADMIN` mencatat review (`compliance_reviewed_by`/`compliance_reviewed_at` + resolusi flag); review ini bukan approval transaksi. `FINANCE_MANAGER` baru boleh menyetujui setelah review tercatat; jika belum, endpoint mengembalikan `409 ERR_COMPLIANCE_REVIEW_PENDING`.

---

## 5. Mesin Simulasi *"What-If"* untuk Analis MIS (`WHAT_IF_SIMULATION_RUN`)

Ruang simulasi memungkinkan `MIS_ANALYST` menguji dampak finansial dari perubahan aturan kebijakan sebelum disahkan ke produksi.

### Alur Eksekusi Terisolasi di `analytics-worker-go`
1. **Input Simulasi:** Analis memilih `base_policy_version_id`, memodifikasi salinan JSON aturan (`simulated_rules_payload`), serta menentukan rentang tanggal historis (`target_period_start` hingga `target_period_end`).
2. **Pembacaan Data Historis (*Read-Only Snapshot*):** Pekerja Go membaca seluruh transaksi aktual pada rentang tanggal tersebut menggunakan transaksi database `BEGIN TRANSACTION READ ONLY`.
3. **Evaluasi Ulang (*Counterfactual Replay*):**
   * **Untuk Simulasi Klaim:** Menghitung ulang berapa banyak pengajuan historis yang berubah jalur eskalasinya (Level 1 vs Level 2) dan menghitung selisih proyeksi pencairan apabila aturan kelayakan diubah.
   * **Untuk Simulasi Payroll/Komisi:** Menghitung ulang seluruh item penggajian historis menggunakan `simulated_rules_payload` (misalnya simulasi kenaikan tarif komisi agen atau penyesuaian tunjangan) untuk mendapatkan total biaya simulasi ($C_{\text{sim}}$).
4. **Kalkulasi Varians & Penyimpanan:**
   $$\Delta_{\text{amount}} = C_{\text{sim}} - C_{\text{actual}}$$
   $$\Delta_{\text{pct}} = \left(\frac{C_{\text{sim}} - C_{\text{actual}}}{C_{\text{actual}}}\right) \times 100$$
   Hasil disimpan ke `analytics.what_if_simulations` tanpa menyentuh tabel operasional di skema `claims` maupun `payroll`.

---

## 5A. PPh 21 Tahunan & Rekonsiliasi

TER bulanan hanyalah *withholding*. Kewajiban tahunan dihitung ulang dengan tarif progresif:

```text
net_income = annual_gross
           - biaya_jabatan (rate × annual_gross, dibatasi max)
           - deductible_contributions (sesuai policy; contoh JHT/JP karyawan)

pkp = max(0, net_income - ptkp_amount)
annual_tax = Σ_i max(0, min(pkp, upper_i) - lower_i) × rate_i
difference = annual_tax - ter_credits
```

Dengan `lower_i` = `upper_{i-1}` (0 untuk bracket pertama), bukan lookup first-match. Bracket wajib kontinu dan berakhir di `max_pkp` tak terhingga.

Aturan:
1. `ptkp_amount` diambil dari `ptkp_amounts[ptkp_status]`.
2. `annual_gross` = jumlah gross bulanan + bonus/THR yang tercatat.
3. `ter_credits` = jumlah PPh 21 yang sudah dipotong bulanan.
4. `difference > 0` → kurang bayar; potong pada periode yang ditentukan policy (default Desember/Januari).
5. `difference < 0` → lebih bayar; refund/credit sesuai policy; jangan membuat net negatif tanpa aturan eksplisit.
6. Simpan di `payroll.tax_reconciliations`; **jangan menimpa** `payroll.items` bulanan.
7. Posting selisih dilakukan melalui **batch `CORRECTION` baru** yang terhubung ke `settlement_batch_id`/`settlement_item_id` (atau `reconciliation_id` pada item), bukan dengan mengubah baris bulanan. Payslip koreksi dirender dari batch tersebut.
8. Semua komponen deductible dan tarif berasal dari policy; jangan mengasumsikan aturan hukum.

**Disclaimer:** Parameter pajak dapat berubah. Policy version adalah SSOT; verifikasi dengan konsultan pajak sebelum pelaporan nyata.

## 5B. BPJS Employer & Laporan Bulanan

Selain potongan karyawan, payroll mencatat kontribusi employer:

```text
kesehatan_er = min(bpjs_wage_base, kesehatan_salary_cap) × kesehatan_employer_rate
jht_er       = min(bpjs_wage_base, jht_salary_cap) × jht_employer_rate
jp_er        = min(bpjs_wage_base, jp_salary_cap) × jp_employer_rate
jkk_er       = bpjs_wage_base × jkk_rate_by_risk_class[personnel.risk_class]
jkm_er       = bpjs_wage_base × jkm_rate
```

Aturan:
1. `bpjs_wage_base` berasal dari `bpjs_wage_base_components` policy; jangan memakai seluruh gross.
2. Employer contribution **tidak** mengurangi net karyawan.
3. Disimpan di `payroll.items` dan direkap di `payroll.tax_reports` (`BPJS_MONTHLY`).
4. Laporan memuat employee + employer per komponen, headcount, dan total.
5. JKK bersifat risk-based; rate berasal dari policy, bukan konstanta.
6. Untuk `SALES_AGENT` non-karyawan, kontribusi mengikuti policy (default 0) dan tidak diasumsikan.

## 5C. Payslip & Integritas Laporan

1. Payslip dirender dari `payroll.items.calculation_breakdown`, bukan dihitung ulang.
2. Hanya dibuat setelah batch `APPROVED`/`DISBURSED`.
3. Setiap payslip/laporan memiliki `snapshot_hash_sha256` (hash data canonical) dan `file_checksum_sha256` (hash file); regenerate membuat versi baru (`version + 1`, `supersedes_id`).
4. Generate ulang untuk snapshot data yang sama harus menghasilkan `snapshot_hash` yang sama. `file_checksum` boleh berbeda karena metadata file; perbedaan snapshot wajib diinvestigasi.
5. Akses unduhan memakai signed URL TTL pendek + audit (`actor`, `tenant`, `report_id`, `timestamp`).
6. Laporan tidak boleh memuat NIK/rekening penuh; gunakan masked.
7. Total laporan harus sama dengan jumlah item setelah pembulatan; selisih pembulatan dicatat eksplisit.

## 5D. Payment State Machine

```text
PENDING → PROCESSING → PAID
                     ↘ FAILED → (retry eksplisit) → PROCESSING
PAID → REVERSED (hanya via reversal resmi + audit)
```

Aturan:
1. `PAID` hanya ditulis oleh handler provider/mock setelah verifikasi signature dan status terminal.
2. Retry dengan idempotency key yang sama mengembalikan hasil yang sama; tidak membuat payment baru.
3. Retry dengan key berbeda untuk batch/personel yang sama ditolak oleh unique constraint.
4. `FAILED` tidak otomatis di-retry; butuh aksi eksplisit dan audit.
5. `REVERSED` memerlukan alasan, approver, dan audit; tidak menghapus payment asli.
6. Webhook provider wajib idempotent dan tahan replay.
7. Untuk payroll, state per item disimpan di `payroll.payments`; batch menjadi `PARTIAL` jika ada item `FAILED` dan tidak boleh menjadi `DISBURSED`. Partial unique `(tenant_id, batch_id, personnel_id) WHERE status IN ('PENDING','PROCESSING','PAID')` mencegah payment aktif kedua meski idempotency key berbeda.

## 5E. Tenant Policy Scoping

1. Policy version dimiliki tenant: unique `(tenant_id, domain, version_tag)`.
2. Hanya satu `ACTIVE` per `(tenant_id, domain)`.
3. Publish memerlukan dual control: `published_by` (pembuat draf) dan `approved_by` (checker kedua) harus berbeda; publish tanpa checker ditolak.
4. Transaksi mengikat `policy_version_id` + `tenant_id`; policy tenant lain tidak boleh dipakai.
4. Super-admin platform (jika ada) memakai jalur terpisah dan audit; bukan `COMPLIANCE_ADMIN` tenant.
5. Perubahan policy tidak boleh mengubah transaksi lama; replay selalu memakai versi terikat.

## 5F. Attendance, Leave & Proration

1. **Proration** untuk join/termination di tengah periode:
   - `proration_basis = working_days`: `base_salary × present_days / working_days`.
   - `proration_basis = calendar_days`: `base_salary × active_days / days_in_month`.
2. **Unpaid leave**: `daily_rate × unpaid_leave_days`; `daily_rate` dari policy (base/working_days atau base/30).
3. **Overtime**: `overtime_hours × hourly_rate × multiplier`; batas `max_overtime_hours_per_month` dari policy; lebih dari batas → flag, bukan otomatis dibayar.
4. **Leave approval**: `decided_by !== personnel.user_id` (bandingkan user, bukan `personnel_id`); alasan wajib untuk reject; audit.
5. **Absensi** hanya ringkasan; clock-in/out dan shift scheduling adalah future development.
6. Jika data absensi hilang, jangan default 0; tandai `MISSING_ATTENDANCE` dan minta konfirmasi HR.

## 5G. Matriks Uji Wajib

Uji U-01..U-20 dan I-01..I-16 didefinisikan di `docs/10-testing-and-quality-strategy.md` dan `.opencode/skills/aletheia-finance/SKILL.md`. Setiap perubahan formula wajib menambah/menjaga test batas.

## 6. Batasan Keras Logika Bisnis untuk Agen OpenCode

> **Instruksi Wajib bagi Seluruh Agen Pengembangan:**
> 1. **Presisi Desimal Eksak:** Dilarang keras menggunakan tipe `float64` di Go atau `number` bawaan JavaScript untuk operasi perkalian, pembagian, dan penjumlahan uang/pajak. Wajib menggunakan `shopspring/decimal` di Go dan `decimal.js` di TypeScript.
> 2. **Pengujian Unit Deterministik Wajib:** Mesin kalkulasi PPh 21, BPJS, komisi agen, dan skor risiko wajib memiliki minimal **15 kasus uji unit terautomasi** (termasuk kasus batas atas plafon BPJS, batas lapisan TER, dan kasus benturan rekening karyawan-klaim) yang lolos $100\%$ sebelum layanan dikompilasi.
> 3. **Isolasi Transaksi Simulasi:** Fungsi eksekusi `WHAT_IF_SIMULATION_RUN` pada pekerja Go wajib membuka koneksi dengan opsi `pgx.TxOptions{AccessMode: pgx.ReadOnly}` saat membaca data historis agar secara fisik mustahil mengubah data produksi.
> 4. **Transparansi Penolakan & Kalkulasi:** Setiap penolakan otomatis akibat aturan kebijakan wajib menyertakan referensi `policy_version_tag` dan parameter yang dilanggar di dalam payload error API.
>
> 5. **Rekonsiliasi Tahunan Tidak Menimpa Bulanan:** PPh 21 tahunan dihitung dengan tarif progresif + PTKP + kredit TER; hasil disimpan terpisah. Dilarang mengubah `payroll.items` bulanan.
>
> 6. **BPJS Employer Terpisah:** Kontribusi employer dihitung dan dilaporkan, tetapi tidak mengurangi net karyawan. JKK/JKM tidak boleh dianggap nol tanpa policy.
>
> 7. **Payment State Machine:** `PAID` hanya dari provider/mock; `FAILED` tidak auto-retry; `REVERSED` butuh alasan + approver + audit. Dilarang mengubah status payment secara manual.
>
> 8. **Policy per Tenant:** Policy version terikat tenant. Dilarang memakai policy tenant lain atau mengubah transaksi lama saat policy baru diterbitkan.
>
> 9. **Checksum Laporan:** Payslip/laporan wajib memiliki checksum dan versi; regenerate tidak boleh menimpa. Total laporan harus rekonsiliasi dengan item.