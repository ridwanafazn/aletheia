# `00-context-and-vision.md` — Konstitusi Domain, Tata Kelola & Batas Layanan Aletheia

* **Nama Sistem:** Aletheia (*Enterprise Disbursement Governance & MIS Intelligence Platform*)

* **Status Dokumen:** Konstitusi Utama (*Single Source of Truth* untuk Orkestrasi Agen OpenCode)

* **Arsitektur Target:** *Cloud-Native Microservices* (React TypeScript, Cloudflare Workers GraphQL/REST Gateway, Express.js Services, Go Async Worker, Neon PostgreSQL, Upstash Redis & QStash, Cloudinary, OpenTelemetry) dengan **monorepo + deploy terpisah**, **tenant-ready schema**, dan **payment adapter**.

## 1. Filosofi Inti: *Policy-as-Reference*

Sebagian besar perangkat lunak manajemen keuangan dan sumber daya manusia gagal beradaptasi karena menganggap aturan bisnis perusahaan sebagai kebenaran mutlak yang ditanam mati di dalam logika aplikasi. Pada kenyataannya, standar persetujuan klaim, skema komisi agen, hingga metrik evaluasi cabang hanyalah **kesepakatan referensi** yang berbeda antarperusahaan dan dinamis setiap periode.

**Aletheia** (berasal dari konsep filsafat Yunani yang berarti *kebenaran yang tersingkap*) dibangun di atas premis bahwa kebenaran suatu transaksi tidak ditentukan oleh asumsi pembuat kode, melainkan oleh **referensi kebijakan berversi yang sah saat transaksi tersebut terjadi**.

Untuk menjaga integritas sistem sekaligus fleksibilitas bisnis, Aletheia memisahkan seluruh aturan menjadi dua kategori mutlak:

1. **Preferensi Bisnis yang Dinamis (*Mutable Policy References*):** Batas nominal persetujuan otomatis, jenjang otorisasi cabang, bobot skor kelayakan klaim, serta rumus insentif agen. Seluruh parameter ini disimpan sebagai entitas kebijakan berversi yang dapat diperbarui tanpa mengubah kode aplikasi dan tanpa merusak keabsahan transaksi masa lalu.

2. **Invarian Sistem yang Tidak Dapat Dinegosiasikan (*Non-Negotiable System Invariants*):**

   * **Kepatuhan Regulasi Eksternal:** Perhitungan lapisan tarif pajak penghasilan (PPh 21) dan persentase iuran jaminan sosial (BPJS) wajib mengikuti formula matematis yang akurat dan dapat diaudit.

   * **Hukum Kekekalan Pencairan (*Zero Double-Disbursement*):** Satu pengajuan klaim atau satu item dalam gelombang penggajian (*payroll batch*) tidak boleh dicairkan lebih dari satu kali dalam kondisi jaringan atau konkurensi apa pun.

   * **Kekekalan Jejak Audit (*Immutable Audit Trail*):** Catatan sejarah transaksi dan keputusan persetujuan bersifat permanen (*append-only*) dan haram diubah maupun dihapus oleh peran apa pun.

## 2. Tujuh Pilar Kapabilitas Orisinal

Agar tidak terjebak menjadi aplikasi CRUD generik, seluruh pengembangan fitur di Aletheia wajib berporos pada tujuh kapabilitas utama berikut:

### Pilar 1: Mesin Kebijakan Berversi (*Versioned Policy-as-Reference Engine*)

Setiap transaksi klaim nasabah maupun gelombang penggajian karyawan/agen wajib mengikatkan dirinya pada nomor versi kebijakan aktif saat transaksi dibuat. Jika manajemen menerbitkan kebijakan versi baru pada bulan berikutnya, transaksi baru otomatis mengikuti referensi terbaru, sementara transaksi lama tetap dievaluasi dan diaudit berdasarkan referensi historisnya.

### Pilar 2: Ruang Simulasi *"What-If"* untuk Analis MIS

