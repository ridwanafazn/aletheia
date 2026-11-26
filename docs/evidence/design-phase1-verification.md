# Design Phase 1 — Quiet Ledger Foundation

- **Status:** Selesai 27 November 2026.
- **Lingkungan:** lokal, web 5173, edge 8787, payroll 4103.
- **Production:** tidak ada deploy atau request production. Freeze M6.2 tetap aktif.

## 1. Arah

**Quiet Ledger.** Permukaan hangat seperti kertas ledger, tinta gelap, aksen jade untuk aksi, amber untuk peringatan, dan ritme yang lebih lega. Fokus fase ini adalah fondasi visual, bukan redesign alur kerja.

Perubahan utama:

- Font UI pindah ke **Plus Jakarta Sans Variable**; IBM Plex Mono dipertahankan untuk angka, kode, dan pengukuran.
- Token warna, radius, shadow, dan ukuran shell diperbarui di `apps/web/src/styles/tokens.css`.
- Sidebar gelap dengan aksen jade, active state pill, dan hierarki label yang lebih jelas.
- Topbar lebih tinggi, judul halaman lebih tegas, konten memakai kanvas hangat.
- Panel memakai border tunggal tanpa shadow; kartu statistik memakai elevation lembut.
- Tombol, input, badge, chip, tabel, tab, dialog, dan empty state diseragamkan.
- Scrollbar, text selection, placeholder, dan focus ring mengikuti palette baru.
- `DESIGN.md` diperbarui ke arah Quiet Ledger.

## 2. Verifikasi

```bash
pnpm --filter @aletheia/web typecheck
pnpm --filter @aletheia/web lint
pnpm --filter @aletheia/web build
pnpm test:e2e design-phase1.spec.ts
pnpm test:e2e a11y.spec.ts
pnpm test:e2e payroll.spec.ts reports.spec.ts
```

Hasil:

| Pemeriksaan | Hasil |
| --- | --- |
| Typecheck | Lulus |
| Lint | Lulus |
| Build | **149,5 KB gzip** initial JavaScript |
| Design screenshot spec | 1/1 lulus |
| Axe a11y kritis | 2/2 lulus, 0 serious/critical |
| Payroll + reports E2E | 12/12 lulus |

Tidak ada perubahan API, database, atau perilaku workflow pada fase ini.

## 3. Bukti visual

- `docs/evidence/design-phase1/login.png`
- `docs/evidence/design-phase1/payroll.png`
- `docs/evidence/design-phase1/reports.png`
- `docs/evidence/design-phase1/organization.png`
- `docs/evidence/design-phase1/reports-mobile.png`

## 4. Batasan

- Ini baru fondasi. Halaman belum dirombak satu per satu; Organization masih menampilkan kartu departemen kosong dari data demo.
- Dashboard/overview, chart baru, dan table v2 belum masuk fase ini.
- Motion masih minimal; hanya transisi hover/focus dan dialog.
- Beberapa tabel masih mengandalkan horizontal scroll di mobile.
- Belum ada redesign halaman login lanjutan, claims, MIS, atau audit di luar efek token global.

## 5. Langkah berikutnya

1. **Fase 2:** dashboard/overview, Reports v2, Organization v2, KPI cards dengan sparkline, chart lazy-loaded.
2. **Fase 3:** Payroll, Employees, Workforce, Ruang Saya, Claims, table v2 dan empty/loading states.
3. **Fase 4:** MIS, audit, motion, mobile polish, visual regression, dan evidence final.
