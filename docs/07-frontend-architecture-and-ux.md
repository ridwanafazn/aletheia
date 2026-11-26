# `07-frontend-architecture-and-ux.md` — Arsitektur Frontend, Design System & Spesifikasi Layar Aletheia

* **Status Dokumen:** Spesifikasi Frontend & UX (*Single Source of Truth* untuk Agen OpenCode)
* **Stack:** React 19 + TypeScript + Vite + TanStack Router + TanStack Query + Tailwind CSS
* **Target Deploy:** Cloudflare Pages (static SPA)
* **Design Skill:** `impeccable` (wajib dimuat untuk pekerjaan desain/audit/polish)
* **Design References:** `PRODUCT.md`, `DESIGN.md`

## 1. Prinsip Frontend

Aletheia adalah **alat kerja operasional**, bukan landing page. Mode desainnya adalah **Operate**: presisi, tenang, padat, dan dapat dipercaya. Kemewahan visual muncul dari hirarki, tipografi, dan konsistensi — bukan dari animasi berlebihan.

1. **Angka adalah warga kelas satu.** Semua nominal uang rata kanan, memakai tabular numerals, dan tidak pernah dihitung ulang dari string yang sudah diformat.
2. **Konteks sebelum keputusan.** Sebelum approver menekan Approve/Reject, layar wajib menampilkan versi kebijakan, skor risiko, flag benturan, dan ringkasan audit.
3. **Tidak ada kejutan finansial.** Aksi ireversibel memakai konfirmasi eksplisit, menampilkan nominal dan konsekuensi.
4. **Kegagalan harus terbaca.** Setiap layar punya state loading, empty, error, partial, dan permission-denied yang dirancang, bukan spinner kosong.
5. **Aksesibilitas bukan opsional.** Target WCAG 2.2 AA, keyboard-first untuk tabel dan form, focus visible, reduced motion.
6. **Konsistensi di atas preferensi.** Token desain dan komponen bersama; tidak ada warna/ukuran satu-off.

## 2. Struktur Aplikasi (Feature-Sliced Architecture)

```text
apps/web/
├── src/
│   ├── app/                  # bootstrap, router, providers, error boundary
│   ├── pages/                # route-level composition
│   ├── widgets/              # AppShell, DataTable, FilterBar, AuditDrawer
│   ├── features/             # auth, claims, approvals, payroll, reports, mis, policy
│   │   └── <feature>/
│   │       ├── api/          # query/mutation hooks + Zod parsing
│   │       ├── model/        # state, mappers, permissions
│   │       ├── ui/           # feature components
│   │       └── index.ts      # public API of the slice
│   ├── entities/             # claim, personnel, batch, policy, payment, tenant
│   ├── shared/
│   │   ├── api/              # client, interceptors, error envelope
│   │   ├── ui/               # primitives (Button, Input, Dialog, Table)
│   │   ├── lib/              # money, dates, permissions, formatting
│   │   └── config/           # env, routes, feature flags
│   └── styles/               # tokens, globals, Tailwind layers
├── e2e/                      # Playwright
└── public/
```

**Aturan dependency:** `app → pages → widgets → features → entities → shared`. Tidak boleh ada import ke atas. `shared` tidak boleh mengimpor `features`.

## 3. Routing & Otorisasi Layar

