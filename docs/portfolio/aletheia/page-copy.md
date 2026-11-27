# Aletheia — Copy Final

## Hero

**Eyebrow:** PORTFOLIO / EXPLORATION 2026

# Aletheia

**Subtitle:** Ruang eksplorasi fullstack untuk klaim, payroll, dan MIS.

**Deskripsi singkat:** Bukan klaim pengalaman industri. Catatan belajar membangun sistem yang bisa menjelaskan ke mana uang pergi.

**Metadata:**

| | |
| --- | --- |
| Peran | Eksplorasi fullstack / solo build |
| Stack | React 19 · TypeScript · PostgreSQL · Go · Express · Cloudflare Workers · Neon · Upstash · Playwright |
| Fokus | Disbursement governance, payroll, MIS |
| Status | Live demo · data sintetis |

**Tombol:** `Live demo` · `Repository` · `Panduan per peran`

---

## Narasi

Aletheia berawal dari pertanyaan sederhana: ke mana uang pergi, siapa yang menyetujui, dan bagaimana catatannya bisa dipercaya? Saya membuat ruang eksplorasi klaim, payroll, dan MIS karena demo transaksi sering berhenti di tombol approve.

Saya membangun policy versioning, maker-checker-payer, audit hash chain, dan RLS multi-tenant. React dan TypeScript menangani UI per peran, Express dan Go menangani service serta kalkulasi, PostgreSQL menyimpan data, sementara Cloudflare Workers, Neon, dan Upstash menjaga deployment tetap ringkas. Saya juga mengisi 15 bulan data sintetis agar tren dan laporan terbaca dalam konteks.

Demo live mencakup tujuh peran, 32 personel di delapan divisi, 45 batch payroll, 273 klaim, dan 470 payslip. Audit chain bisa diverifikasi dan halaman Ikhtisar menyesuaikan prioritas per peran. Ini bukan sistem produksi: pajak dan BPJS masih aproksimasi, sebagian form dan mobile ditunda, dan pembayaran masih mock.

---

## SEO

**Title:** Aletheia — Eksplorasi disbursement governance & MIS

**Description:** Eksplorasi fullstack untuk klaim, payroll, dan MIS: policy versioning, segregation of duties, audit hash chain, dan dashboard per peran. Data sintetis; bukan klaim pengalaman profesional.
