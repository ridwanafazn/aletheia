# UI Phase 1 — Navigation and Command Palette

- **Tanggal:** 27 November 2026.
- **Commit:** `feat(web): add command palette for phase 1` di riwayat Git.
- **Lingkungan:** lokal, Vite `5173`, Chromium Playwright.
- **Data:** sintetis.

## 1. Tujuan

Menutup Phase 1: pengguna harus bisa menemukan halaman dan aksi utama tanpa menelusuri sidebar, dengan keyboard dan mobile yang tetap nyaman.

## 2. Yang berubah

| Area | Hasil |
| --- | --- |
| Topbar | Tombol **Cari halaman atau aksi** dengan hint `Ctrl K`; ikon saja di mobile |
| Command palette | Dialog `Ctrl/Cmd+K` dengan input, grup navigasi, dan aksi cepat |
| Aksi cepat | Buat klaim, konsol payroll, antrean cuti/lembur, verifikasi audit, MIS; difilter per peran |
| Keyboard | `ArrowUp`, `ArrowDown`, `Enter`, `Escape`; input autofokus |
| Mouse/touch | Klik backdrop atau item; scroll daftar; mobile tetap full-width |
| Aksesibilitas | `role="dialog"`, `aria-modal`, label input, `aria-current` pada item aktif, focus-visible |
| Perilaku | Body scroll dikunci saat dialog terbuka; palette ditutup saat navigasi |

## 3. Bukti visual

`docs/evidence/ui-phase1/command-palette.png`

## 4. Verifikasi

| Gate | Hasil |
| --- | --- |
| Playwright fokus `command-palette.spec.ts` | **1 passed** |
| Axe pada dialog | 0 serious/critical |
| `pnpm verify` | Lulus |
| `pnpm --filter @aletheia/web build` | Lulus; **152.2 KB gzip** |
| Typecheck | Lulus |

Full E2E tidak dijalankan ulang untuk perubahan ini agar iterasi tetap cepat; suite penuh Phase 0 terakhir **46 passed, 2 skipped**, dan `command-palette.spec.ts` sudah termasuk dalam suite.

## 5. Batasan

- Palette mencari **halaman dan aksi**, bukan data karyawan, klaim, atau batch.
- Tabel mobile untuk pusat slip, laporan, dan workforce tetap masuk Phase 4.
- Sidebar collapse dan halaman profil tetap dari Phase 0.

## 6. File utama

- `apps/web/src/widgets/CommandPalette.tsx`
- `apps/web/src/widgets/AppShell.tsx`
- `apps/web/src/styles/theme.css`
- `apps/web/e2e/command-palette.spec.ts`
