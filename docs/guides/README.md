# Panduan Penggunaan per Peran

PDF panduan untuk setiap peran di Aletheia Demo. Semua data di aplikasi sintetis; jangan memasukkan data pelanggan atau PII nyata.

| Peran | Akun demo | PDF |
| --- | --- | --- |
| Petugas Klaim | `officer.bdg@aletheia.id` | [`panduan-petugas-klaim.pdf`](panduan-petugas-klaim.pdf) |
| Manajer Cabang | `manager.bdg@aletheia.id` | [`panduan-manajer-cabang.pdf`](panduan-manajer-cabang.pdf) |
| Manajer Keuangan | `finance.vp@aletheia.id` | [`panduan-manajer-keuangan.pdf`](panduan-manajer-keuangan.pdf) |
| Spesialis SDM | `hr.ops@aletheia.id` | [`panduan-spesialis-sdm.pdf`](panduan-spesialis-sdm.pdf) |
| Administrator Kepatuhan | `compliance@aletheia.id` | [`panduan-administrator-kepatuhan.pdf`](panduan-administrator-kepatuhan.pdf) |
| Analis MIS | `mis.analyst@aletheia.id` | [`panduan-analis-mis.pdf`](panduan-analis-mis.pdf) |
| Karyawan | `employee.siti@aletheia.id` | [`panduan-karyawan.pdf`](panduan-karyawan.pdf) |

Kata sandi semua akun: `AletheiaDemo!2026`. Login di [aletheia-web-preview.pages.dev](https://aletheia-web-preview.pages.dev).

## Isi setiap panduan

- Ringkasan peran dan menu yang boleh diakses.
- Alur kerja utama langkah demi langkah.
- Checklist harian dan tips operasional.
- Arti status transaksi.
- Aturan keamanan, SoD, dan penanganan akses ditolak.

## Regenerasi

PDF dibuat dari HTML/CSS di `apps/web/scripts/generate-role-guides.mjs` memakai Chromium Playwright:

```bash
pnpm docs:guides
```

Setiap PDF memakai A4, 5 halaman, footer nomor halaman, dan data tenant `SEIHITSU`.