| Route | Layar | Peran utama | Data utama |
| --- | --- | --- | --- |
| `/login` | Sign in | semua | email/password + MFA (wajib untuk `COMPLIANCE_ADMIN`/`FINANCE_MANAGER` di produksi) |
| `/claims` | Claims Workbench | `CLAIMS_OFFICER` | daftar klaim, filter status/cabang |
| `/claims/new` | Form klaim | `CLAIMS_OFFICER` | policy aktif, upload dokumen |
| `/claims/:id` | Detail klaim | maker, approver | dokumen, risiko, audit, keputusan |
| `/approvals` | Approval & Escalation Queue | `BRANCH_MANAGER`, `FINANCE_MANAGER` | antrean, badge risiko, SLA |
| `/payroll` | Payroll Console | `HR_SPECIALIST` | batch, periode, status kalkulasi |
| `/payroll/:id` | Detail batch | HR, Finance | item, breakdown, variance, approval |
| `/employees` | Employee & Agent Directory | HR | profil, kontrak, status |
| `/payslips` | Payslip Center | HR, Finance, Compliance | payslip per periode, unduh |
| `/reports` | Reports & Exports | HR, Finance, Compliance | PPh 21, BPJS, bank file |
| `/me` | Ruang Saya | `EMPLOYEE` | profil, slip sendiri, absensi, saldo cuti, e-cuti, e-lembur |
| `/workforce` | Cuti dan Lembur | HR, Branch Manager, Finance | antrean dan keputusan cuti/lembur/reimburse |
| `/organization` | Struktur Organisasi | HR, Branch Manager, Finance, Compliance, MIS | departemen, posisi, personel |
| `/mis` | MIS Intelligence | `MIS_ANALYST` | KPI lintas cabang, tren, what-if |
| `/mis/what-if` | What-If Sandbox | `MIS_ANALYST` | skenario, variance |
| `/policy` | Policy Ledger | `COMPLIANCE_ADMIN` | versi kebijakan, publish |
| `/audit` | Audit Explorer | Compliance, approver | hash chain, filter, verifikasi |
| `/settings` | Tenant & Access | `COMPLIANCE_ADMIN` | user, role, cabang, tenant |

Route guard memeriksa `role`, `branch_id`, dan `tenant_id` dari sesi. Guard UI **bukan** pengganti otorisasi backend; backend tetap menolak.

## 4. State Management

| Jenis state | Alat | Aturan |
| --- | --- | --- |
| Server state | TanStack Query | query key terstruktur; invalidasi setelah mutasi; no optimistic update untuk uang |
| URL state | TanStack Router search params | filter, cursor, tab, sort; shareable dan back/forward-safe |
| Form state | React Hook Form + Zod | validasi client = validasi shared-contracts; error per field |
| Session | memory + HttpOnly refresh cookie | access token tidak disimpan di localStorage |
| UI state | local component state | tidak ada global store untuk hal yang bisa diturunkan |

**Query key convention:**

```ts
["claims", tenantId, { branchId, status, cursor }]
["claim", tenantId, claimId]
["payroll-batch", tenantId, batchId]
["payslips", tenantId, { personnelId, period }]
["mis-kpi", tenantId, { month, branchId }]
["policy", tenantId, domain]
["audit", tenantId, { entityId, cursor }]
```

**Invalidation:** setelah `POST /claims`, invalidasi `claims` dan `claims-pending-count`; setelah `decide`, invalidasi `claim`, `claims`, `approvals`, `audit`; setelah `disburse`, invalidasi `payroll-batch`, `payslips`, `reports`, `mis-kpi`.

## 5. Inventaris Komponen Wajib

| Komponen | Tanggung jawab |
| --- | --- |
| `AppShell` | sidebar per peran, tenant switcher (jika multi-tenant), command palette, user menu |
| `Money` | format IDR, tabular numerals, sign/negative styling, tooltip nilai mentah |
| `DataTable` | sticky header, sort, column visibility, keyset pagination, row selection, empty state |
| `FilterBar` | filter chip, date range, saved view, reset |
| `StatusBadge` | warna status konsisten (draft/submitted/review/escalated/approved/rejected/disbursed) |
| `RiskBadge` | skor 0–100 dengan ambang dari policy, label teks selain warna |
| `ConflictFlag` | tipe konflik, severity, evidence, link ke personel terkait |
| `PolicyVersionChip` | tag versi + tanggal efektif + link ke payload |
| `AuditDrawer` | timeline kontekstual, hash, prev hash, verifikasi |
| `CalculationBreakdown` | rincian gross/deduction/tax, policy tag, rounding |
| `ConfirmDecisionDialog` | alasan wajib, ringkasan nominal, policy, risiko |
| `UploadDropzone` | signed Cloudinary upload, progress, retry, tipe/ukuran |
| `ExportButton` | generate/unduh laporan, tampilkan checksum |
| `EmptyState` | penjelasan + aksi berikutnya, bukan ilustrasi generik |
| `ErrorState` | error code, correlation ID, aksi retry/back |
| `PermissionDenied` | jelaskan peran yang dibutuhkan, jangan bocorkan data |

