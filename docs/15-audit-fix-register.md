# `15-audit-fix-register.md` — Register Temuan Audit & Perbaikan Kontrak

* **Status Dokumen:** Register audit (*living document*)
* **Auditor:** `architect` (konsistensi dokumen) & `finance-reviewer` (payroll/PPh 21/BPJS)
* **Tanggal pass:** 2026-11-25
* **Tujuan:** melacak setiap BLOCKER/MAJOR, perbaikannya, dan sisa risiko sebelum TASK-01.

## 1. Status

| Status | Arti |
| --- | --- |
| `FIXED` | Dokumen/kontrak sudah diperbaiki; siap diimplementasikan |
| `DEFERRED` | Disepakati di luar milestone (future development) |
| `OPEN` | Belum diputuskan; butuh keputusan pengguna |
| `VERIFY` | Perlu verifikasi eksternal (konsultan pajak/provider) |

## 2. BLOCKER

| ID | Temuan | Perbaikan | Bukti | Status |
| --- | --- | --- | --- | --- |
| A-01 | Kolom payment payroll tidak konsisten (`disbursement_status` vs `payment_status`) | Satu kolom kanonik `payment_status` 5 state; index diperbaiki | `docs/02` §C.3, `docs/11` §3.5 | FIXED |
| A-02 | Tidak ada constraint yang mencegah payment kedua dengan idempotency key berbeda | Partial unique `(tenant_id, entity_id) WHERE status IN ('PENDING','PROCESSING','PAID')`; payment intent per service | `docs/02` §B.4/§C.9, ADR-015 | FIXED |
| A-03 | ADR-014 tidak menjelaskan kepemilikan payment payroll/webhook | `claims.disbursements` + `payroll.payments`; webhook per service; `GET /payments/:id` dihapus | ADR-014/015, `docs/03` §D.4 | FIXED |
| A-04 | Audit chain bisa dibypass via `INSERT` langsung; hash sirkular | `SECURITY DEFINER` + `EXECUTE` only; canonical JSON RFC 8785; genesis hash; actor sistem | ADR-016, `docs/02` §5A, `docs/08` §10 | FIXED |
| A-05 | PTKP enum hanya 5 status | 8 status + `CHECK` | `docs/02` §C.1 | FIXED |
| A-06 | Cache key policy/KPI/claim tidak memuat tenant | Format kanonik `aletheia:<domain>:<tenant>:...` | `docs/03` §7, `docs/09` §13 | FIXED |
| A-07 | MV analytics tidak mendukung RLS, berpotensi bocor lintas tenant | `tenant_id` + security barrier view `analytics.v_mis_monthly_kpi`; refresh debounce | ADR-017, `docs/02` §D.3, `docs/03` §5 | FIXED |
| A-08 | GraphQL `matchedPersonnel*` non-null padahal nullable | Field dibuat nullable + `matchedClaimNumber` | `docs/03` schema GraphQL | FIXED |
| A-09 | Rekonsiliasi tahunan tidak punya jalur posting | `settlement_batch_id`/`settlement_item_id`, `reconciliation_id`, batch `CORRECTION` | `docs/02` §C.8, `docs/04` §5A, `docs/11` §4.5 | FIXED |
| A-10 | Klaim bisa di-approve sebelum risk scan selesai | `RISK_PENDING` + `risk_evaluated_at` + `COMPLIANCE_REVIEW`; error 409 | ADR-018, `docs/02` §B.1, `docs/04` §2A | FIXED |

## 3. MAJOR — Payroll/Finance

| ID | Temuan | Perbaikan | Status |
| --- | --- | --- | --- |
| F-01 | Tenant policy isolation (unique/active/cache) | Unique `(tenant_id, domain, version_tag)`, partial active per tenant, cache tenant | FIXED |
| F-02 | Payroll disbursement state machine tidak durable | `payroll.payments` + attempt/conditional transition | FIXED |
| F-03 | Base TER kontradiktif (gross vs taxable) | `ter_base` tunggal untuk lookup & multiplication | FIXED |
| F-04 | Gross formula tidak konsisten | Satu formula: base + fixed + variable + overtime + commission − unpaid/absence | FIXED |
| F-05 | Komisi tanpa sumber `verified_sales` | `payroll.sales_achievements` + `commission_mode` | FIXED |
| F-06 | `progressive()` tidak didefinisikan | Formula marginal eksplisit; `max_pkp` | FIXED |
| F-07 | Rekonsiliasi tanpa policy/settlement/SoD | `policy_version_id`, settlement link, `posted_by` SoD, partial unique POSTED | FIXED |
| F-08 | Checksum payslip/report kontradiktif | Pisahkan `snapshot_hash` (stabil) dan `file_checksum` (file) | FIXED |
| F-09 | BPJS base seluruh gross; employer rate duplikat | `bpjs_wage_base_components`, `jht_salary_cap`, JKK risk map, satu sumber rate | FIXED |
| F-10 | SoD payroll approval tidak ditegakkan | `approved_at`, `CHECK approved_by <> created_by`, endpoint approve terpisah | FIXED |
| F-11 | TER ladder terpotong (10% → 15%) | Ditandai demo-only + validator publish wajib lengkap | FIXED (dengan validator) |
| F-12 | Policy key hilang/hardcoded fallback | Key ditambahkan (`ter_base`, `bpjs_wage_base`, `commission_mode`, `negative_net_policy`, dll.) | FIXED |
| F-13 | Proration drift 4-desimal | Simpan `proration_days`/`basis`, hitung sekali | FIXED |
| F-14 | Gross/BPJS negatif saat unpaid > working days | `CHECK` upper bound + gross >= 0; net via policy | FIXED |
| F-15 | Report totals free-form/nullable checksum | Kolom total terketik + `CHECK READY` + delta | FIXED |
| F-16 | Satu koreksi per bulan; THR ambigu | `correction_seq`; THR future/out-of-scope | FIXED |
| F-17 | PTKP enum tidak lengkap | 8 status + `CHECK` | FIXED |
| F-18 | Overtime flat 1.5× | Key first/subsequent/rest-day | FIXED |
| F-19 | JKK single rate | `jkk_rate_by_risk_class` + `risk_class` | FIXED |

