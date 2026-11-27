# Aletheia — Portfolio Assets

Paket aset untuk halaman `https://ridwanafazn.my.id/projects/aletheia`.

## Isi folder

| File | Ukuran | Kegunaan |
| --- | --- | --- |
| `banner-aletheia-2400x1350.png` | 2400×1350 (16:9) | Banner utama resolusi tinggi |
| `banner-1600x900.png` | 1600×900 (16:9) | Banner untuk web (ukuran tampil maksimum) |
| `banner-og-1200x630.png` | 1200×630 | Open Graph / Twitter card |
| `gallery/01-login.png` | 3200×2000 | Login dan akun demo |
| `gallery/02-overview-finance.png` | 3200×2000 | Ikhtisar Manajer Keuangan |
| `gallery/02b-overview-branch.png` | 3200×2000 | Ikhtisar Manajer Cabang |
| `gallery/03-command-palette.png` | 3200×2000 | Command palette |
| `gallery/04-payroll-console.png` | 3200×2000 | Konsol Payroll |
| `gallery/05-organization.png` | 3200×2000 | Struktur Organisasi |
| `gallery/06-claims.png` | 3200×2000 | Ruang Klaim |
| `gallery/07-mis-intelligence.png` | 3200×2000 | MIS Intelligence |
| `gallery.json` | — | Manifest caption/alt untuk lightbox |
| `copywriting.md` | — | Catatan framing dan aturan copy |
| `render-banner.mjs` | — | Script reproduksi banner |

## Upload ke Cloudinary

Urutan yang disarankan:

1. Upload banner ke `portfolio/aletheia/banner`.
2. Upload galeri ke `portfolio/aletheia/gallery`.
3. Gunakan `q_auto,f_auto` dan `c_limit,w_1600` untuk banner/galeri.
4. Ganti `og:image` ke banner baru (1200×630).

Contoh URL:

```text
https://res.cloudinary.com/<cloud>/image/upload/c_limit,w_1600,q_auto,f_auto/portfolio/aletheia/banner
https://res.cloudinary.com/<cloud>/image/upload/c_limit,w_1600,q_auto,f_auto/portfolio/aletheia/gallery/07-mis-intelligence
```

## Frontmatter yang disarankan

```yaml
title: Aletheia
description: Ruang eksplorasi fullstack untuk klaim, payroll, dan MIS.
role: Eksplorasi fullstack / solo build
stack: React 19 · TypeScript · PostgreSQL · Go · Cloudflare
status: Live demo · data sintetis
focus: Disbursement governance, payroll, MIS
```

## Gallery data

Gunakan `gallery.json` sebagai sumber. Ganti `src` lokal dengan URL Cloudinary setelah upload. Struktur yang dipakai halaman:

```json
[
  {
    "src": "https://res.cloudinary.com/.../01-login",
    "alt": "Halaman login Aletheia dengan carousel akun demo.",
    "caption": "Login dengan pemilihan akun demo per peran."
  }
]
```

## Banner

Banner dibuat dari screenshot **MIS Intelligence** dengan palet situs:

- Background: `#f8f7f4`
- Ink: `#14160f`
- Muted: `#5a5e4e`
- Outline: `#d5d8cd`
- Signal: `#d9480f`
- Font: Bricolage Grotesque, Public Sans, JetBrains Mono

Regenerasi banner:

```bash
node docs/portfolio/aletheia/render-banner.mjs
```

Script membutuhkan screenshot `gallery/07-mis-intelligence.png` dan font di `source/fonts/`.

## Yang berubah di halaman

| Sekarang | Ganti dengan |
| --- | --- |
| Cover `Screenshot_2026-11-27_121751` | `banner-aletheia-2400x1350.png` |
| Peran “Fullstack Developer” | “Eksplorasi fullstack / solo build” |
| Stack “React” | “React 19 · TypeScript · PostgreSQL · Go · Cloudflare” |
| Subtitle “Enterprise Disbursement Governance & MIS Intelligence Platform” | “Ruang eksplorasi fullstack untuk klaim, payroll, dan MIS.” |
| Satu paragraf singkat | Tiga paragraf dari `page-copy.md`, tanpa heading |
| Galeri kosong | Delapan gambar di `gallery/` dengan caption dari `gallery.json` |
| OG image screenshot lama | `banner-og-1200x630.png` |
| Preview di daftar `/projects` | `gallery/07-mis-intelligence.png` (16:10, lebih terbaca di thumbnail) |

## Cara pasang di portofx

Halaman proyek di `portofx` membaca `longDescription`. Untuk Aletheia, isi dengan tiga paragraf tanpa heading; parser akan merendernya sebagai satu section tanpa label. Jadi:

1. Upload `banner-aletheia-2400x1350.png` ke Cloudinary, pakai sebagai `coverImage` dan `ogImage`.
2. Salin tiga paragraf dari `page-copy.md` ke `longDescription`. Jangan tambahkan heading `##` atau label STAR.
3. Upload delapan gambar galeri live (mobile opsional), lalu isi `gallery` dengan `alt` dan `caption` dari `gallery.json`.
4. Ubah `role` menjadi “Eksplorasi fullstack / solo build” dan `techStack` menjadi daftar stack lengkap.
5. Kosongkan `highlights` agar section “Hasil” tidak muncul, lalu ganti meta description dengan versi di `page-copy.md`.

## Catatan framing

Semua copy mengarah ke **eksplorasi**, bukan klaim profesional. Hindari mengganti kata “eksplorasi”, “latihan”, atau “catatan belajar” dengan klaim seperti “expert”, “enterprise-grade”, atau “production-ready untuk perusahaan”.
