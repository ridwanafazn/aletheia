# Aletheia — Portfolio Copy

Framing: **catatan eksplorasi**, bukan klaim pengalaman atau keahlian profesional. Tulis dengan tenang, spesifik, dan jujur soal batasan.

---

## 1. Hero

**Title:** Aletheia

**Subtitle / one-liner:**
Ruang eksplorasi fullstack untuk klaim, payroll, dan MIS.

**Supporting line (pilih satu):**

- “Bukan klaim pengalaman industri — ini catatan belajar membangun sistem yang harus bisa menjelaskan ke mana uang pergi.”
- “Sebuah latihan membangun alur disbursement yang punya policy, pemisahan peran, dan jejak audit.”
- “Eksplorasi pribadi tentang bagaimana uang, approval, pajak, dan audit bertemu di satu sistem.”

**Metadata yang disarankan:**

| Field | Isi |
| --- | --- |
| Peran | Eksplorasi fullstack / solo build |
| Stack | React 19 · TypeScript · PostgreSQL · Go · Cloudflare |
| Fokus | Disbursement governance, payroll, MIS |
| Status | Live demo · data sintetis |
| Dataset | 15 bulan histori · 32 personel · 8 divisi |

---

## 2. Ringkasan

Aletheia adalah ruang eksplorasi saya untuk memahami bagaimana sistem disbursement bekerja ketika uang, approval, pajak, dan audit bertemu. Di dalamnya ada klaim, payroll, laporan PPh 21/BPJS, KPI lintas cabang, dan audit hash chain — semuanya memakai data sintetis.

Saya tidak membangun ini untuk mengklaim pengalaman profesional di industri HRIS atau payroll. Saya membangunnya untuk belajar: bagaimana membuat keputusan finansial bisa dipertanggungjawabkan, bagaimana aturan bisa berubah tanpa merusak transaksi lama, dan bagaimana antarmuka bisa membantu orang mengambil keputusan, bukan sekadar menampilkan angka.

Demo ini bisa dilihat sebagai **latihan sistem**: ada bagian yang sudah berjalan, ada bagian yang sengaja ditunda, dan ada keputusan yang saya akan ubah kalau membangunnya lagi.

---

## 3. Kenapa saya membangun ini

Saya tertarik pada pertanyaan yang terlihat sederhana: **ke mana uang pergi, siapa yang menyetujui, dan bagaimana kita tahu catatannya tidak diubah?**

Di banyak demo, pertanyaan itu berhenti di “tombol approve berfungsi”. Saya ingin mendorongnya sedikit lebih jauh: apa yang terjadi kalau aturan berubah di tengah jalan, kalau pembuat dan penyetuju adalah orang yang sama, kalau dua orang menyetujui bersamaan, atau kalau ada data yang perlu disamarkan. Aletheia adalah tempat saya mencoba menjawab pertanyaan-pertanyaan itu dengan kode, test, dan bukti yang bisa diperiksa.

---

## 4. Yang saya eksplorasi

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

## 5. Keputusan yang paling saya pelajari

| Keputusan | Yang saya coba pahami |
| --- | --- |
| Policy versioning + checksum | Bagaimana menjaga transaksi lama tetap valid saat aturan berubah |
| Maker ≠ checker ≠ payer | Di lapisan mana pemisahan peran harus ditegakkan |
| Hash-chained audit | Bagaimana membuat jejak yang bisa diperiksa, bukan hanya dicatat |
| RLS + tenant binding | Apakah isolasi tenant bisa dijaga tanpa bergantung pada kode aplikasi |
| Role-based home | Bagaimana mengurangi noise tanpa menyembunyikan informasi penting |
| Deterministic demo seed | Bagaimana membuat data demo bisa diulang dan diuji |

---

## 6. Yang belum selesai

Saya sengaja menuliskan ini karena bagian dari eksplorasi adalah mengetahui di mana batasnya.

- Perhitungan PPh 21/BPJS di demo adalah aproksimasi untuk kebutuhan data, bukan perhitungan resmi.
- Mobile table-to-card dan penyempurnaan form (Phase 3–4) ditunda.
- Beberapa modul HRIS seperti performance review dan org chart visual masih backlog.
- Demo memakai data sintetis dan provider pembayaran mock; tidak ada uang nyata.
- Monitoring production masih menunggu beberapa run terjadwal untuk sign-off.

