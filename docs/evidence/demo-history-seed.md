# Demo History Seed — 15 Bulan Operasional

- **Tanggal:** 27 November 2026.
- **Commit seed:** `544e54e` (`feat(demo): seed 15 months and add role guides`).
- **Web production saat snapshot:** `21c0a9a`.
- **Web production:** Pages deployment `4509da49-6812-48b2-a147-c42e483edd57`.
- **Lingkungan:** PostgreSQL lokal `55432` dan Neon production; data production sudah diisi.
- **Data:** seluruhnya sintetis.

## 1. Tujuan

Membuat demo Aletheia terlihat seperti sistem yang sudah berjalan **1 tahun 3 bulan** (September 2025–November 2026), bukan hanya satu periode. Seed juga memastikan seluruh divisi memiliki personel dan setiap cabang punya manajer serta petugas klaim.

## 2. Cakupan data

| Entitas | Jumlah | Catatan |
| --- | --- | --- |
| Bulan operasional | 15 | `2025-09` sampai `2026-11` |
| Cabang | 3 | Jakarta HQ, Bandung, Surabaya |
| Departemen | 8 | Finance, HR, Claims, MIS, Compliance, Sales & Agency, Operations, Technology |
| Posisi | 6 | Director, Manager, Supervisor, Officer, Analyst, Specialist |
| User | 12 | Termasuk 3 user tambahan: `officer.jkt`, `manager.jkt`, `manager.sby` |
| Personel | 32 | Semua departemen terisi; 3 branch manager |
| Klaim | 273 | 18 klaim/bulan untuk 3 cabang + fixture baseline |
| Batch payroll | 45 | 15 bulan × 3 cabang |
| Item payroll | 472 | Termasuk komisi agen dan BPJS |
| Payslip | 470 | Satu slip per item yang dibayar |
| Laporan pajak/biaya | 90 | PPh 21 bulanan + invoice biaya payroll per cabang/bulan |
| Attendance | 480 | Ringkasan absensi per personel/bulan |
| Leave/overtime/reimburse | 9 / 8 / 6 | Beberapa masih PENDING untuk antrean HR |
| KPI MIS | 45 | 15 bulan × 3 cabang |

## 3. Distribusi divisi

| Divisi | Headcount |
| --- | ---: |
| Claims Operations | 9 |
| Finance | 5 |
| Human Resources | 4 |
| Management Information | 1 |
| Compliance | 2 |
| Operations | 5 |
| Sales & Agency | 3 |
| Technology | 3 |
| **Total** | **32** |

Setiap divisi memiliki minimal satu personel. Jakarta HQ mengisi Finance, MIS, Compliance, HR, Technology, Operations, Sales, dan Claims; Bandung dan Surabaya mengisi cabang masing-masing.

## 4. Perilaku seed

- **Deterministik:** ID memakai hash dari natural key, sehingga rerun tidak membuat duplikat.
- **Idempotent:** periode yang sudah ada dilewati; fixture E2E (`PAY-SAU-202611-BDG01`, klaim baseline) tidak diubah.
- **Policy-aware:** batch 2025–Oktober 2026 memakai policy payroll historis `v2025.01.01`; November 2026 memakai policy aktif `v2026.11.01`.
- **MIS:** materialized view `analytics.mis_monthly_kpi` di-refresh di akhir seed.
- **Baseline November BDG** sengaja dipertahankan 3 item agar test E2E dan fixture laporan lama tetap valid; personel BDG lainnya muncul di histori Oktober dan sebelumnya.

## 5. Cara menjalankan

Lokal:

```bash
DATABASE_URL="postgresql://aletheia:aletheia@localhost:55432/aletheia" pnpm db:seed
```

Production:

```bash
set -a; source .env.production.local; set +a
pnpm db:seed
```

Seed membutuhkan migrasi terbaru dan policy aktif. Jika database kosong, jalankan `pnpm db:migrate` lebih dulu.

## 6. Verifikasi

| Gate | Hasil |
| --- | --- |
| `pnpm db:check` | 31/31 tabel, 31 RLS policy, 45 KPI rows |
| `pnpm security:audit` | Audit chain SAU valid (52 baris) |
| Distribusi MIS | 15 bulan × 3 cabang |
| Semua divisi terisi | 8/8 |
| Full E2E | **50 passed, 2 skipped** |
| Smoke production | **15/15** |
| Warm Production | `45992431484`, sukses 1m5s |
| Login employee | 200 setelah service hangat; cold start diberi pesan yang jelas |
| Production UI check | Overview, Organization, MIS, Profil, dan payslip 2025-09; 0 console error |
| Bundle | 152.3 KB gzip |

Production DB counts setelah seed: 32 personel, 8 departemen, 273 klaim, 45 batch, 472 item, 470 payslip, 90 laporan, 480 attendance, dan 45 baris KPI. Screenshot ada di `docs/evidence/demo-history/`:

- `production-overview.png`
- `production-organization.png`
- `production-mis.png`
- `production-profile.png`
- `production-payslips-2025-09.png`

## 7. Panduan PDF

Tujuh panduan per peran tersedia di `docs/guides/` dan juga disajikan oleh web production:

- `https://aletheia-web-preview.pages.dev/guides/panduan-petugas-klaim.pdf`
- `https://aletheia-web-preview.pages.dev/guides/panduan-manajer-cabang.pdf`
- `https://aletheia-web-preview.pages.dev/guides/panduan-manajer-keuangan.pdf`
- `https://aletheia-web-preview.pages.dev/guides/panduan-spesialis-sdm.pdf`
- `https://aletheia-web-preview.pages.dev/guides/panduan-administrator-kepatuhan.pdf`
- `https://aletheia-web-preview.pages.dev/guides/panduan-analis-mis.pdf`
- `https://aletheia-web-preview.pages.dev/guides/panduan-karyawan.pdf`

Link unduhan juga muncul di halaman **Profil** sesuai peran yang sedang login.

## 8. Batasan

- Data sintetis; angka pajak/BPJS adalah aproksimasi demo, bukan perhitungan resmi.
- November BDG memakai batch baseline 3 item; personel BDG lain dibayar pada histori Oktober dan sebelumnya.
- Tidak ada data payroll BPUI; tenant BPUI tetap dipakai untuk uji isolasi.
- Seed tidak menghapus data lama. Untuk demo lokal yang bersih, reset database lalu jalankan migrasi + seed.
