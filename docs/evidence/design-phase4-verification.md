# Design Phase 4 — MIS, Audit, Motion, and Mobile Polish

- **Status:** Selesai 27 November 2026.
- **Lingkungan:** lokal, web 5173, edge 8787, payroll 4103, governance 4101, worker 4004.
- **Production saat fase ini:** tidak ada deploy. Deploy production dilakukan 27 November 2026 setelah freeze dicabut; lihat `design-phases-production-deploy.md`.

## 1. Yang dibangun

### MIS Intelligence `/mis`

- Empat KPI cards dengan ikon, nilai tabular, dan sparkline ketika data tren tersedia.
- Strip kesehatan operasional: approval rate, turnaround, utilisasi anggaran, dan varians MoM, lengkap dengan meter untuk metrik persentase.
- Tabel per cabang memakai identitas cabang, meter approval, ikon varians, dan aksi drill-down yang tetap muat pada desktop 1440 px.
- Bila materialized view baru memiliki satu periode, grafik diganti snapshot bulan berjalan. Tren tidak direkayasa dari satu titik data.
- Tabel data tren tetap tersedia melalui “Lihat data tren”.
- Mobile memakai dua kolom KPI, strip kesehatan satu kolom, dan kartu cabang dengan aksi Payroll/Klaim.

### Jejak Audit `/audit`

- Panel integritas menunjukkan status rantai, jumlah catatan yang dimuat, jumlah domain, dan waktu peristiwa terakhir.
- Status berubah dari “Belum diverifikasi” menjadi “Rantai valid” atau “Rantai terputus” setelah verifikasi.
- Filter domain dan ID entitas mendapat aksi “Bersihkan” saat aktif.
- Tabel audit menampilkan waktu terpisah tanggal/jam, aktor dengan avatar, badge domain, chip entitas, dan chip hash dengan nilai lengkap di tooltip.
- Konteks keputusan dibuka inline sebagai definition list, bukan blok JSON mentah.
- Mobile mengganti tabel dengan ledger card yang memuat aksi, waktu, aktor, domain, entitas, hash, dan konteks.

### Motion dan mobile

- Route arrival tunggal 220 ms dengan opacity dan translate 6 px, memakai exponential ease-out.
- `prefers-reduced-motion: reduce` tetap mematikan animasi non-esensial.
- Chip “Kepatuhan aktif” disembunyikan pada layar sangat sempit agar chip paket dan peran tidak terpotong.
- Nilai KPI mobile diperkecil agar nominal Rupiah tidak terpotong elipsis.

### Shared system cleanup

- `Sparkline` dipindah ke `shared/ui`; format compact money/number dipindah ke `shared/lib/format`.
- Overview memakai komponen bersama yang sama, sehingga tidak ada salinan sparkline atau formatter.
- CSS lama `metric-strip` dan `mis-card__code` dihapus setelah tidak lagi dipakai.

## 2. Verifikasi

```bash
pnpm --filter @aletheia/web typecheck
pnpm --filter @aletheia/web lint
pnpm --filter @aletheia/web build
pnpm test:e2e design-phase4.spec.ts
pnpm test:e2e mis.spec.ts a11y.spec.ts design-phase4.spec.ts
pnpm test:e2e claims.spec.ts
pnpm test:e2e design-phase2.spec.ts
pnpm verify
```

Hasil:

| Pemeriksaan | Hasil |
| --- | --- |
| Typecheck | Lulus |
| Lint | Lulus |
| Build | 150,4 KB gzip initial |
| Design phase 4 spec | 2/2 lulus |
| MIS dan What-If E2E | 3/3 lulus |
| Axe MIS, What-If, audit desktop, audit mobile | 0 serious/critical |
| Claims dan audit E2E | 4 lulus, 1 dilewati |
| Design phase 2 regression | 1/1 lulus |
| `pnpm verify` | Lulus |
| Impeccable detector | 0 temuan |

## 3. Bukti visual

- `docs/evidence/design-phase4/mis.png`
- `docs/evidence/design-phase4/mis-mobile.png`
- `docs/evidence/design-phase4/what-if.png`
- `docs/evidence/design-phase4/audit.png`
- `docs/evidence/design-phase4/audit-verified.png`
- `docs/evidence/design-phase4/audit-mobile.png`
- `docs/evidence/design-phase4/audit-mobile-list.png`

## 4. Batasan

- MIS tetap memakai endpoint yang sudah ada; tidak ada API baru.
- Materialized view demo hanya memiliki satu periode, sehingga bukti visual menampilkan snapshot bulan berjalan, bukan grafik multi-bulan.
- Verifikasi audit menghitung seluruh rantai tenant dan dapat memakan waktu pada dataset besar.
- Konteks keputusan bertingkat dirender sebagai JSON string di dalam definition list.
- Baseline visual disimpan sebagai screenshot; belum ada pixel-diff otomatis karena font dan OS runner belum distandardisasi.
- Full E2E suite tidak dijalankan ulang sesuai instruksi.

## 5. Langkah berikutnya

1. Tambah periode historis pada materialized view demo untuk menguji grafik tren multi-bulan.
2. Pertimbangkan filter tanggal audit serta ekspor CSV.
3. Tambah visual regression berbasis container dengan font yang dipin.
4. Setelah desain seluruh halaman stabil, perbarui DESIGN.md dan dokumentasi demo final.