Kalau saya membangunnya lagi, saya ingin memulai dari domain model dan test kontrak lebih dulu, lalu UI. Saya juga ingin menulis lebih banyak test untuk jalur kegagalan, bukan hanya happy path.

---

## 7. Yang saya pelajari

- **Governance tidak bisa ditempel di akhir.** Pemisahan peran dan audit harus menjadi bagian dari desain data dan API.
- **Angka tanpa konteks mudah menyesatkan.** Dashboard yang baik membantu orang memilih apa yang perlu diperiksa.
- **Batasan adalah bagian dari cerita.** Menuliskan apa yang belum selesai membuat klaim menjadi lebih jujur.
- **Demo data adalah alat desain.** Data 15 bulan membuat masalah seperti tren, status, dan laporan terasa lebih nyata.

---

## 8. CTA

**Soft CTA:**
“Kalau Anda sedang membangun sistem klaim, payroll, atau approval yang serupa, saya senang berdiskusi tentang trade-off-nya.”

**Tombol:**
- `Lihat demo`
- `Baca catatan teknis`
- `Lihat repository`

---

## 9. SEO / metadata

**Meta title:**
Aletheia — Eksplorasi disbursement governance & MIS

**Meta description:**
Eksplorasi fullstack untuk klaim, payroll, dan MIS: policy versioning, segregation of duties, audit hash chain, dan dashboard per peran. Data sintetis; bukan klaim pengalaman profesional.

**OG image alt:**
Banner Aletheia dengan tampilan MIS Intelligence dan keterangan “Ruang eksplorasi fullstack untuk klaim, payroll, dan MIS”.

**Banner alt:**
Aletheia — banner portfolio dengan judul Aletheia, tampilan dashboard MIS Intelligence, dan label “Live demo”.

---

## 10. Gallery

Caption pendek untuk lightbox:

| File | Caption | Alt |
| --- | --- | --- |
| `01-login.png` | Login dengan pemilihan akun demo per peran. | Halaman login Aletheia dengan carousel akun demo. |
| `02-overview-finance.png` | Ikhtisar Manajer Keuangan: antrean tindakan, fokus payroll, dan tren enam bulan. | Dashboard Ikhtisar untuk peran Manajer Keuangan. |
| `03-command-palette.png` | Command palette untuk navigasi dan aksi cepat lintas halaman. | Command palette Aletheia dengan daftar halaman dan aksi. |
| `04-payroll-console.png` | Konsol Payroll: batch per cabang dan periode dengan status pencairan. | Tabel batch payroll di Konsol Payroll. |
| `05-organization.png` | Struktur Organisasi: delapan divisi dan 32 personel. | Halaman Struktur Organisasi dengan kartu departemen. |
| `06-claims.png` | Ruang Klaim: status, risiko, dan konflik dalam satu daftar. | Tabel klaim dengan status dan flag konflik. |
| `07-mis-intelligence.png` | MIS Intelligence: KPI cabang, approval rate, dan tren payroll/klaim. | Dashboard MIS Intelligence dengan KPI dan tabel cabang. |
| `08-ruang-saya-mobile.png` | Ruang Saya di mobile: slip, absensi, cuti, lembur, dan reimburse. | Halaman Ruang Saya pada layar mobile. |

---

## 11. Jangan tulis

Hindari klaim yang tidak bisa dibuktikan atau terdengar seperti CV senior:

- “Enterprise-grade platform.”
- “Production-ready untuk perusahaan.”
- “Saya ahli dalam payroll Indonesia.”
- “Digunakan oleh banyak perusahaan.”
- “Menyelesaikan masalah HRIS secara menyeluruh.”

Ganti dengan bahasa eksplorasi:

- “Saya mencoba memahami…”
- “Eksplorasi ini berfokus pada…”
- “Yang saya pelajari dari keputusan ini…”
- “Demo ini memakai data sintetis dan masih memiliki batasan…”
