# Aletheia — Project Status

- **Status:** final untuk scope portofolio. UI Phase 0–2 dan Phase 5 selesai 27 November 2026; Phase 3–4 ditunda.
- **Tanggal snapshot:** 27 November 2026.
- **Keputusan:** UI Phase 5 menjadi fase penutup; Phase 3 (form clarity) dan Phase 4 (mobile table conversion) dipindah ke backlog.
- **HEAD saat snapshot:** `04962c3` ditambah commit dokumentasi Phase 5.
- **Production:** live di commit `04962c3`; Stage 3A sudah di-deploy ke Render.
- **Data:** seluruhnya sintetis. Tidak ada uang nyata atau PII nyata.
- **Local stack:** aktif untuk verifikasi UI Phase 5; hentikan dengan `bash scripts/dev-down.sh` bila perlu.

Dokumen ini adalah snapshot status. Untuk konteks lengkap, baca [`HANDOVER.md`](../HANDOVER.md), [`DESIGN.md`](../DESIGN.md), dan [`docs/evidence/README.md`](evidence/README.md).

## 1. Ringkasan

Aletheia sudah mencapai M1–M6.6 dan Stage 3A:

- production live di Cloudflare Pages/Workers, empat service Render, Neon PostgreSQL, Upstash QStash, dan Cloudinary pada commit `04962c3`;
- smoke production terakhir **15/15**;
- CI terakhir `45954282337` **hijau**;
- Security terakhir `45954282286` **hijau**;
- Stage 3A: approval cuti otomatis memperbarui `attendance_summaries`, termasuk cuti lintas bulan, dan sudah live di production;
- UI Phase 0: Daylight workspace, logo dan favicon baru, sidebar collapsible, halaman profil, login baru, dan seluruh halaman desktop;
- UI Phase 1: command palette `Ctrl/Cmd+K` dengan pencarian halaman, aksi cepat per peran, dan navigasi keyboard;
- UI Phase 2: home per peran dengan urutan tindakan, fokus utama, metrik sekunder, insight chart, dan tabel detail;
- UI Phase 5: sidebar dengan menu panjang dapat di-scroll, footer akun tetap terlihat, CSP font production diperbaiki, dan cutover production selesai;
- UI Phase 3–4 ditunda dan tetap tercatat sebagai backlog;
- tidak ada P0/P1 yang terbuka.

## 2. Yang sudah selesai

| Area | Status | Bukti |
| --- | --- | --- |
| M1–M5.4 fondasi, claims, payroll, MIS, hardening, production | Selesai/live | `docs/evidence/m5.4-verification.md` |
| M6.1 portofolio | Selesai | `docs/evidence/m6.1-verification.md` |
| M6.2 launch | Live; sign-off monitoring ditunda | `docs/evidence/m6.2-verification.md` |
| M6.3 slip gaji dan laporan | Selesai | `docs/evidence/m6.3-verification.md` |
| M6.4 employee self-service, e-cuti, e-lembur | Selesai | `docs/evidence/m6.4-verification.md` |
| M6.5 reimburse dan struktur organisasi | Selesai | `docs/evidence/m6.5-verification.md` |
| M6.6 paket tenant dan invoice biaya | Selesai | `docs/evidence/m6.6-verification.md` |
| Stage 3A cuti → attendance | Selesai di `main` dan production | `docs/evidence/stage-3a-leave-attendance.md` |
| UI Phase 0 Daylight workspace | Selesai di `main` dan localhost | `docs/evidence/design-phase5-verification.md` |
| UI Phase 0 final adjustments | Selesai | Login tanpa MFA, carousel akun looping, dua kartu sama tinggi, tenant `SEIHITSU`; commit `fc09cfc` |
| UI Phase 1 navigasi | Selesai | Command palette `Ctrl/Cmd+K`, aksi cepat per peran, keyboard, search topbar; bukti `docs/evidence/ui-phase1-verification.md` |
| UI Phase 2 insight | Selesai | Home per peran, action-first, fokus utama, metrik sekunder, insight chart, detail table; bukti `docs/evidence/ui-phase2-verification.md` |
| UI Phase 5 final polish dan production | Selesai | Sidebar scroll, CSP font, cutover `04962c3`, smoke 15/15; bukti `docs/evidence/ui-phase5-verification.md` |
| OpenAPI artifact | Diperbarui; CI gate lulus | `2f8b07f` |
| Test fixture payroll | Diperbaiki; payroll integration 54/54 | `1c9915d` |

## 3. Yang belum selesai atau ditunda

