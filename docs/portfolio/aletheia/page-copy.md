# Halaman Aletheia — Copy Final

## Hero

**Eyebrow:** PORTFOLIO / EXPLORATION 2026

# Aletheia

**Subtitle:** Ruang eksplorasi fullstack untuk klaim, payroll, dan MIS.

**Deskripsi:**
Bukan klaim pengalaman industri. Ini catatan belajar membangun sistem yang harus bisa menjelaskan ke mana uang pergi — dengan policy versioning, pemisahan peran, dan audit yang bisa diverifikasi.

**Metadata:**

| | |
| --- | --- |
| Peran | Eksplorasi fullstack / solo build |
| Stack | React 19 · TypeScript · PostgreSQL · Go · Cloudflare |
| Fokus | Disbursement governance, payroll, MIS |
| Status | Live demo · data sintetis |
| Dataset | 15 bulan · 32 personel · 8 divisi |

**Tombol:** `Lihat demo` · `Baca catatan teknis`

---

## Versi pendek (untuk layout sekarang)

Aletheia adalah ruang eksplorasi saya untuk memahami bagaimana klaim, payroll, dan audit bisa bertemu dalam satu sistem yang bisa dipertanggungjawabkan. Saya membangunnya untuk belajar — bukan untuk mengklaim pengalaman profesional di industri HRIS atau payroll.

Di dalamnya ada policy versioning, pemisahan maker-checker, audit hash chain, dashboard per peran, dan 15 bulan data sintetis. Demo ini adalah latihan sistem: ada bagian yang sudah berjalan, ada yang sengaja ditunda, dan ada keputusan yang akan saya ubah kalau membangunnya lagi.

**Satu kalimat:** Eksplorasi fullstack untuk memahami ke mana uang pergi, siapa yang menyetujui, dan bagaimana catatannya tetap bisa dipercaya.

---

## Ringkasan

Aletheia adalah ruang eksplorasi saya untuk memahami bagaimana sistem disbursement bekerja ketika uang, approval, pajak, dan audit bertemu. Di dalamnya ada klaim, payroll, laporan PPh 21/BPJS, KPI lintas cabang, dan audit hash chain — semuanya memakai data sintetis.

Saya tidak membangun ini untuk mengklaim pengalaman profesional di industri HRIS atau payroll. Saya membangunnya untuk belajar: bagaimana membuat keputusan finansial bisa dipertanggungjawabkan, bagaimana aturan bisa berubah tanpa merusak transaksi lama, dan bagaimana antarmuka bisa membantu orang mengambil keputusan, bukan sekadar menampilkan angka.

---

## Kenapa saya membangun ini

Saya tertarik pada pertanyaan yang terlihat sederhana: **ke mana uang pergi, siapa yang menyetujui, dan bagaimana kita tahu catatannya tidak diubah?**

Di banyak demo, pertanyaan itu berhenti di “tombol approve berfungsi”. Saya ingin mendorongnya sedikit lebih jauh: apa yang terjadi kalau aturan berubah di tengah jalan, kalau pembuat dan penyetuju adalah orang yang sama, kalau dua orang menyetujui bersamaan, atau kalau ada data yang perlu disamarkan. Aletheia adalah tempat saya mencoba menjawab pertanyaan-pertanyaan itu dengan kode, test, dan bukti yang bisa diperiksa.

---

## Yang saya eksplorasi

### Policy sebagai referensi, bukan angka di kode

Aturan approval, tarif pajak, dan komisi disimpan sebagai policy version. Transaksi lama tetap menunjuk versi policy saat transaksi itu dibuat. Eksplorasi ini membuat saya belajar tentang versioning, checksum, dan konsekuensi ketika aturan berubah.

### Segregation of duties

Pembuat transaksi tidak boleh menjadi penyetuju. Ini terlihat sederhana di UI, tetapi harus dijaga juga di API dan database. Saya mencoba memisahkan peran maker, checker, dan payer, lalu menguji jalur yang mencoba melewatinya.

### Audit yang bisa diverifikasi

Setiap aksi penting masuk ke audit log dengan hash chain. Saya tidak hanya menampilkan daftar aktivitas; ada fungsi verifikasi yang bisa menunjukkan apakah rantainya utuh. Ini bagian yang paling banyak mengubah cara saya berpikir tentang “bukti”.

### Multi-tenant sejak awal

Data tenant dipisahkan dengan `tenant_id` dan RLS. Saya membuat dua tenant demo untuk menguji apakah satu tenant bisa melihat data tenant lain — dan memastikan jawabannya tidak.

### UI yang membaca pekerjaan, bukan menampilkan semua angka

Ikhtisar disusun per peran: apa yang perlu ditindaklanjuti lebih dulu, satu fokus utama, metrik pendukung, lalu detail. Saya ingin melihat apakah hierarki informasi bisa membuat dashboard terasa lebih tenang.

### Data demo yang punya sejarah

Demo berisi 15 bulan data sintetis, 32 personel di 8 divisi, 45 batch payroll, 273 klaim, dan 470 payslip. Tujuannya bukan membuat angka terlihat besar, tetapi agar tren, status, dan laporan bisa dibaca dalam konteks.

---

## Keputusan yang saya pelajari

- **Policy versioning + checksum** — menjaga transaksi lama tetap valid saat aturan berubah.
- **Maker ≠ checker ≠ payer** — menegakkan pemisahan peran di UI, API, dan database.
- **Hash-chained audit** — membuat jejak yang bisa diperiksa, bukan hanya dicatat.
- **RLS + tenant binding** — menjaga isolasi tenant tanpa bergantung pada kode aplikasi.
- **Role-based home** — mengurangi noise tanpa menyembunyikan informasi penting.
- **Deterministic demo seed** — membuat data demo bisa diulang dan diuji.

---

## Batasan

Bagian dari eksplorasi adalah mengetahui di mana batasnya.

- Perhitungan PPh 21/BPJS di demo adalah aproksimasi untuk kebutuhan data, bukan perhitungan resmi.
- Mobile table-to-card dan penyempurnaan form (Phase 3–4) ditunda.
- Beberapa modul HRIS seperti performance review dan org chart visual masih backlog.
- Demo memakai data sintetis dan provider pembayaran mock; tidak ada uang nyata.
- Monitoring production masih menunggu beberapa run terjadwal untuk sign-off.

Kalau saya membangunnya lagi, saya ingin memulai dari domain model dan test kontrak lebih dulu, lalu UI. Saya juga ingin menulis lebih banyak test untuk jalur kegagalan, bukan hanya happy path.

---

## Yang saya pelajari

- Governance tidak bisa ditempel di akhir. Pemisahan peran dan audit harus menjadi bagian dari desain data dan API.
- Angka tanpa konteks mudah menyesatkan. Dashboard yang baik membantu orang memilih apa yang perlu diperiksa.
- Batasan adalah bagian dari cerita. Menuliskan apa yang belum selesai membuat klaim menjadi lebih jujur.
- Demo data adalah alat desain. Data 15 bulan membuat masalah seperti tren, status, dan laporan terasa lebih nyata.

---

## CTA

Kalau Anda sedang membangun sistem klaim, payroll, atau approval yang serupa, saya senang berdiskusi tentang trade-off-nya.

`Lihat demo` · `Baca catatan teknis` · `Lihat repository`

---

## SEO

**Title:** Aletheia — Eksplorasi disbursement governance & MIS

**Description:** Eksplorasi fullstack untuk klaim, payroll, dan MIS: policy versioning, segregation of duties, audit hash chain, dan dashboard per peran. Data sintetis; bukan klaim pengalaman profesional.
