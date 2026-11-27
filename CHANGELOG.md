# Changelog

Semua perubahan penting pada Aletheia. Format mengikuti [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) dan [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Runtime RLS: pool service memakai role non-owner `aletheia_app` dengan tenant binding per request/transaksi.
- Worker Go mengikat tenant dari event ke koneksi `pgxpool` melalui hook `BeforeAcquire`/`AfterRelease`.
- Fungsi `SECURITY DEFINER` untuk login, refresh token, dan resolusi tenant webhook.
- Migrasi `0008`–`0011`: login role aplikasi, grant DML, guard `app.tenant_id` kosong, dan membership admin.
- Provisioning role aplikasi di `dev-up.sh` dan CI; integration test berjalan dengan `DATABASE_URL_APP`.
- Neon production project `aletheia` (PG16, Singapore) dengan migrasi, seed, dan RLS 36/36.
- `.env.production.local` untuk konfigurasi deployment lokal (di-ignore Git).
- CHANGELOG, galeri screenshot M6.1, dan skrip rekaman demo Playwright.
- Production launch 26 November 2026: web Cloudflare Pages, edge Cloudflare Workers, governance/claims/payroll/worker Render, Neon PG16, Upstash QStash, dan Cloudinary.
- Smoke production 15/15, cek UI web tiga peran, dan verifikasi async QStash/worker (~5 detik).
- Rollback drill edge Workers, Cloudflare Pages, dan Render `aletheia-claims`.
- `pnpm warm:production`, `pnpm async:production`, dan workflow `Production Monitor` tiap 6 jam.
- Bukti M6.2: `docs/evidence/m6.2-verification.md` dan screenshot web production.
- M6.3: pusat slip gaji `/payslips` dan layar laporan `/reports` untuk PPh 21 bulanan/tahunan, BPJS, bank file, dan varians payroll.
- M6.3: tombol “Buat slip gaji” pada batch payroll yang sudah disetujui atau dicairkan.
- M6.3: seed berkas slip dan laporan yang dapat diunduh untuk demo dan E2E.
- M6.3: test E2E slip gaji dan laporan, termasuk akses peran, unduhan, dan mobile.
- Bukti M6.3: `docs/evidence/m6.3-verification.md` dan tiga screenshot baru.
- M6.4: role `EMPLOYEE`, akun demo karyawan, dan self-service `/me` untuk slip, absensi, saldo cuti, e-cuti, dan e-lembur.
- M6.4: tabel `payroll.leave_balances` dan `payroll.overtime_requests` dengan RLS.
- M6.4: endpoint self-scope `/api/v1/me/*` dan antrean HR `/workforce` untuk keputusan cuti dan lembur.
- M6.4: SoD cuti/lembur, validasi saldo, dan rekalkulasi lembur ke attendance summary.
- Bukti M6.4: `docs/evidence/m6.4-verification.md` dan empat screenshot Ruang Saya.
- M6.5: reimburse karyawan dengan Cloudinary signed upload, approval HR, dan pembayaran mock Finance.
- M6.5: departemen, posisi, penugasan personel, dan halaman Struktur Organisasi read-only.
- M6.5: guard peran pada halaman payroll dan klaim, unique link personel-user, dan hardening overtime/leave.
- Bukti M6.5: `docs/evidence/m6.5-verification.md` dan screenshot reimburse serta organisasi.
- M6.6: paket tenant `BASIC`/`HRIS_PLUS`/`HRIS_PRO`/`ENTERPRISE`, badge paket, dan feature gating API.
- M6.6: policy `PAYROLL_COST_POLICY` dan laporan `PAYROLL_COST_INVOICE` per cabang dengan BJO, management fee, pembulatan, checksum, dan audit.
- M6.6: halaman laporan menampilkan total invoice dan opsi unduhan CSV.
- Bukti M6.6: `docs/evidence/m6.6-verification.md` dan screenshot invoice biaya payroll.
- Desain fase 1–4: Quiet Ledger, Ikhtisar, Reports v2, Organization v2, payroll/workforce/self-service, klaim, MIS, audit ledger, motion, dan mobile polish.
- Production deploy 27 November 2026: migrasi `0012`–`0017`, empat service Render, edge Worker, dan Pages berada di commit `5d231c1`; smoke production 15/15 dan async QStash lulus.
- Bukti deploy: `docs/evidence/design-phases-production-deploy.md` dan screenshot production MIS.
- Hardening review: default paket tenant menjadi BASIC, invoice dicek ulang saat unduhan, reimburse memakai idempotency key dan SoD decider/payer, bukti Cloudinary divalidasi per tenant, dan app role tidak dapat menghapus baris reimburse.
- Stage 3A: approval cuti otomatis memperbarui `attendance_summaries` (`paid_leave_days`/`unpaid_leave_days`) per bulan, termasuk cuti lintas bulan; guard `ERR_ATTENDANCE_MISSING`/`ERR_ATTENDANCE_CAPACITY` dan audit `attendance_sync`.
- UI Phase 0 — Daylight workspace: token warna cobalt, permukaan terang, kartu ber-border, tabel airy, chart baru, login diagonal, dan shell sidebar terang.
- Brand mark baru, app icon, dan favicon; halaman profil `/profile` yang dapat dibuka dari avatar topbar dan blok pengguna sidebar.
- Sidebar dapat dibuka/tutup di desktop dan tersimpan sebagai preferensi; badge `HRIS Pro` dihapus dari topbar, konteks tenant pindah ke workspace card dan profil.
- Mobile self-service payslip memakai kartu, bukan tabel horizontal.
- Login demo menyembunyikan input MFA; opsi akun memakai carousel horizontal looping dengan panah, dots, dan swipe.
- Profil memakai aturan dua kartu sama tinggi; tenant demo tampil sebagai `SEIHITSU`.
- Bukti UI Phase 0: `docs/evidence/design-phase5-verification.md` dan galeri screenshot baru.
- UI Phase 1: command palette `Ctrl/Cmd+K` yang menggabungkan pencarian halaman dan aksi cepat per peran, dengan navigasi keyboard dan tombol search di topbar.
- UI Phase 1: aksi cepat buat klaim, konsol payroll, antrean cuti/lembur, verifikasi audit, dan MIS; mobile memakai trigger search ikon.
- UI Phase 2: home per peran untuk Claims Officer, Branch Manager, Finance Manager, HR Specialist, Compliance Admin, dan MIS Analyst.
- UI Phase 2: urutan action-first — “Perlu tindakan” atau “Sinyal analisis”, fokus utama, tiga metrik sekunder, chart dengan “Apa artinya”, lalu tabel detail per peran.
- UI Phase 2: chart tanpa animasi masuk dan empty state untuk data nol; kontras teks sekunder dinaikkan agar axe stabil saat transisi halaman.
- UI Phase 5: navigasi sidebar bisa di-scroll untuk peran dengan menu panjang; footer akun tetap terlihat, label terakhir diberi spacer, dan tepi bawah memakai fade halus.
- UI Phase 5: CSP Cloudflare Pages mengizinkan font `data:` dari bundel Plus Jakarta Sans, sehingga production bebas error console.
- UI Phase 5: production cutover commit `04962c3` — empat service Render, edge Worker, dan Pages; smoke 15/15, async QStash/worker ~5 detik.
- Bukti UI Phase 5: `docs/evidence/ui-phase5-verification.md` dan screenshot sidebar Finance/Compliance.
- Demo dataset 15 bulan (September 2025–November 2026): 32 personel di 8 divisi, 45 batch payroll, 273 klaim, 470 payslip, 90 laporan, dan 45 baris KPI MIS.
- Panduan penggunaan per peran dalam format PDF untuk Petugas Klaim, Manajer Cabang, Manajer Keuangan, Spesialis SDM, Administrator Kepatuhan, Analis MIS, dan Karyawan.
- Workflow `Warm Production` berjalan tiap 10 menit untuk menjaga service Render free tier tetap bangun.
- Halaman portofolio menampilkan delapan tautan service production, tiga paragraf narasi, dan enam poin result tanpa heading “Hasil”.
- Pesan login cold-start: “Layanan demo sedang bangun. Tunggu beberapa detik lalu klik Masuk lagi.”
- Web production `21c0a9a`: halaman portofolio menampilkan seluruh link service, daftar result tanpa heading, dan workflow warm-up 10 menit.

### Changed

- Service runtime tidak lagi memakai role owner database.
- CI database job membangun paket workspace dan mem-provision role sebelum integration test.
- Dokumentasi status M5.4, RLS, deployment, live URL, dan evidence diperbarui.
- `QSTASH_URL` memakai region `us-east-1`; `WORKER_URL` memakai host `aletheia-worker-zjnt.onrender.com`.
- Edge production memakai subdomain akun `ridwanafzn.workers.dev`; dokumentasi lama dengan `ridwanafazn` diperbaiki.
- Pengembangan dilanjutkan 27 November 2026 untuk UI Phase 0; status, verifikasi, dan backlog dicatat di `docs/FINAL-STATUS.md`.

### Fixed

- Artefak `packages/shared-contracts/openapi.json` disegarkan agar CI `Verify OpenAPI artifact is current` lulus setelah penambahan kontrak M6.4–M6.6.
- Fixture integrasi reimburse memakai `CLOUDINARY_CLOUD_NAME` dan `CLOUDINARY_FOLDER_PREFIX` dari environment, bukan nama cloud hardcoded.
- QStash mengembalikan `enqueued=false` karena token berada di `us-east-1` tetapi endpoint default mengarah ke `eu-central-1`.
- Production Monitor gagal resolve edge karena variabel memakai subdomain `ridwanafazn`, bukan `ridwanafzn`.
- CI integration test gagal karena `@aletheia/observability` belum dibangun pada checkout bersih.
- `db:check` dan `security:db` gagal pada Neon karena owner bukan member `aletheia_app`.
- RLS cast error ketika `app.tenant_id` kosong; policy sekarang memakai `nullif(..., '')`.
- Tenant binding pada koneksi pool yang dipakai ulang, webhook, signed file download, dan worker Go.
- Filter `period_month` pada slip gaji dan laporan mengirim tanggal pertama bulan sesuai kontrak.
- Kontras label ledger dinaikkan agar lulus WCAG AA.
- Path fixture E2E klaim memakai lokasi absolut sehingga suite berjalan dari root repository.

## [0.5.3] — 2026-11-26

### Added

- Baseline M1–M5.3: monorepo, kontrak, database/RLS, governance, claims, payroll, HRIS-lite, MIS, edge gateway, web, observability, load test, E2E, accessibility, dan security hardening.
- 7 skenario k6, 21 E2E dua run, coverage domain 96,26%, RLS 35/35, audit chain valid.
- Agent dan skill proyek: `aletheia-finance`, `impeccable`, `superpowers`, `karpathy-guidelines`.

### Fixed

- CI integration job membangun paket workspace sebelum menjalankan suite.

## [0.1.0] — 2026-11-25

### Added

- Dokumentasi fase 0: visi, arsitektur, database, kontrak API, aturan bisnis, DevOps, frontend, keamanan, observability, testing, HRIS-lite, strategi delivery, job matrix, ADR, dan audit register.
- Inisialisasi repo, Docker, CI, dan kontrak bersama.
