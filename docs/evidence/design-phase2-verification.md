# Design Phase 2 — Overview, Reports, and Organization

- **Status:** Selesai 27 November 2026.
- **Lingkungan:** lokal, web 5173, edge 8787, payroll 4103, governance 4101.
- **Production:** tidak ada deploy atau request production. Freeze M6.2 tetap aktif.

## 1. Yang dibangun

### Ikhtisar `/overview`

- Hero role-aware dengan sapaan, tanggal, dan aksi cepat.
- KPI cards dengan sparkline: payroll, PPh 21, klaim, approval rate; fallback ke batch/antrean untuk HR dan klaim untuk peran claims.
- Chart payroll 6 bulan dari MIS `misTrend`, atau ringkasan bulan berjalan bila data tren belum cukup.
- Panel “Perlu perhatian” yang hanya menampilkan antrean dengan nilai > 0.
- Tabel kinerja per cabang dari MIS, atau batch/klaim terbaru sesuai peran.
- Navigasi “Ikhtisar” ditambahkan untuk seluruh peran non-karyawan.

### Reports v2

- Panel “Status laporan” dengan donut status dari 100 laporan terbaru.
- Layout create + activity menjadi dua kolom; tabel riwayat tetap full width.
- Donut memakai CSS conic-gradient agar ringan dan tidak menambah chunk chart.

### Organization v2

- Pencarian nama, kode, posisi, atau departemen.
- Grid departemen terisi dengan avatar inisial, posisi, supervisor, dan jumlah personel.
- Departemen tanpa personel dipisahkan menjadi strip ringkas, bukan kartu kosong besar.
- Personel tanpa penempatan tetap terlihat di panel terpisah.

### Charts

- Recharts dipakai untuk area payroll dan bar status klaim.
- Seluruh chart berada di route chunk terpisah; initial bundle tetap **149,9 KB gzip**.

## 2. Verifikasi

```bash
pnpm --filter @aletheia/web typecheck
pnpm --filter @aletheia/web lint
pnpm --filter @aletheia/web build
pnpm test:e2e design-phase2.spec.ts
pnpm test:e2e reports.spec.ts
pnpm verify
```

Hasil:

| Pemeriksaan | Hasil |
| --- | --- |
| Typecheck | Lulus |
| Lint | Lulus |
| Build | 149,9 KB gzip initial |
| Design phase 2 spec | 1/1 lulus |
| Axe overview/reports/organization/mobile | 0 serious/critical |
| Reports E2E | 7/7 lulus |
| Verify | Lulus |

## 3. Bukti visual

- `docs/evidence/design-phase2/overview.png`
- `docs/evidence/design-phase2/reports.png`
- `docs/evidence/design-phase2/organization.png`
- `docs/evidence/design-phase2/overview-mobile.png`

## 4. Batasan

- Overview memakai endpoint yang sudah ada; belum ada aggregate API `GET /api/v1/overview`.
- Angka klaim dihitung dari 100 klaim terbaru, bukan total historis.
- MIS trend saat ini hanya memiliki satu periode, sehingga Overview menampilkan ringkasan bulan berjalan sebagai fallback.
- Organization tetap read-only; belum ada CRUD atau org chart interaktif.
- Chart chunk Recharts sekitar 130 KB gzip dan hanya dimuat saat route yang memakai chart dibuka.

## 5. Langkah berikutnya

1. **Fase 3:** Payroll, Employees, Workforce, Ruang Saya, Claims, table v2, empty/loading states.
2. **Fase 4:** MIS, audit, motion, mobile polish, visual regression, dan evidence final.
3. Setelah itu: aggregate overview API dan filter periode untuk dashboard.