## 6. Spesifikasi Layar Inti

### 6.1 Claims Workbench (`CLAIMS_OFFICER`)

- Header: cabang, policy aktif, kuota/limit yang relevan.
- Daftar: nomor klaim, nasabah (masked), kategori, nominal, status, risk score, umur klaim.
- Aksi: buat klaim, lanjutkan draft, revisi klaim yang dikembalikan.
- Form: kategori → dokumen wajib muncul dinamis dari policy; upload langsung ke Cloudinary; validasi ukuran 5 MB; simpan draft.
- Submit: tampilkan policy version yang akan diikat, ringkasan dokumen, dan konfirmasi.
- Detail: timeline status, dokumen, risiko, audit, alasan penolakan.

### 6.2 Approval & Escalation Queue (`BRANCH_MANAGER`, `FINANCE_MANAGER`)

- Antrean diurutkan: `ESCALATED` → `UNDER_REVIEW` → `SUBMITTED`, lalu SLA terlama.
- Kolom: klaim, cabang, nominal, risk score, conflict flag, policy, waktu tunggu.
- Panel detail: dokumen, perbandingan nominal vs batas L1/L2, riwayat, audit.
- Keputusan: `APPROVED`/`REJECTED`/`RETURNED`, `approved_amount` (≤ requested), alasan ≥ 15 karakter.
- Guard: tombol nonaktif + alasan jika approver == maker, di luar cabang, di luar batas, `risk_evaluated_at` masih NULL, atau klaim masih `COMPLIANCE_REVIEW`.
- Konflik: tampilkan 409 dan tawarkan refresh; jangan retry otomatis.

### 6.3 Payroll Console (`HR_SPECIALIST`)

- Daftar batch: kode, cabang, periode, status, headcount, total net, policy.
- Buat batch: periode, cabang, policy aktif; cegah duplikasi periode.
- Kalkulasi: progress async, status per item, error yang bisa ditindaklanjuti.
- Detail: tabel item (gross, BPJS, PPh 21, net), variance vs batch sebelumnya, breakdown per orang.
- Aksi: ajukan approval (HR), approve (Finance; `approver != created_by`), disburse (Finance; hanya batch `APPROVED`), lihat audit, ekspor bank file.

> **Status M3.3:** `/payroll` dan `/payroll/:id` sudah berjalan. Pipeline lima tahap, progres kalkulasi dengan polling lima detik, breakdown drawer, varians terhadap batch sebelumnya, create batch, approval, dan pencairan mock sudah tersedia. Ekspor bank file dan payslip menunggu TASK-11.

### 6.4 Employee & Agent Directory (`HR_SPECIALIST`)

- Daftar: kode, nama, tipe (EMPLOYEE/SALES_AGENT), cabang, PTKP, status, rekening masked.
- Profil: data kompensasi, kontrak, status pajak, riwayat payslip.
- Create/edit: NIK dan rekening di-hash + masked; tidak pernah ditampilkan penuh setelah disimpan.

> **Status M3.3:** `/employees` sudah berjalan sebagai direktori baca dengan pencarian, filter, profil, rekening masked, kompensasi, absensi per periode, dan riwayat cuti. Form create dan edit ditunda agar perubahan kompensasi tetap melalui alur HR yang terkontrol.

### 6.5 Payslip Center (`HR_SPECIALIST`, self-service)

