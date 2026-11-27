# Aletheia — Final Status (Development Paused)

- **Tanggal snapshot:** 27 November 2026.
- **Keputusan:** progresi pengembangan dijeda/dihentikan atas permintaan pemilik proyek.
- **HEAD saat snapshot:** `1c9915d` (`test(payroll): align integration fixtures with 3A guards`).
- **Production:** tetap live di commit `5d231c1`; Stage 3A **belum** di-deploy ke Render.
- **Data:** seluruhnya sintetis. Tidak ada uang nyata atau PII nyata.
- **Local stack:** dihentikan dengan `bash scripts/dev-down.sh`; volume data dipertahankan.

Dokumen ini adalah catatan penutup. Untuk konteks lengkap, baca [`HANDOVER.md`](../HANDOVER.md) dan [`docs/evidence/README.md`](evidence/README.md).

## 1. Ringkasan

Aletheia sudah mencapai M1–M6.6 dan Stage 3A:

- production live di Cloudflare Pages/Workers, empat service Render, Neon PostgreSQL, Upstash QStash, dan Cloudinary;
- smoke production terakhir **15/15**;
- CI terakhir `45928294052` **hijau**, termasuk payroll integration **54/54**;
- Security terakhir `45928294049` **hijau**;
- Stage 3A: approval cuti otomatis memperbarui `attendance_summaries`, termasuk cuti lintas bulan;
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
| Stage 3A cuti → attendance | Selesai di `main` dan CI; belum deploy | `docs/evidence/stage-3a-leave-attendance.md` |
| OpenAPI artifact | Diperbarui; CI gate lulus | `2f8b07f` |
| Test fixture payroll | Diperbaiki; payroll integration 54/54 | `1c9915d` |

## 3. Yang belum selesai atau ditunda

| Item | Status | Catatan |
| --- | --- | --- |
| M6.2 monitoring sign-off | Ditunda | 1/4 run terjadwal sukses (`45894766221`); automation finalisasi dijeda; workflow Production Monitor tetap terjadwal |
| Stage 3A di production | Belum deploy | Production masih `5d231c1`; Render `autoDeployTrigger: off` |
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
| Unit test payroll + workforce | 27 lulus (unit), 27 integration skipped |
| 3A unit test | 9/9 lulus |
| 3A integration test | 5/5 lulus |
| Payroll integration (CI-equivalent) | 54/54 lulus |
| CI `45928294052` | Hijau; payroll integration job sukses |
| Security `45928294049` | Hijau |
| Production smoke | 15/15 (sebelum jeda) |
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
4. Jika Stage 3A ingin live: deploy manual payroll service (dan service lain bila perlu) ke Render, lalu:
   ```bash
   pnpm warm:production
   EDGE_URL="$(grep '^EDGE_URL=' .env.production.local | cut -d= -f2-)" \
     WEB_URL="https://aletheia-web-preview.pages.dev" pnpm smoke:production
   ```
5. M6.2 sign-off: tunggu 4 run terjadwal sukses, lalu perbarui `docs/evidence/m6.2-verification.md` dan status M6.2. Automation finalisasi `aut_21abb0a1f001L4vP01pBJRiMWr` sedang **paused** dan dapat di-resume.
6. Backlog berikutnya: performance review, CRUD organisasi + org chart, kebijakan reimburse, pengaturan paket, RUM/edge span/Prometheus labels, CI E2E full-stack.

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
| commit dokumen ini | Snapshot final dan penutupan progresi |