## 4. MAJOR — Architecture/Process

| ID | Temuan | Perbaikan | Status |
| --- | --- | --- | --- |
| X-01 | Role 5 vs 6 | Pisahkan Branch/Finance Manager; 6 role kanonik | FIXED |
| X-02 | Status `RETURNED` tidak ada | Ditambahkan + transisi revisi | FIXED |
| X-03 | Batch tanpa status partial/rejected/cancelled | Enum diperluas | FIXED |
| X-04 | Approve+disburse digabung | Endpoint terpisah + SoD | FIXED |
| X-05 | `/personnel` vs `/employees` | `/employees` kanonik; alias deprecated | FIXED |
| X-06 | Tidak ada draft/submit/revisi klaim | `POST /claims` draft, `PATCH`, `POST /submit` | FIXED |
| X-07 | HMAC tidak menandatangani method/path/body | Signature diperluas + `X-Body-Sha256` | FIXED |
| X-08 | Format idempotency key tidak konsisten | Format kanonik `aletheia:idem:<tenant>:<user>:<method>:<path>:<key>` | FIXED |
| X-09 | Manifest tabel tidak eksplisit `tenant_id` | Template wajib + aturan global | FIXED |
| X-10 | `branches.monthly_disbursement_cap` di luar policy | `cap_policy_version_id` + cache policy | FIXED |
| X-11 | Cross-tenant 403 membocorkan keberadaan | 404 `ERR_NOT_FOUND`; 403 hanya role | FIXED |
| X-12 | `approval_steps` bisa duplikat per level | Partial unique keputusan final | FIXED |
| X-13 | `tax_reconciliations` bisa multiple POSTED | Partial unique POSTED | FIXED |
| X-14 | `uuidv7()` tidak ada di PG16 | Wajib generator aplikasi | FIXED |
| X-15 | Test ID U/I bertabrakan | Registry kanonik di `docs/10`; doc 05/06 diselaraskan | FIXED |
| X-16 | Gate TASK-05/06/12 salah | Gate dipindahkan; `packages/payments` di TASK-02 | FIXED |
| X-17 | MV refresh per approval membebani free-tier | Debounce 5 menit per tenant | FIXED |
| X-18 | Job matrix tanpa job post/ID | `docs/13a` + ID J1/J2 + status N/A | FIXED |
| X-19 | RLS timing kontradiktif | Policy di TASK-03; audit di TASK-15 | FIXED |
| X-20 | MFA opsional vs wajib | Wajib untuk privileged di produksi + schema/endpoint | FIXED |
| X-21 | Policy publish tanpa dual control | `approved_by` + endpoint approve | FIXED |
| X-22 | Anomaly enum `AGENT_SELF_CLAIM` tidak dihasilkan | Dihapus dari enum | FIXED |
| X-23 | Compliance review tanpa status | `COMPLIANCE_REVIEW` + review fields + gate | FIXED |

## 5. Sisa Risiko / Verifikasi