- Filter periode, cabang, personel.
- Kartu payslip: gross, potongan, net, policy tag, verification code.
- Unduh PDF; tampilkan checksum; jangan pernah menampilkan NIK/rekening penuh.
- Self-service hanya untuk payslip milik sendiri; backend memverifikasi kepemilikan.

> **Status M6.3:** `/payslips` sudah berjalan. Daftar slip, filter periode dan personel, rincian checksum, serta unduhan PDF bertanda tangan tersedia untuk HR, Finance, dan Compliance. Employee self-service belum termasuk.

### 6.6 Reports & Exports (`HR_SPECIALIST`, `FINANCE_MANAGER`, `COMPLIANCE_ADMIN`)

- Kartu laporan: PPh 21 bulanan, PPh 21 annual, BPJS bulanan, bank transfer file, payroll variance.
- Pilih periode/cabang; generate; tampilkan status `QUEUED/GENERATING/READY/FAILED`.
- Hasil: metadata (generated_at, by, policy, checksum), tombol unduh, audit trail.
- Format: CSV + XLSX untuk rekap; PDF untuk payslip; CSV bank file sesuai template.

> **Status M6.3:** `/reports` sudah berjalan. Pembuatan, daftar, status, checksum, dan unduhan PPh 21 bulanan/tahunan, BPJS bulanan, bank file, serta varians payroll tersedia. Format XLSX belum dibuat.

### 6.7 MIS Intelligence (`MIS_ANALYST`)

- KPI cards: klaim diajukan/disetujui, approval rate, avg turnaround, payroll disbursed, PPh 21, budget utilization, MoM variance.
- Grafik: tren bulanan, per cabang, komposisi kategori klaim, payroll vs cap.
- Filter: bulan, cabang, kategori.
- Drill-down ke daftar klaim/batch (read-only).
- What-If: pilih base policy, ubah parameter, pilih periode historis, jalankan, bandingkan actual vs simulated, variance amount/percentage, impact breakdown.
- Simulasi tidak pernah menulis ke tabel operasional; tampilkan badge "SIMULATION — READ ONLY".

> **Status M4.2:** `/mis` dan `/mis/what-if` sudah berjalan. Dashboard menampilkan KPI per cabang, tren dengan tabel alternatif, drill-down ke klaim dan payroll, serta sandbox komisi side-by-side. Tanpa token QStash, UI menampilkan bahwa event simulasi tidak dikirim.

### 6.8 Policy & Audit Ledger (`COMPLIANCE_ADMIN`)

- Daftar policy: domain, version tag, status, effective date, checksum, publisher.
- Editor JSON: schema validation, diff vs active, preview dampak (opsional), publish dengan konfirmasi.
- Publish: tampilkan versi lama yang akan diarsipkan; satu transaksi atomik.
- Audit explorer: filter domain/entity/actor/date; timeline; detail decision context; verifikasi hash chain.
- Verifikasi: tampilkan status `VALID`/`BROKEN` per rentang; jangan pernah menawarkan edit/delete.

### 6.9 Employee Self-Service dan Workforce Queue (`EMPLOYEE`, HR, Manager)

- `/me`: profil personel, slip gaji sendiri, ringkasan absensi, saldo cuti, form cuti, form lembur, dan riwayat.
- Self-scope selalu berasal dari sesi; UI tidak mengirim `personnel_id` ke endpoint `/api/v1/me/*`.
- `/workforce`: antrean cuti dan lembur dengan filter cabang, aksi setujui/tolak, dan catatan keputusan.
- Maker tidak dapat menyetujui pengajuannya sendiri; UI menampilkan “Menunggu approver lain”.
- Saldo cuti dan status keputusan ditampilkan dengan teks, bukan hanya warna.
- Mobile tetap dapat membaca slip, absensi, dan mengajukan cuti/lembur.

