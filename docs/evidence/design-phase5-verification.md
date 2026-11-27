# UI Phase 0 — Daylight Workspace Verification

- **Tanggal:** 27 November 2026.
- **Commit:** `cf52a7b` (`feat(web): refresh UI to daylight workspace`).
- **Lingkungan:** lokal, Vite web `5173`, edge `8787`, PostgreSQL `55432`, Chromium Playwright.
- **Data:** sintetis.

## 1. Tujuan

Mengganti lapisan visual Quiet Ledger dengan **Daylight workspace**: HRIS yang terang, tenang, modern, dan mudah dipindai. Phase 0 mencakup fondasi visual, shell, login, halaman profil, logo, dan pass desktop seluruh aplikasi.

## 2. Yang berubah

| Area | Hasil |
| --- | --- |
| Logo | Mark dua bracket cobalt, app icon, dan favicon di `apps/web/public/brand/` |
| Warna | Cobalt `#2F4BD8`, ground `#F6F8FC`, kartu putih ber-border, status teal/amber/merah |
| Tipe | Plus Jakarta Sans dan IBM Plex Mono, numerik tabular |
| Shell | Sidebar terang 252px, dapat diciutkan ke 78px, workspace card, user block |
| Topbar | Breadcrumb, role chip, avatar profil; badge `HRIS Pro` dihapus |
| Profil | `/profile`, dapat dibuka dari avatar topbar dan blok pengguna sidebar; tenant tampil sebagai `SEIHITSU`; kartu dua kolom sama tinggi |
| Login | Panel cobalt diagonal, watermark logo, ilustrasi garis, kartu form mengambang; tanpa input MFA; opsi akun seragam tanpa bento |
| Overview | Header ringan, KPI berwarna, chart baru, antrean keputusan |
| Tabel | Header terang, baris airy, status pill, aksi jelas |
| Mobile | Sidebar drawer; payslip self-service menjadi kartu |
| Charts | Palet cobalt, teal, amber, violet; tooltip terang |

## 3. Bukti visual

Screenshot di `docs/evidence/design-phase5/`:

- `login.png`, `overview.png`, `overview-collapsed.png`, `overview-mobile.png`
- `payroll.png`, `employees.png`, `employees-mobile.png`
- `me.png`, `me-mobile.png`, `profile.png`
- `claims.png`, `claims-mobile.png`, `mis.png`, `audit.png`
- `payslips.png`, `reports.png`, `organization.png`, `workforce.png`

## 4. Verifikasi

| Gate | Hasil |
| --- | --- |
| `pnpm verify` | Lulus: typecheck, lint, unit test, PII scan, Prettier, Compose, Go vet/test/build |
| `pnpm --filter @aletheia/web build` | Lulus; initial **150.9 KB gzip** |
| `pnpm test:e2e` | **46 passed, 2 skipped**; skipped hanya alur full-run yang butuh `RUN_FULL_E2E=1` |
| Axe pada suite a11y | 0 serious/critical pada layar kritis |
| Theme review axe | 0 serious/critical pada login, overview, payroll, profil, dan Ruang Saya |
| Keyboard | Detail batch dan dialog tetap dapat dibuka/ditutup dengan keyboard |
| Tenant plan | `HRIS Pro` tidak lagi tampil di topbar; profil tetap menampilkan konteks tenant |

## 5. Catatan desain

- Kartu memakai border, bukan bayangan lebar. Bayangan hanya untuk layer mengambang seperti dialog dan kartu login.
- Warna status selalu disertai teks dan dot, bukan warna saja.
- Label kecil memakai `--ink-500`; `--ink-300` hanya untuk disabled.
- Tab aktif memakai cobalt di atas track terang; tab nonaktif memakai `--ink-700` agar lolos kontras.
- Login memakai panel cobalt diagonal dengan watermark logo dan ilustrasi garis yang crisp, bukan sketsa.
- Tidak ada gradient dekoratif, glassmorphism, emoji, atau sparkline pengganti konten.

## 6. Batasan dan lanjutan

- Tabel mobile untuk pusat slip gaji, laporan, dan antrean workforce masih berupa tabel scroll; Phase 1/4 akan mengubahnya menjadi kartu.
- Pencarian global/command palette dan quick-action menu belum ada.
- `global.css` masih menyimpan struktur lama Quiet Ledger; `theme.css` adalah lapisan visual aktif. Konsolidasi CSS dilakukan setelah rollout stabil.
- Stage 3A dan UI Phase 0 belum di-deploy ke Render; production masih `5d231c1`.
- M6.2 sign-off tetap ditunda (1/4 run terjadwal) dan automation finalisasi sedang paused.

## 7. File utama

- `apps/web/src/styles/tokens.css` — token warna, radius, elevasi.
- `apps/web/src/styles/theme.css` — lapisan visual Daylight workspace.
- `apps/web/src/widgets/AppShell.tsx` — sidebar, workspace card, topbar, collapse.
- `apps/web/src/features/profile/ProfilePage.tsx` — profil dan preferensi.
- `apps/web/src/features/auth/LoginPage.tsx` — login.
- `apps/web/public/brand/` — logo, app icon, favicon, ilustrasi login.
- `apps/web/e2e/theme-review.spec.ts` — screenshot dan axe review.
- `DESIGN.md` — sistem visual baru.
