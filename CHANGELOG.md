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

### Changed

- Service runtime tidak lagi memakai role owner database.
- CI database job membangun paket workspace dan mem-provision role sebelum integration test.
- Dokumentasi status M5.4, RLS, deployment, dan evidence diperbarui.

### Fixed

- CI integration test gagal karena `@aletheia/observability` belum dibangun pada checkout bersih.
- `db:check` dan `security:db` gagal pada Neon karena owner bukan member `aletheia_app`.
- RLS cast error ketika `app.tenant_id` kosong; policy sekarang memakai `nullif(..., '')`.
- Tenant binding pada koneksi pool yang dipakai ulang, webhook, signed file download, dan worker Go.

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