| Item | Status | Catatan |
| --- | --- | --- |
| M6.2 monitoring sign-off | Ditunda | 1/4 run terjadwal sukses (`45894766221`); automation finalisasi paused; workflow Production Monitor tetap terjadwal |
| UI Phase 3–4 | Ditunda | Form clarity, validasi inline, sticky action, SoD explanation, dan mobile table-to-card masuk backlog |
| Performance review karyawan | Backlog | Modul HRIS berikutnya |
| CRUD organisasi dan org chart visual | Backlog | Halaman `/organization` masih read-only |
| Kebijakan reimburse | Backlog | Kategori/limit belum policy-driven |
| Pengaturan paket tenant | Backlog | Plan dan gating sudah ada; belum ada UI/API ubah plan |
| RUM LCP/INP | Backlog | Web-vitals belum diinstrumentasi |
| Edge span OTLP | Backlog | Edge hanya meneruskan `traceparent` |
| Label Prometheus kardinalitas tinggi | Backlog | Gunakan `resource_constant_labels` atau transform collector |
| CI E2E full-stack | Backlog | E2E belum menjadi job CI penuh |
| Video MP4/narasi | Opsional | WebM 2:16 sudah ada |

Tidak ada item di atas yang merupakan bug produksi atau blocker demo.

## 4. Verifikasi terakhir

| Gate | Hasil |
| --- | --- |
| `pnpm verify` | Lulus |
| Full Playwright E2E | 49 passed, 2 skipped |
| UI Phase 2 focused Playwright | 2 passed; enam role home + sidebar panjang, axe 0 serious/critical |
| Build web | 152.3 KB gzip |
| CI `45954282337` | Hijau |
| Security `45954282286` | Hijau |
| Production smoke | 15/15 |
| Async QStash/worker | ~5 detik |
| Production UI check | Finance/Compliance sidebar scroll, footer terlihat, 0 console error |
| Working tree | Bersih setelah dokumen ini di-commit |

## 5. Cara melanjutkan

1. Nyalakan stack lokal:
   ```bash
   bash scripts/dev-up.sh
   ```
2. Jalankan gate:
   ```bash
   pnpm verify
   ```
3. Integration payroll:
   ```bash
   cd services/payroll-service
   RUN_PAYROLL_INTEGRATION=true \
   DATABASE_URL="postgresql://aletheia:aletheia@localhost:55432/aletheia" \
   DATABASE_URL_APP="postgresql://aletheia_app:aletheia_app@localhost:55432/aletheia" \
   pnpm test
   ```
4. Untuk demo production:
   ```bash
   pnpm warm:production
   EDGE_URL="$(grep '^EDGE_URL=' .env.production.local | cut -d= -f2-)" \
     WEB_URL="https://aletheia-web-preview.pages.dev" pnpm smoke:production
   pnpm async:production
   ```
5. M6.2 sign-off: tunggu 4 run terjadwal sukses, lalu perbarui `docs/evidence/m6.2-verification.md` dan status M6.2. Automation finalisasi `aut_21abb0a1f001L4vP01pBJRiMWr` sedang **paused** dan dapat di-resume.
6. Backlog berikutnya: UI Phase 3–4 (form clarity dan mobile table conversion), performance review, CRUD organisasi + org chart, kebijakan reimburse, pengaturan paket, RUM/edge span/Prometheus labels, CI E2E full-stack.

## 6. Batasan Stage 3A

- Pembagian cuti lintas bulan memakai hari kerja Senin–Jumat; belum ada kalender hari libur.
- Cuti setengah hari dibulatkan ke bawah karena kolom attendance bertipe `SMALLINT`.
- Integrasi bersifat aditif: HR sebaiknya tidak mengisi hari cuti yang sama sebelum approval.
- Belum ada endpoint pembatalan cuti; pembatalan harus mengurangi attendance dengan guard yang sama.

## 7. Commit penutup

| Commit | Isi |
| --- | --- |
| `2f8b07f` | Refresh OpenAPI artifact |
| `4590218` | Selaraskan status monitoring M6.2 |
| `3d0aa67` | Stage 3A cuti → attendance |
| `bc3c2fe` | Evidence dan dokumentasi Stage 3A |
| `1c9915d` | Perbaikan fixture integration test |
| `cf52a7b` | Daylight workspace, logo, login, profil, sidebar collapsible |
| `fc09cfc` | Login tanpa MFA, carousel akun, tenant SEIHITSU |
| commit UI Phase 1 | Command palette, aksi cepat, search topbar |
| `2d46589` | Home per peran, hierarki insight, chart/insight |
| `fbc320d` | Evidence dan status UI Phase 2 |
| `abb4827` | Sidebar panjang dapat di-scroll; footer akun tetap terlihat |
| `04962c3` | CSP font production dan fade sidebar; production cutover |
| commit docs Phase 5 | Snapshot final, evidence deploy, dan roadmap |
