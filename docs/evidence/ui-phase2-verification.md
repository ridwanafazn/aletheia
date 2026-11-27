# UI Phase 2 — Role-Based Insight Home

- **Tanggal:** 27 November 2026.
- **Commit:** `2d46589` (`feat(web): add role-based overview for phase 2`).
- **Lingkungan:** lokal, Vite `5173`, Chromium Playwright.
- **Data:** sintetis.

## 1. Tujuan

Mengubah Ikhtisar dari dashboard generik menjadi home yang membaca pekerjaan tiap peran. Urutannya action-first: apa yang perlu diputuskan, lalu satu fokus utama, metrik pendukung, satu insight chart, dan tabel detail. Tidak ada empat kartu metrik setara tanpa hierarki.

## 2. Home per peran

| Peran | Lensa | Fokus utama | Detail |
| --- | --- | --- | --- |
| Claims Officer | `Lensa Petugas Klaim` | Klaim perlu dilengkapi | Status klaim dan klaim terbaru |
| Branch Manager | `Lensa Manajer Cabang` | Keputusan menunggu | Status klaim dan klaim terbaru |
| Finance Manager | `Lensa Manajer Keuangan` | Payroll perlu tindakan | Tren payroll dan kinerja cabang |
| HR Specialist | `Lensa Spesialis SDM` | Batch payroll perlu diselesaikan | Tren payroll dan batch terbaru |
| Compliance Admin | `Lensa Administrator Kepatuhan` | Review kepatuhan | Status klaim dan aktivitas audit |
| MIS Analyst | `Lensa Analis MIS` | Approval rate | Tren payroll dan kinerja cabang |

Employee tetap memakai Ruang Saya sebagai home.

## 3. Hierarki yang diterapkan

1. **Page header** — sapaan, lensa peran, tanggal, dan dua aksi cepat.
2. **Perlu tindakan / Sinyal analisis** — antrean dengan jumlah dan link, ditampilkan sebelum metrik.
3. **Fokus utama** — satu angka besar dengan konteks dan CTA, dipasangkan sama tinggi dengan antrean.
4. **Metrik sekunder** — tiga metrik dalam satu strip, bukan tiga kartu terpisah.
5. **Insight** — satu chart dengan panel “Apa artinya” yang menjelaskan pesan chart.
6. **Detail** — tabel yang relevan dengan peran, dengan tautan “Lihat semua”.

Empty state, loading skeleton, dan error state tetap tersedia. Chart tanpa animasi masuk agar state final langsung terlihat dan lebih tenang.

## 4. Bukti visual

`docs/evidence/ui-phase2/`:

- `claims-officer.png`
- `branch-manager.png`
- `finance-manager.png`
- `hr-specialist.png`
- `compliance.png`
- `mis-analyst.png`

## 5. Verifikasi

| Gate | Hasil |
| --- | --- |
| `phase2.spec.ts` | **1 passed**; 6 role home, axe 0 serious/critical per peran |
| Full Playwright E2E | **48 passed, 2 skipped** |
| `pnpm verify` | Lulus |
| Build web | **152.3 KB gzip** |
| Typecheck dan lint | Lulus |
| Chart | Bars/area tanpa animasi masuk; empty state saat nilai nol |
| Kontras | `--ink-500` dinaikkan agar teks sekunder tetap AA saat transisi halaman |

## 6. Batasan

- Metrik dihitung dari maksimal 100 klaim/batch terbaru dan data workforce yang tersedia.
- Pencarian data karyawan/klaim/batch belum termasuk; command palette fokus pada halaman dan aksi.
- Tabel mobile untuk pusat slip, laporan, dan workforce tetap Phase 4.
- Branch Manager memakai chart klaim karena belum memiliki akses MIS.
- Belum ada kustomisasi widget atau preferensi susunan home.

## 7. File utama

- `apps/web/src/features/overview/OverviewPage.tsx`
- `apps/web/src/features/overview/charts.tsx`
- `apps/web/src/styles/theme.css`
- `apps/web/e2e/phase2.spec.ts`
- `apps/web/e2e/design-phase2.spec.ts`
