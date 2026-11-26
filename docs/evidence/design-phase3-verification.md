# Design Phase 3 — Payroll, Employees, Workforce, Ruang Saya, and Claims

- **Status:** Selesai 27 November 2026.
- **Lingkungan:** lokal, web 5173, edge 8787, payroll 4103, governance 4101, worker 4004.
- **Production saat fase ini:** tidak ada deploy. Deploy production dilakukan 27 November 2026 setelah freeze dicabut; lihat `design-phases-production-deploy.md`.

## 1. Yang dibangun

### Konsol Payroll

- Pipeline status dirapikan: label lebih kecil, angka lebih tegas, dan tanpa shadow berlebih.
- Tabel batch tetap menampilkan kode, cabang, periode, tipe, personel, bruto, net, dan status.
- Angka moneter memakai tabular numerals agar kolom rata.

### Karyawan dan Agen

- Kolom personel memakai avatar inisial, nama, dan kode personel.
- Baris tetap dapat dibuka menjadi drawer; accessible name tombol dipertahankan sebagai nama personel.
- Direktori mengecualikan personel uji beban `LOAD-%`, konsisten dengan Struktur Organisasi.

### Cuti dan Lembur

- Antrean cuti, lembur, dan reimburse memakai avatar inisial plus cabang sebagai metadata.
- Empty state cuti dan lembur tetap jelas saat antrean kosong.
- Tab reimburse menampilkan aksi Setujui/Tolak dan tautan bukti.

### Ruang Saya

- Profil menjadi kartu identitas dengan avatar besar, nama, kode, cabang, dan empat fakta kepegawaian.
- Saldo cuti menjadi kartu dengan progress bar terpakai dan pending, bukan kotak statistik generik.
- Riwayat cuti, lembur, dan reimburse tetap memakai tabel yang sudah ada.

### Klaim

- Kolom nasabah memakai avatar inisial, nama, dan NIK masked.
- Filter, risk meter, status, dan drawer klaim tidak berubah.

### Mobile

- Tab strip membungkus ke baris kedua pada layar sempit, sehingga seluruh tab terlihat tanpa scroll horizontal tersembunyi.
- Kartu profil dan saldo cuti tetap terbaca pada 390 px.

## 2. Verifikasi

```bash
pnpm --filter @aletheia/web typecheck
pnpm --filter @aletheia/web lint
pnpm --filter @aletheia/web build
pnpm test:e2e design-phase3.spec.ts
pnpm test:e2e claims.spec.ts me.spec.ts reimburse-org.spec.ts payroll.spec.ts
pnpm verify
```

Hasil:

| Pemeriksaan | Hasil |
| --- | --- |
| Typecheck | Lulus |
| Lint | Lulus |
| Build | 150,0 KB gzip initial |
| Design phase 3 spec | 1/1 lulus |
| Axe payroll, employees, workforce, reimburse, claims, me, mobile | 0 serious/critical |
| Claims, Me, Reimburse-Org, Payroll E2E | 22 lulus, 1 dilewati |
| Verify | Lulus |

Catatan: putaran pertama `payroll.spec.ts` menemukan accessible name tombol personel berubah menjadi nama + kode. Tombol diberi `aria-label` nama personel, lalu seluruh payroll spec dijalankan ulang dan lulus 5/5.

## 3. Bukti visual

- `docs/evidence/design-phase3/payroll.png`
- `docs/evidence/design-phase3/employees.png`
- `docs/evidence/design-phase3/workforce.png`
- `docs/evidence/design-phase3/workforce-reimburse.png`
- `docs/evidence/design-phase3/claims.png`
- `docs/evidence/design-phase3/me.png`
- `docs/evidence/design-phase3/me-mobile.png`

## 4. Batasan

- Phase 3 hanya frontend dan memakai endpoint yang sudah ada; tidak ada API baru.
- Avatar memakai inisial, belum ada foto personel.
- Pipeline payroll masih ringkasan status; belum ada drilldown per tahap.
- Progress saldo cuti memakai entitlement, terpakai, dan pending; belum memisahkan carry-over.
- Halaman tetap read-only untuk struktur organisasi; CRUD belum ditambahkan.
- Pembersihan data uji beban dan artefak E2E dilakukan hanya pada database demo lokal, bukan bagian dari perubahan aplikasi.

## 5. Langkah berikutnya

1. **Fase 4:** MIS, audit, motion, mobile polish, dan visual regression.
2. Table v2 yang dapat dipakai ulang untuk seluruh daftar operasional.
3. Filter periode dan drilldown untuk pipeline payroll.
4. Evidence final dan pembaruan DESIGN.md setelah seluruh halaman selesai.