| Item | Status | Catatan |
| --- | --- | --- |
| Tabel TER lengkap | VERIFY | Contoh dipotong; validator publish wajib menolak tabel tidak lengkap. Verifikasi tarif resmi dengan konsultan. |
| Parameter pajak/BPJS | VERIFY | Semua angka contoh; policy version adalah SSOT, bukan nasihat pajak. |
| Provider pembayaran nyata | VERIFY | Mock untuk demo; Xendit/Midtrans butuh KYC dan sandbox. |
| Full HRIS (absensi, shift, THR) | DEFERRED | Di luar milestone; lihat `docs/11` §10. |
| Bukti implementasi domain | PARTIAL | M1.1–M1.3, M2.1–M2.3, M3.1–M3.4, M4, M5.1, M5.2, dan M5.3 terverifikasi. Sisa UI payslip dan laporan, serta deploy production. |
| Audit ulang setelah implementasi | OPEN | Jalankan `architect` + `finance-reviewer` sebelum rilis. |
| Retry dan batch `FAILED` | FIXED | Retry Finance membuat payment `attempt_no` baru untuk item `FAILED` atau `REVERSED`, lalu menyinkronkan status batch. |
| QStash dan worker live | VERIFY | Signature, handler, dan replay teruji. Token QStash demo belum aktif sehingga event live dikirim manual. |
| I-08 payslip versus item | FIXED | `payroll.payslips` menyimpan gross dan net; integration test memastikan total net payslip sama dengan item. |
| Form create/edit karyawan | DEFERRED | API tersedia, tetapi UI masih direktori baca dan drawer profil. Perubahan kompensasi tetap melalui alur HR terkontrol. |
| Penyimpanan berkas di database | DEFERRED | Payslip dan laporan disimpan pada `payroll.generated_files` untuk demo gratis. Produksi sebaiknya memakai object storage. |
| Batch koreksi rekonsiliasi | DEFERRED | Selisih tahunan dicatat dan diposting pada `tax_reconciliations`; pembuatan batch `CORRECTION` otomatis belum dibuat. |
| Provider Xendit dan Midtrans | OPTIONAL | Adapter interface tersedia, tetapi hanya `MOCK` yang dikonfigurasi. |
| What-If tanpa QStash | VERIFY | Respons `QUEUED` dengan `enqueued=false`; UI menampilkan peringatan bahwa event tidak dikirim. Worker sudah teruji menerima event bertanda tangan secara manual. |
| Invalidasi cache KPI | FIXED | Cache 300 detik, header `x-cache`, dan endpoint invalidasi per tenant. Refresh MV belum memanggil invalidasi otomatis. |
| Aksesibilitas grafik MIS | FIXED | Grafik memiliki ringkasan teks dan tabel data alternatif; axe 0 serious pada desktop dan mobile. |
| GCM authentication tag MFA | FIXED | Semgrep menemukan tag length tidak eksplisit; cipher dan decipher kini memakai `authTagLength=16` dan validasi panjang tag. |
| RLS runtime service pool | FIXED | Pool service memakai `aletheia_app` dengan tenant binding per request/transaksi; worker Go memakai hook `pgxpool`. Security gate 36/36 dan integration test 27/36/34 lulus dengan RLS aktif. Bukti: `docs/evidence/m5.4-verification.md`. |
| Dependency dan image CVE | FIXED | pnpm audit, Trivy lockfile, Trivy image, dan govulncheck 0 HIGH/CRITICAL. Go dinaikkan ke 1.26.11. |
| OTel histogram bucket | FIXED | Node dan Go histogram memakai boundary detik eksplisit. Sebelumnya boundary default milidetik membuat p95 dashboard terbaca 4,8 detik. |
| Go semconv schema | FIXED | Resource Go memakai schema semconv yang sama dengan SDK untuk menghindari konflik schema URL. |
| CVE golang.org/x/net | FIXED | Trivy image menemukan CVE HIGH pada v0.60.0. Dinaikkan ke v0.62.0; Trivy dan govulncheck bersih. |
| Label Prometheus kardinalitas tinggi | OPEN | Collector 0.140 mengubah seluruh resource attribute menjadi label. Production wajib memakai `resource_constant_labels` atau transform collector agar hanya service dan environment yang menjadi label. |
| Edge span OTLP | ACCEPTED | Edge Workers meneruskan `traceparent` dan mencatat trace ID, tetapi belum mengekspor span. Exporter edge dan RUM ditunda ke TASK-18. |
| E2E bergantung data seed | FIXED | Test klaim memakai ID deterministik dan pencarian klaim konflik lewat API. Bukti: `docs/evidence/m5.3-verification.md`. |
| Payroll E2E tidak deterministik | FIXED | Test final membuat batch koreksi unik, menghitung lewat worker lokal, lalu menyetujui dan mencairkan. Menggantikan test approval opt-in lama. |
| Coverage domain belum diukur | FIXED | `pnpm test:coverage` dengan threshold 90% lines, 90% statements, 90% functions, 85% branches. Hasil 96,26% lines. |
| Flaky E2E | FIXED | Suite penuh 21 test dijalankan dua kali berturut-turut tanpa retry, 21/21 lulus pada kedua run. |
| Secret scanning | FIXED | Gitleaks 8.30.1 tidak menemukan secret; allowlist hanya untuk env lokal dan artifact. |

## 6. Verdict

Seluruh temuan **BLOCKER** dari dua audit sudah dipatch di dokumen dan ADR. Design phase **layak masuk TASK-01** setelah pengguna menyetujui, dengan catatan:

1. Tabel TER/parameter pajak wajib diverifikasi eksternal sebelum produksi.
2. Perlu audit ulang setelah implementasi (bukan hanya dokumen).
3. Bukti (test/load/screenshot/deploy) tetap menjadi penentu skor job matrix.

## 7. Aturan Maintenance

- Setiap temuan baru: tambahkan ID, severity, fix, status.
- Jangan menghapus baris; ubah status dan tautkan ADR/PR.
- `OPEN`/`VERIFY` wajib punya owner dan tanggal review.
- Register ini diperbarui setiap akhir fase.