Tim analis Management Information System (MIS) tidak hanya membutuhkan laporan masa lalu, tetapi juga alat bantu pengambilan keputusan strategis. Aletheia menyediakan *sandbox* analitik terisolasi tempat analis MIS dapat menduplikasi kebijakan aktif, mengubah variabel simulasi (misalnya menaikkan batas persetujuan otomatis klaim atau menyesuaikan persentase komisi agen), lalu menjalankannya terhadap data historis untuk memproyeksikan dampak arus kas tanpa menyentuh data produksi.

### Pilar 3: Deteksi Anomali & Benturan Kepentingan Lintas-Domain

Aplikasi konvensional memisahkan modul klaim nasabah dan modul penggajian/komisi secara buta. Aletheia menyatukan keduanya di bawah lapisan intelijen risiko untuk mendeteksi potensi kecurangan lintas-modul secara otomatis—seperti menandai pengajuan klaim nasabah yang nomor rekening bank, nomor identitas, atau kontak penerimanya beririsan dengan data karyawan internal maupun agen terdaftar di modul *payroll*.

### Pilar 4: Jejak Audit Kontekstual (*Explainable Audit Trail*)

Setiap perubahan status transaksi tidak hanya mencatat pelaku dan waktu kejadian, tetapi juga merekam **konteks referensi** di baliknya: versi kebijakan mana yang dijadikan dasar pengambilan keputusan, skor kelayakan dokumen saat itu, status pengecekan benturan kepentingan, serta alasan eksplisit di balik keputusan persetujuan atau penolakan.

### Pilar 5: Transparansi Payroll & Pelaporan (*Payroll Evidence*)

Aletheia tidak berhenti pada “menghitung gaji”. Setiap batch menghasilkan **payslip yang dapat ditelusuri**, rekap **PPh 21 bulanan dan tahunan**, laporan **BPJS karyawan dan employer**, serta **bank transfer file** dengan checksum. Semua laporan dirender dari angka yang tersimpan, bukan dihitung ulang, sehingga angka di layar, payslip, dan laporan selalu identik.

### Pilar 6: Kesiapan Multi-Tenant & Disbursement Berbasis Adapter

Sejak desain, setiap data membawa `tenant_id` dan kebijakan dapat berbeda per tenant. Pencairan dana tidak terikat pada satu bank/provider: `packages/payments` mendefinisikan `PaymentProvider` dengan implementasi mock untuk demo dan adapter Xendit/Midtrans opsional. Ini membuat Aletheia relevan untuk perusahaan HR services yang melayani banyak klien, tanpa mengorbankan kontrol.

### Pilar 7: Bukti, Bukan Klaim (*Evidence-Driven Engineering*)

Setiap kemampuan harus punya artefak: test otomatis, query plan, load test, screenshot, ADR, dan demo live. Matriks targeting di `docs/13-job-targeting-matrix.md` memetakan setiap requirement lowongan ke artefak yang dapat dilihat perekrut.

## 3. Pemetaan *Bounded Context* (Topologi Microservices)

Sistem dipecah menjadi empat domain layanan inti, ditambah edge gateway dan shared packages, untuk menjamin pemisahan tanggung jawab (*separation of concerns*), isolasi kegagalan, dan skalabilitas terukur:

