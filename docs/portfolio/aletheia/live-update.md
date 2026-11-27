# Aletheia — Live Portfolio Update

- **Tanggal:** 27 November 2026.
- **Situs:** https://ridwanafazn.my.id/projects/aletheia
- **Sumber data:** Neon project `portofx-v2` (`odd-rice-47100012`), branch `main`, database `neondb`.
- **Row:** `portfolios.id = d68215ec-c11b-4f4d-8335-f84debdb93db`, slug `aletheia`.
- **Aset:** sudah diunggah ke Cloudinary folder `portfolio/`.

## Yang diubah di database

| Field | Nilai |
| --- | --- |
| `role` | `Eksplorasi fullstack / solo build` |
| `description` | `Ruang eksplorasi fullstack untuk klaim, payroll, dan MIS.` |
| `long_description` | Tiga paragraf, tanpa heading section dan tanpa label STAR |
| `tech_stack` | React 19, TypeScript, PostgreSQL, Go, Express, Cloudflare Workers, Neon, Upstash, Playwright |
| `highlights` | Kosong; section “Hasil” tidak ditampilkan |
| `links` | Live demo, Repository, Panduan per peran |
| `gallery` | Delapan aset dengan caption dan alt |
| `seo` | Title, description, dan OG image |

`cover_image_id` sudah menunjuk ke `portfolio/banner-aletheia-2400x1350` yang diunggah pengguna.

## Gallery live

| Urutan | Asset ID | Caption |
| ---: | --- | --- |
| 1 | `8fe53420-101f-4226-b8cc-2e596e23c017` | Login dengan pemilihan akun demo per peran. |
| 2 | `cae14233-8cae-44b7-b5ba-5f20f11f0511` | Ikhtisar Manajer Keuangan: antrean tindakan, fokus payroll, dan tren enam bulan. |
| 3 | `dcb3f392-49ee-4b63-9dcc-74b9317c92bc` | Ikhtisar Manajer Cabang: antrean keputusan klaim, cuti, lembur, dan reimburse. |
| 4 | `ad64ba0e-1454-4372-98c8-82515a9aee58` | Command palette untuk navigasi dan aksi cepat lintas halaman. |
| 5 | `9d41b741-71d9-44e3-a68e-eae357054d71` | Konsol Payroll: batch per cabang dan periode dengan status pencairan. |
| 6 | `ff6eb4f6-ef2e-435a-a861-ef6f8aeac108` | Struktur Organisasi: delapan divisi dan 32 personel. |
| 7 | `633cd856-e09d-4b92-928b-3b9bb6c1446a` | Ruang Klaim: status, risiko, dan konflik dalam satu daftar. |
| 8 | `40fc31e3-0460-45ee-b270-e882ff5c347d` | MIS Intelligence: KPI cabang, approval rate, dan tren payroll/klaim. |

## Verifikasi

- HTML live memuat role, description, tiga paragraf narasi, dan delapan gallery item.
- Tidak ada heading section, label STAR, atau section “Hasil”.
- Banner live: `portfolio/banner-aletheia-2400x1350`.
- Screenshot halaman live: `docs/portfolio/aletheia/live-project-page.png`.
- Gallery live menampilkan **08 gambar**.

## Catatan

- Perubahan dilakukan langsung ke Neon melalui MCP; tidak ada perubahan kode di `portofx`.
- `seo` disimpan di row, tetapi halaman saat ini memakai `title` dan `description` proyek untuk metadata utama.
- Copy mengikuti framing eksplorasi: tidak ada klaim “expert”, “enterprise-grade”, atau “production-ready untuk perusahaan”.