> **Status M6.4:** `/me` dan `/workforce` sudah berjalan. Persetujuan cuti belum otomatis memperbarui `attendance_summaries`; ringkasan absensi masih berasal dari impor HR.

### 6.10 Reimburse dan Struktur Organisasi

- `/me` tab Reimburse: kategori, tanggal, nominal, deskripsi, tautan bukti, unggah Cloudinary, dan riwayat.
- `/workforce` tab Reimburse: antrean, setujui/tolak, dan tombol Bayar untuk Finance.
- `/organization`: kartu departemen, posisi, personel, dan daftar belum ditempatkan. Read-only pada fase ini.
- Reimburse memakai status `PENDING`, `APPROVED`, `REJECTED`, `PAID`; maker tidak dapat menyetujui pengajuannya sendiri.
- Struktur organisasi memakai tabel `departments`, `positions`, dan kolom penugasan pada `personnel`.

## 7. Form & Validasi

- Semua schema berasal dari `packages/shared-contracts`; tidak ada duplikasi Zod di FE.
- Nominal dikirim sebagai string desimal, bukan number; input memakai `inputMode="decimal"` dan parsing eksplisit.
- Validasi tanggal: periode payroll = tanggal 1 bulan berjalan; timezone Asia/Jakarta.
- Upload: validasi tipe (`PDF/JPG/PNG/WEBP`) dan ukuran (≤ 5 MB) sebelum meminta signature.
- Error server dipetakan ke field jika `details` tersedia; jika tidak, tampilkan error envelope + correlation ID.
- Form finansial tidak boleh submit ganda; tombol terkunci selama mutation dan idempotency key dibuat sekali per submit.

## 8. Tabel, Pagination & Performa

- Keyset/cursor pagination `(created_at, id)`; tidak ada `OFFSET` untuk tabel transaksi.
- Virtualisasi hanya jika > 100 baris terlihat; default page size 25/50.
- Sticky header + kolom nominal rata kanan + tabular numerals.
- Filter disimpan di URL; refresh mempertahankan state.
- Skeleton per baris, bukan spinner seluruh halaman.
- Prefetch detail saat hover/focus (dengan debounce) untuk mengurangi latency persepsi.
- Bundle awal < 200 KB gzipped; route-level code splitting; chart library dimuat lazy.

## 9. Design System

Token lengkap ada di `DESIGN.md`. Ringkasan:

- **Warna:** ink/slate untuk teks, surface netral, satu aksen utama (biru-tenang), status: emerald (approved/paid), amber (review/escalated), rose (rejected/failed), slate (draft).
- **Tipografi:** IBM Plex Sans untuk antarmuka, IBM Plex Mono untuk hash dan ID, tabular numerals; skala 12/14/16/20/24/32; berat 400/500/600.
- **Spacing:** skala 4px; kepadatan "compact enterprise" untuk tabel, "comfortable" untuk form.
- **Radius:** 6–8px; hindari pill untuk elemen data.
- **Elevation:** minimal; border + subtle shadow; tidak ada glow.
- **Motion:** 120–180ms, ease-out; hormati `prefers-reduced-motion`; tidak ada animasi pada angka uang.
- **Ikon:** satu set (Lucide), ukuran 16/20; ikon tidak menggantikan label teks untuk aksi kritis.

## 10. Aksesibilitas

- WCAG 2.2 AA: kontras ≥ 4.5:1 untuk teks, 3:1 untuk komponen.
- Fokus terlihat; urutan tab logis; skip link.
- Tabel: `caption`, `scope`, navigasi keyboard, pengumuman perubahan halaman.
- Form: label eksplisit, `aria-describedby` untuk error/help, error summary di atas form.
- Status tidak hanya warna: selalu ada teks/ikon.
- Dialog: focus trap, Escape, restore focus.
- Grafik: alternatif tabel/teks; jangan andalkan warna saja.
- Uji dengan keyboard-only dan screen reader dasar (NVDA/VoiceOver) untuk layar kritis.