| Bounded Context | Runtime Utama | Tanggung Jawab Inti | Batasan Tegas (*Boundary Rule*) | 
| ----- | ----- | ----- | ----- | 
| **1. Identity & Policy Governance** | Express.js (TypeScript) | Autentikasi, tenant & RBAC, registrasi & versi kebijakan referensi, verifikasi *immutable audit trail*, serta manajemen sesi/refresh token. | Pemilik skema, migrasi, dan verifikasi audit; layanan lain hanya boleh menulis melalui fungsi audit yang aman. Satu-satunya layanan yang berhak menerbitkan versi kebijakan baru. | 
| **2. Claims Operations** | Express.js (TypeScript) | Penerimaan pengajuan klaim nasabah, pengelolaan metadata dokumen bukti (via Cloudinary), alur persetujuan berjenjang, dan pencairan klaim via payment adapter. | Tidak menghitung analitik lintas-cabang secara langsung; wajib mengikat setiap klaim ke ID versi kebijakan aktif dan `tenant_id`. | 
| **3. Payroll & Incentive Engine** | Express.js (TypeScript) + Go Worker | Pengelolaan data master karyawan/agen (HRIS-lite), ringkasan absensi/cuti, kalkulasi deterministik PPh 21 (TER + tahunan) & BPJS (karyawan + employer), payslip, laporan pajak/BPJS, serta pencairan massal asinkron. | Wajib menerapkan idempotensi di setiap siklus *batch*; laporan dirender dari angka tersimpan; data bulanan tidak boleh ditimpa oleh rekonsiliasi tahunan. | 
| **4. MIS Intelligence & Risk Analytics** | Express.js (TypeScript) + Go Worker | Agregasi laporan eksekutif lintas-cabang, pemrosesan simulasi *What-If*, dan pemindaian anomali/benturan kepentingan lintas-modul. | Bersifat *read-only* terhadap data transaksi utama; tidak boleh memodifikasi status klaim, nominal *payroll*, atau data laporan. | 
| **Edge API Gateway & BFF** | Cloudflare Workers | Gerbang masuk tunggal, validasi token JWT, pembatasan laju permintaan (*rate limiting*), serta lapisan **GraphQL** untuk agregasi data dasbor. | Tidak menyimpan status sesi lokal (*stateless*), tidak menjalankan logika bisnis berat, dan wajib meneruskan `tenant_id` dari token. | 
| **Shared Packages** | TypeScript & Go libraries | `shared-contracts` (Zod/OpenAPI/SDL), `payments` (PaymentProvider + mock), `observability` (OTel/logger). | Tidak boleh bergantung pada `apps/*` atau `services/*`; kontrak tidak boleh diduplikasi. | 

## 4. Tata Kelola Peran & Matriks Hak Akses (RBAC)

Aletheia menerapkan prinsip **Segregation of Duties (Maker–Checker–Approver)** secara ketat. Pengguna yang membuat atau mengubah pengajuan (*Maker*) secara sistemik dilarang menyetujui (*Approve*) pengajuannya sendiri, meskipun memiliki hak akses administratif.

| Peran Pengguna | Kategori Fungsi | Wewenang & Batasan Akses Spesifik | 
| ----- | ----- | ----- | 
| **Claims Officer** | *Maker* (Operasional Klaim) | Membuat draf pengajuan klaim baru, mengunggah dokumen bukti nasabah, merevisi pengajuan yang dikembalikan, dan melihat status klaim khusus di wilayah cabangnya. Dilarang menyetujui klaim dan dilarang mengakses data gaji karyawan. | 
| **HR & Payroll Specialist** | *Maker* (Operasional Internal) | Mengelola profil kompensasi karyawan dan agen, memicu kalkulasi simulasi *batch payroll* (potongan PPh 21 & BPJS), dan mengajukan draf pencairan bulanan. Dilarang mencairkan dana tanpa persetujuan *Finance Manager*. | 
| **Branch Manager** | *Checker & Approver (Level 1)* | Memeriksa kelengkapan dokumen klaim, meninjau peringatan anomali, dan menyetujui/menolak klaim Level 1 sesuai batas kewenangan pada kebijakan aktif. Dilarang menyetujui klaim yang ia buat sendiri dan dilarang mencairkan dana. | 
| **Finance Manager** | *Approver (Level 2) & Disburser* | Menyetujui eskalasi Level 2, menyetujui batch payroll, dan mengeksekusi pencairan melalui payment adapter. Dilarang menyetujui klaim/batch yang ia buat sendiri; wajib mengisi alasan penolakan. | 
| **MIS Analyst** | *Read-Only Intelligence* | Mengakses seluruh dasbor analitik lintas-cabang, menjalankan kueri filter laporan kompleks, mengekspor ringkasan eksekutif, dan mengoperasikan *What-If Simulation Sandbox*. Tidak memiliki hak ubah pada transaksi operasional. | 
| **Compliance & System Admin** | *Governance & Audit* | Mengelola penetapan peran pengguna (RBAC), menerbitkan versi baru referensi kebijakan (tarif pajak, batas BPJS, batas persetujuan), serta menginspeksi seluruh catatan *immutable audit trail*. | 

Seluruh peran di atas beroperasi di dalam **tenant** (perusahaan klien) dan **cabang**. `tenant_id` diambil dari token yang terverifikasi, bukan dari input pengguna; setiap query, unique constraint, dan audit row menyertakan `tenant_id`. RLS diaktifkan sebelum produksi.

## 5. Siklus Hidup Transaksi End-to-End

### Alur A: Pengajuan hingga Pencairan Klaim

1. **Inisiasi (*Maker*):** *Claims Officer* menginput rincian klaim dan mengunggah dokumen bukti ke penyimpanan objek aman. Sistem otomatis menyematkan ID versi kebijakan klaim yang sedang aktif.

2. **Evaluasi Otomatis (*Async Risk Check*):** Pekerja asinkron memeriksa kelengkapan syarat berdasarkan versi kebijakan tersebut sekaligus memindai potensi benturan kepentingan (pencocokan rekening/identitas dengan basis data karyawan dan agen).

3. **Verifikasi Berjenjang (*Checker/Approver*):** *Branch Manager* (Level 1) atau *Finance Manager* (Level 2) meninjau hasil evaluasi sistem. Jika nominal berada di dalam batas kewenangannya dan bebas bendera merah (*red flag*), manajer dapat menyetujui; jika melebihi batas, sistem otomatis meneruskan status ke jenjang otorisasi lebih tinggi.

4. **Finalisasi, Pencairan & Pencatatan:** Status berubah menjadi disetujui, jejak audit kontekstual terkunci permanen, dan ringkasan metrik diperbarui. Pencairan dilakukan oleh `FINANCE_MANAGER` melalui payment adapter; status klaim menjadi `DISBURSED` hanya setelah provider mengembalikan `PAID`. Retry tidak pernah menggandakan dana.

### Alur B: Kalkulasi & Pencairan Massal *Payroll* serta Insentif

1. **Persiapan Periode (*Maker*):** *HR & Payroll Specialist* memilih periode penggajian dan mengikatnya pada versi referensi regulasi PPh 21, BPJS, serta skema komisi agen yang berlaku.

2. **Kalkulasi *Batch* Asinkron:** Pekerja konkuren memproses seluruh daftar penerima secara paralel—menghitung komponen penghasilan bruto, tunjangan, komisi agen, potongan BPJS, dan pajak PPh 21—lalu menghasilkan draf rincian per individu.

3. **Validasi & Penguncian (*Approver*):** *Finance Manager* meninjau total rekapitulasi anggaran dan anomali selisih gaji dibandingkan bulan sebelumnya, lalu memberikan persetujuan final.

4. **Eksekusi Idempoten & Pelaporan:** Sistem mengeksekusi pencairan dengan kunci unik per periode dan per penerima sehingga percobaan ulang akibat gangguan jaringan tidak akan pernah menggandakan dana. Setelah `PAID`, sistem menghasilkan payslip, rekap PPh 21 bulanan, laporan BPJS (karyawan + employer), bank transfer file, dan payroll variance—semua dengan checksum dan audit unduhan.

### Alur C: Intelijen MIS & Simulasi Kebijakan

1. **Agregasi Lintas-Domain:** Layanan analitik mengompilasi data rasio persetujuan klaim, waktu penyelesaian rata-rata (*SLA*), tren pengeluaran per cabang, serta rasio beban *payroll* terhadap batas anggaran.

2. **Eksperimen *What-If*:** *MIS Analyst* menyalin referensi kebijakan aktif ke ruang simulasi, mengubah parameter ambang batas persetujuan atau rumus komisi, dan membandingkan proyeksi total biaya antara skenario aktual dan skenario simulasi sebagai bahan rekomendasi kebijakan kepada direksi.