## 11. Loading, Empty, Error, Permission

| State | Pola |
| --- | --- |
| Loading awal | skeleton struktur, bukan spinner penuh |
| Refetch | indikator halus di header, data lama tetap terlihat |
| Empty | judul, penjelasan, aksi utama, contoh |
| Error | kode error, correlation ID, retry, bantuan |
| Partial | tampilkan bagian yang berhasil + banner bagian yang gagal |
| Permission denied | jelaskan peran yang dibutuhkan, tautan minta akses |
| Conflict (409) | jelaskan data berubah, tombol refresh, jangan retry otomatis |
| Offline | banner, nonaktifkan mutasi, antrekan hanya draft non-finansial |

## 12. Internasionalisasi & Copy

- UI berbahasa Indonesia; kode, nama variabel, dan dokumentasi teknis berbahasa Inggris.
- Format mata uang `id-ID`, tanggal `dd MMM yyyy`, waktu `HH:mm` dengan timezone Asia/Jakarta.
- Istilah konsisten: "Pengajuan Klaim", "Persetujuan", "Pencairan", "Gelombang Payroll", "Versi Kebijakan", "Jejak Audit".
- Copy error tidak boleh membocorkan stack trace, SQL, NIK, atau rekening.
- Nada: tenang, faktual, tidak menyalahkan pengguna.
- Gaya korporasi: kalimat langsung, satu ide per kalimat, tanpa tanda kurung, tanpa ampersand, tanpa emoji, tanpa tanda seru.
- Gunakan "dan" untuk menghubungkan dua hal. Jangan memakai simbol ampersand di teks antarmuka.
- Hindari jargon marketing seperti "seamless", "unlock", "empower", atau "supercharge".

## 13. Alur Desain dengan `impeccable`

1. Muat skill `impeccable`.
2. Jalankan langkah `context` sekali per sesi.
3. Baca `PRODUCT.md` dan `DESIGN.md`.
4. Untuk layar baru: ikuti `reference/new-work.md`; untuk kritik: `critique`; untuk polish: `polish`.
5. Periksa hasil render di desktop (1440), tablet (1024), mobile (390).
6. Simpan keputusan desain dan token baru di `DESIGN.md`.
7. Jalankan axe + keyboard walkthrough sebelum menyatakan selesai.

## 14. Kriteria Penerimaan Frontend

- [ ] Semua route di atas memiliki guard peran dan state lengkap.
- [ ] Tidak ada perhitungan uang di komponen; semua nominal dari API string desimal.
- [ ] Setiap layar finansial menampilkan policy version dan/atau audit context.
- [ ] Tabel transaksi memakai cursor pagination.
- [ ] Bundle awal < 200 KB gzipped; route splitting terverifikasi.
- [ ] WCAG 2.2 AA untuk layar kritis; axe tanpa pelanggaran serius.
- [ ] Playwright smoke untuk login, klaim, approval, payroll, payslip, report, MIS.
- [ ] Screenshot desktop + mobile untuk setiap layar di `docs/assets/`.
- [ ] Tidak ada PII mentah di UI, console, atau network log.

## 15. Batasan Keras Frontend untuk Agen

> 1. Dilarang mendefinisikan ulang tipe/DTO dari `packages/shared-contracts`.
> 2. Dilarang menyimpan access token di `localStorage`/`sessionStorage`; gunakan memory + refresh HttpOnly.
> 3. Dilarang melakukan aritmatika uang di browser; tampilkan nilai dari server.
> 4. Dilarang menampilkan NIK/rekening penuh; hanya `*_masked`.
> 5. Dilarang menyembunyikan aturan backend di balik tombol; tampilkan alasan.
> 6. Dilarang memakai `any` untuk payload API; parse dengan Zod.
> 7. Dilarang menambah warna/ukuran di luar token tanpa memperbarui `DESIGN.md`.
> 8. Dilarang mengklaim selesai tanpa memeriksa render dan accessibility.