### Alur D: HRIS-lite, Payslip & Pelaporan Pajak/BPJS

1. **Data Master (*HR Specialist*):** Profil karyawan/agen, status PTKP, kontrak, dan ringkasan absensi/cuti periode disiapkan. NIK dan rekening disimpan sebagai hash + masked.
2. **Kalkulasi (*Go Worker*):** Batch dihitung dengan policy version terikat: gross, komisi, BPJS karyawan/employer, PPh 21 TER, net. Breakdown disimpan per item.
3. **Persetujuan & Pencairan (*Finance Manager*):** Variance dan anomali ditinjau; batch disetujui dan dicairkan secara idempoten.
4. **Payslip & Laporan:** Payslip dirender dari breakdown tersimpan; rekap PPh 21 bulanan, laporan BPJS, bank file, dan payroll variance dihasilkan dengan checksum. Di akhir tahun, rekonsiliasi PPh 21 tahunan memposting selisih tanpa menimpa data bulanan.

## 6. Konstitusi & Batasan Keras untuk Agen OpenCode

> **Instruksi Wajib bagi Seluruh Agen Pengembangan:**
>
> 1. **Dilarang Menanam Aturan Statis (*No Hardcoded Business Rules*):** Jangan pernah menuliskan angka batas nominal persetujuan klaim, persentase komisi, atau tarif pajak secara langsung sebagai konstanta mati di dalam kode layanan. Selalu ambil parameter dari entitas *Policy Reference* yang terikat pada transaksi.
>
> 2. **Penegakan *Segregation of Duties* di Tingkat API:** Validasi pemisahan antara pembuat transaksi (*Maker*) dan pemberi persetujuan (*Approver*) wajib ditegakkan di lapisan backend, bukan sekadar menyembunyikan tombol di antarmuka React.
>
> 3. **Isolasi Total *What-If Sandbox*:** Proses simulasi kebijakan oleh *MIS Analyst* wajib berjalan di atas salinan memori atau kueri baca terisolasi dan tidak boleh menulis perubahan ke tabel transaksi klaim maupun *payroll* produksi.
>
> 4. **Perlindungan Jejak Audit:** Jangan pernah menyediakan titik akhir (*endpoint*) atau fungsi layanan yang memungkinkan operasi pembaruan (*update*) maupun penghapusan (*delete*) terhadap catatan log audit.
>
> 5. **Kesiapan *Free-Tier Cloud-Native*:** Setiap layanan harus dirancang *stateless* tanpa ketergantungan pada penyimpanan berkas lokal di dalam kontainer, sehingga siap dijalankan secara efisien di atas infrastruktur Cloudflare, Neon, Upstash, dan Cloudinary.
>
> 6. **Isolasi Tenant:** Setiap tabel, query, unique constraint, dan audit row wajib menyertakan `tenant_id` yang berasal dari token terverifikasi. Dilarang menerima `tenant_id` dari body/query. RLS wajib aktif sebelum produksi.
>
> 7. **Audit Atomic & Append-Only:** Perubahan status finansial dan audit row ditulis dalam transaksi yang sama. Audit hanya boleh ditulis melalui fungsi `append_audit_log()`; tidak ada `INSERT`/`UPDATE`/`DELETE` langsung, dan hash chain diserialisasi per tenant.
>
> 8. **Disbursement Berbasis Adapter:** Pencairan klaim/payroll wajib melalui `PaymentProvider` di `packages/payments`; status `PAID` hanya dari provider (atau mock) dan tidak boleh diubah manual. Retry tidak boleh menggandakan pembayaran.
>
> 9. **Lingkup HRIS-lite Dikunci:** Absensi clock-in/out, shift scheduling, rekrutmen, performance, dan THR otomatis adalah *future development*; dilarang masuk milestone tanpa keputusan baru.
>
> 10. **Bukti di Atas Klaim:** Setiap kemampuan wajib memiliki test, query plan, load test, screenshot, atau ADR yang dapat diperiksa. Matriks targeting di `docs/13-job-targeting-matrix.md` wajib diperbarui.