import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const OUTPUT = resolve(ROOT, "docs/guides");
mkdirSync(OUTPUT, { recursive: true });

const LOGO = readFileSync(resolve(ROOT, "apps/web/public/brand/aletheia-mark.svg"), "utf8");
const LOGIN_URL = "https://aletheia-web-preview.pages.dev";
const TENANT = "SEIHITSU";
const PASSWORD = "AletheiaDemo!2026";

const STATUS = {
  claims: [
    ["DRAFT", "Belum dikirim; masih bisa diubah."],
    ["SUBMITTED", "Sudah dikirim dan menunggu review."],
    ["UNDER_REVIEW", "Sedang diperiksa approver."],
    ["RETURNED", "Dikembalikan untuk perbaikan data/dokumen."],
    ["ESCALATED", "Naik ke Finance karena nominal atau risiko."],
    ["COMPLIANCE_REVIEW", "Ditahan untuk review kepatuhan."],
    ["APPROVED", "Disetujui; menunggu pencairan."],
    ["REJECTED", "Ditolak; alasan tercatat di jejak keputusan."],
    ["DISBURSED", "Sudah dicairkan ke rekening pemohon."],
  ],
  payroll: [
    ["DRAFT", "Batch baru dibuat, belum dihitung."],
    ["CALCULATING", "Worker sedang menghitung komponen payroll."],
    ["READY_FOR_APPROVAL", "Siap diperiksa dan disetujui Finance."],
    ["APPROVED", "Disetujui; menunggu pencairan."],
    ["DISBURSING", "Pencairan sedang diproses."],
    ["DISBURSED", "Seluruh item sudah dibayar."],
    ["PARTIAL", "Sebagian item berhasil dibayar."],
    ["FAILED", "Pencairan gagal dan perlu ditindaklanjuti."],
  ],
};

const guides = [
  {
    file: "panduan-petugas-klaim.pdf",
    role: "Petugas Klaim",
    code: "CLAIMS_OFFICER",
    email: "officer.bdg@aletheia.id",
    accent: "#2f4bd8",
    tagline: "Membuat, melengkapi, dan mengirim klaim dengan data yang bersih.",
    summary:
      "Anda adalah titik masuk klaim. Tugas utama Anda memastikan klaim lengkap sejak awal, dokumen sesuai, dan status klaim terus dipantau sampai keputusan atau pencairan.",
    menus: [
      ["Ikhtisar", "Melihat klaim yang perlu dilengkapi, menunggu keputusan, dan flag konflik."],
      ["Ruang Klaim", "Mencari klaim, membuat klaim baru, melihat detail, dan mengirim klaim."],
      ["Klaim Baru", "Form pengajuan klaim: pemohon, kategori, nominal, dan dokumen."],
    ],
    workflowTitle: "Alur kerja klaim",
    workflow: [
      [
        "Buka Ikhtisar",
        "Periksa kartu “Klaim perlu dilengkapi” dan “Menunggu keputusan”. Mulai dari item yang paling lama.",
      ],
      [
        "Buat klaim",
        "Klik “Buat klaim”, isi nama pemohon, NIK, rekening, kategori, nominal, dan unggah dokumen pendukung.",
      ],
      [
        "Lengkapi dokumen",
        "Kategori HEALTH biasanya memerlukan identitas dan invoice medis; ACCIDENT memerlukan laporan polisi; sesuaikan dengan kategori.",
      ],
      [
        "Kirim klaim",
        "Periksa kembali nominal dan rekening. Setelah dikirim, status berubah menjadi SUBMITTED dan nominal tidak boleh diubah diam-diam.",
      ],
      [
        "Pantau status",
        "Gunakan Ruang Klaim untuk melihat UNDER_REVIEW, ESCALATED, COMPLIANCE_REVIEW, APPROVED, atau DISBURSED.",
      ],
      [
        "Tangani RETURNED",
        "Buka detail, baca alasan pengembalian, perbaiki data/dokumen, lalu kirim ulang. Jangan membuat klaim duplikat.",
      ],
      [
        "Tangani flag konflik",
        "Jika muncul flag konflik rekening/NIK, jangan mengabaikan. Lengkapi penjelasan dan koordinasikan dengan Compliance.",
      ],
    ],
    checklist: [
      "Cek klaim DRAFT dan RETURNED sebelum membuat klaim baru.",
      "Pastikan NIK dan rekening sesuai dokumen; data ini di-mask di UI.",
      "Cek nominal terhadap kategori dan batas kewenangan cabang.",
      "Pastikan tidak ada klaim ganda untuk kejadian yang sama.",
      "Pantau klaim ESCALATED dan COMPLIANCE_REVIEW setiap hari.",
      "Baca jejak keputusan sebelum menghubungi approver.",
    ],
    tips: [
      "Gunakan pencarian command palette (Ctrl/Cmd+K) untuk membuka Ruang Klaim atau Klaim Baru.",
      "Nomor klaim adalah identifier utama; gunakan nomor itu saat berkoordinasi.",
      "Jika ragu soal kategori, pilih kategori yang paling dekat dan jelaskan konteks di catatan.",
    ],
    warnings: [
      "Jangan menggunakan data pelanggan nyata. Semua data demo sintetis.",
      "Jangan meminta atau menyimpan password rekan kerja.",
      "Jangan mengubah nominal setelah klaim disetujui; gunakan alur koreksi resmi.",
    ],
  },
  {
    file: "panduan-manajer-cabang.pdf",
    role: "Manajer Cabang",
    code: "BRANCH_MANAGER",
    email: "manager.bdg@aletheia.id",
    accent: "#0e9384",
    tagline: "Mengambil keputusan cabang dengan jejak alasan yang jelas.",
    summary:
      "Anda memutuskan klaim level cabang, cuti, lembur, dan reimburse. Fokus Anda bukan mengerjakan semua hal, tetapi memastikan keputusan cepat, adil, dan dapat diaudit.",
    menus: [
      ["Ikhtisar", "Antrean keputusan cabang, eskalasi klaim, cuti/lembur, dan reimburse."],
      ["Ruang Klaim", "Melihat detail klaim dan riwayat keputusan."],
      ["Antrean Persetujuan", "Menyetujui atau menolak klaim level 1."],
      ["Cuti dan Lembur", "Memutuskan pengajuan cuti, lembur, dan reimburse."],
      ["Struktur Organisasi", "Melihat personel, posisi, dan atasan langsung."],
    ],
    workflowTitle: "Alur keputusan cabang",
    workflow: [
      [
        "Buka Ikhtisar",
        "Mulai dari “Perlu tindakan”. Antrean diurutkan berdasarkan dampak, bukan sekadar tanggal.",
      ],
      [
        "Periksa klaim",
        "Buka detail klaim: nominal, kategori, risk score, flag konflik, dokumen, dan riwayat.",
      ],
      [
        "Ambil keputusan",
        "Setujui jika dokumen lengkap dan nominal dalam kewenangan. Tolak atau kembalikan dengan alasan minimal 15 karakter.",
      ],
      [
        "Eskalasi bila perlu",
        "Klaim di atas kewenangan atau berisiko tinggi diteruskan ke Finance/Compliance; jangan memecah nominal untuk menghindari batas.",
      ],
      [
        "Putuskan cuti/lembur",
        "Cek saldo cuti, tanggal bentrok, beban tim, dan kebutuhan operasional sebelum menyetujui.",
      ],
      [
        "Putuskan reimburse",
        "Cocokkan tanggal, kategori, nominal, dan bukti. Reimburse yang dibayar harus melalui Finance, bukan approver yang sama.",
      ],
      [
        "Tutup antrean",
        "Pastikan tidak ada item PENDING yang tertinggal sebelum akhir hari kerja.",
      ],
    ],
    checklist: [
      "Buka antrean persetujuan setiap pagi dan sebelum pulang.",
      "Baca alasan pengajuan, bukan hanya nominal.",
      "Cek konflik kepentingan: jangan menyetujui pengajuan sendiri atau bawahan langsung tanpa jalur yang benar.",
      "Berikan alasan keputusan yang spesifik dan dapat dipahami pemohon.",
      "Pantau klaim ESCALATED agar tidak menumpuk di Finance.",
      "Cek Struktur Organisasi saat ada personel baru atau mutasi.",
    ],
    tips: [
      "Gunakan Ctrl/Cmd+K untuk membuka Antrean Persetujuan dengan cepat.",
      "Keputusan yang baik menjelaskan “apa” dan “mengapa”, bukan hanya “disetujui”.",
      "Jika data tidak lengkap, kembalikan (RETURNED) daripada menolak permanen.",
    ],
    warnings: [
      "Jangan menyetujui klaim yang Anda ajukan sendiri.",
      "Jangan menurunkan nominal klaim tanpa dasar dan catatan.",
      "Jangan membagikan tautan keputusan atau token sesi.",
    ],
  },
  {
    file: "panduan-manajer-keuangan.pdf",
    role: "Manajer Keuangan",
    code: "FINANCE_MANAGER",
    email: "finance.vp@aletheia.id",
    accent: "#b54708",
    tagline: "Mengendalikan payroll, pencairan, dan kesehatan biaya.",
    summary:
      "Anda adalah kontrol terakhir sebelum uang bergerak. Fokus Anda: batch payroll siap disetujui/dicairkan, eskalasi klaim, laporan pajak/biaya, dan integritas audit.",
    menus: [
      ["Ikhtisar", "Fokus payroll, eskalasi klaim, laporan gagal, PPh 21, dan tren biaya."],
      ["Konsol Payroll", "Melihat batch, rincian item, approval, dan pencairan."],
      ["Antrean Persetujuan", "Menyetujui klaim eskalasi level 2."],
      ["Laporan dan Ekspor", "PPh 21, BPJS, bank file, varians, dan invoice biaya payroll."],
      ["Slip Gaji", "Melihat slip yang sudah dipublikasikan."],
      ["MIS Intelligence", "KPI lintas cabang dan tren."],
      ["Jejak Audit", "Memverifikasi rantai audit tenant."],
    ],
    workflowTitle: "Alur payroll dan pencairan",
    workflow: [
      [
        "Periksa batch",
        "Buka Konsol Payroll. Batch READY_FOR_APPROVAL berarti HR sudah menghitung dan menunggu Finance.",
      ],
      [
        "Review item",
        "Buka detail batch: headcount, gross, PPh 21, BPJS, net, dan varians dibanding periode sebelumnya.",
      ],
      [
        "Setujui batch",
        "Setujui hanya jika total dan komponen sudah sesuai. Maker tidak boleh menjadi approver (SoD).",
      ],
      [
        "Cairkan",
        "Setelah APPROVED, jalankan pencairan. Status berubah menjadi DISBURSING lalu DISBURSED/PARTIAL/FAILED.",
      ],
      [
        "Tangani kegagalan",
        "Untuk PARTIAL/FAILED, cek item yang gagal dan gunakan retry. Jangan membuat batch baru untuk item yang sama.",
      ],
      [
        "Selesaikan klaim eskalasi",
        "Buka Antrean Persetujuan, review klaim ESCALATED, dan putuskan dengan alasan.",
      ],
      [
        "Tutup laporan",
        "Pastikan PPh 21/BPJS/bank file dan invoice biaya payroll siap diunduh untuk periode berjalan.",
      ],
      [
        "Verifikasi audit",
        "Buka Jejak Audit dan pastikan rantai hash valid sebelum demo atau penutupan periode.",
      ],
    ],
    checklist: [
      "Cek batch READY_FOR_APPROVAL dan APPROVED setiap hari.",
      "Bandingkan gross/net dengan periode sebelumnya; selidiki lonjakan > 10%.",
      "Pastikan PPh 21 dan BPJS masuk ke laporan periode yang sama.",
      "Cek laporan FAILED dan buat ulang setelah penyebabnya jelas.",
      "Review klaim ESCALATED; jangan menunda keputusan finansial.",
      "Pastikan audit chain valid dan tidak ada gap.",
    ],
    tips: [
      "Gunakan invoice biaya payroll untuk melihat total biaya tenant per cabang.",
      "Batch correction memiliki nomor sendiri; jangan menimpa batch lama.",
      "Simpan bukti keputusan di catatan, bukan di chat pribadi.",
    ],
    warnings: [
      "Jangan menyetujui batch yang Anda buat sendiri.",
      "Jangan mencairkan batch sebelum status APPROVED.",
      "Jangan mengubah nominal item setelah dibayar; gunakan koreksi resmi.",
    ],
  },
  {
    file: "panduan-spesialis-sdm.pdf",
    role: "Spesialis SDM",
    code: "HR_SPECIALIST",
    email: "hr.ops@aletheia.id",
    accent: "#6941c6",
    tagline: "Menjaga data personel dan payroll tetap akurat sebelum approval.",
    summary:
      "Anda menyiapkan payroll dan mengelola antrean SDM. Tugas Anda memastikan data personel, absensi, cuti, lembur, reimburse, dan batch payroll siap sebelum masuk ke Finance.",
    menus: [
      ["Ikhtisar", "Batch yang belum selesai, cuti/lembur, reimburse, dan tren payroll."],
      [
        "Konsol Payroll",
        "Membuat batch, menghitung, memeriksa breakdown, dan mengirim ke Finance.",
      ],
      ["Karyawan dan Agen", "Direktori personel, absensi, dan riwayat cuti."],
      ["Slip Gaji", "Menerbitkan dan mengunduh slip gaji."],
      ["Laporan dan Ekspor", "PPh 21, BPJS, bank file, dan varians."],
      ["Cuti dan Lembur", "Antrean keputusan cuti, lembur, dan reimburse."],
      ["Struktur Organisasi", "Departemen, posisi, dan personel."],
    ],
    workflowTitle: "Alur payroll dari data ke slip",
    workflow: [
      [
        "Cek data personel",
        "Pastikan gaji pokok, tunjangan, PTKP, rekening, dan status kerja benar di Karyawan dan Agen.",
      ],
      [
        "Buat batch",
        "Pilih cabang dan periode. Buat batch REGULAR; gunakan CORRECTION hanya untuk perbaikan periode yang sudah berjalan.",
      ],
      [
        "Hitung batch",
        "Jalankan kalkulasi. Status berubah menjadi CALCULATING lalu READY_FOR_APPROVAL.",
      ],
      [
        "Periksa breakdown",
        "Buka item per personel: gross, PPh 21, BPJS karyawan/pemberi kerja, dan net.",
      ],
      [
        "Kirim ke Finance",
        "Setelah yakin, serahkan batch ke Finance. Anda tidak boleh menyetujui batch yang Anda buat.",
      ],
      [
        "Terbitkan slip",
        "Setelah batch disetujui/dicairkan, buat slip gaji dan pastikan checksum serta tautan unduhan benar.",
      ],
      [
        "Tutup laporan",
        "Buat PPh 21 bulanan/tahunan, BPJS, bank file, dan varians untuk periode tersebut.",
      ],
      [
        "Selesaikan antrean SDM",
        "Putuskan cuti/lembur/reimburse dengan memeriksa saldo, tanggal, dan bukti.",
      ],
    ],
    checklist: [
      "Cek personel baru/berhenti sebelum membuat batch.",
      "Pastikan absensi periode sudah final sebelum kalkulasi.",
      "Cek saldo cuti dan potongan unpaid leave.",
      "Bandingkan headcount batch dengan direktori aktif.",
      "Pastikan slip dan laporan memiliki checksum.",
      "Tidak ada batch DRAFT/CALCULATING yang tertinggal di akhir bulan.",
    ],
    tips: [
      "Gunakan pencarian personel untuk membuka drawer absensi dan cuti.",
      "Batch correction memakai sequence terpisah; jangan mengedit batch yang sudah dibayar.",
      "Jika kalkulasi gagal, cek data absensi dan policy payroll aktif.",
    ],
    warnings: [
      "Jangan mengubah data rekening setelah batch disetujui.",
      "Jangan menyetujui pengajuan Anda sendiri.",
      "Jangan mengunggah dokumen dengan PII nyata ke demo.",
    ],
  },
  {
    file: "panduan-administrator-kepatuhan.pdf",
    role: "Administrator Kepatuhan",
    code: "COMPLIANCE_ADMIN",
    email: "compliance@aletheia.id",
    accent: "#b42318",
    tagline: "Menahan risiko sebelum keputusan dan menjaga integritas audit.",
    summary:
      "Anda menangani klaim berisiko, konflik data, dan integritas jejak audit. Fokus Anda bukan mempercepat semua klaim, tetapi memastikan keputusan tidak melanggar kebijakan.",
    menus: [
      ["Ikhtisar", "Review kepatuhan, flag konflik, status audit, dan risiko tinggi."],
      ["Ruang Klaim", "Menelusuri klaim dan riwayat review kepatuhan."],
      ["Jejak Audit", "Memverifikasi rantai hash dan membaca aktivitas tenant."],
      ["MIS Intelligence", "KPI dan tren lintas cabang."],
      ["Konsol Payroll", "Melihat batch dan kepatuhan payroll."],
      ["Laporan dan Ekspor", "Laporan pajak/BPJS dan invoice biaya."],
    ],
    workflowTitle: "Alur review kepatuhan",
    workflow: [
      ["Buka Ikhtisar", "Mulai dari “Review kepatuhan”, “Flag konflik”, dan status audit."],
      [
        "Periksa klaim",
        "Cocokkan NIK, rekening, personel, dan riwayat klaim. Flag konflik berarti ada kesamaan data yang perlu dijelaskan.",
      ],
      [
        "Putuskan review",
        "Setujui untuk diteruskan, kembalikan untuk perbaikan, atau eskalasikan dengan catatan yang jelas.",
      ],
      [
        "Verifikasi audit",
        "Buka Jejak Audit dan jalankan verifikasi rantai. Status “Valid” berarti hash chain utuh.",
      ],
      [
        "Cek policy",
        "Pastikan klaim/payroll memakai policy version yang berlaku pada saat transaksi.",
      ],
      ["Pantau laporan", "Pastikan laporan pajak/BPJS dan invoice tidak gagal atau tertinggal."],
      [
        "Catat temuan",
        "Simpan ringkasan temuan dan tindakan di catatan review agar dapat diaudit.",
      ],
    ],
    checklist: [
      "Review klaim COMPLIANCE_REVIEW setiap hari.",
      "Selidiki semua flag konflik rekening/NIK.",
      "Verifikasi audit chain setelah aktivitas besar.",
      "Cek klaim risiko tinggi (risk score ≥ 70).",
      "Pastikan tidak ada klaim yang dipecah untuk menghindari batas.",
      "Cek laporan yang FAILED dan batch payroll yang tertahan.",
    ],
    tips: [
      "Gunakan MIS untuk melihat pola cabang, bukan hanya satu klaim.",
      "Jangan mengubah data klaim; gunakan keputusan dan catatan.",
      "Simpan bukti dalam bentuk nomor klaim/batch, bukan screenshot berisi PII.",
    ],
    warnings: [
      "Jangan melemahkan RLS, SoD, atau audit demi demo.",
      "Jangan membuka data tenant lain.",
      "Jangan mengubah status audit secara manual.",
    ],
  },
  {
    file: "panduan-analis-mis.pdf",
    role: "Analis MIS",
    code: "MIS_ANALYST",
    email: "mis.analyst@aletheia.id",
    accent: "#175cd3",
    tagline: "Membaca tren lintas cabang dan menguji skenario kebijakan.",
    summary:
      "Anda mengubah data operasional menjadi sinyal keputusan. Fokus Anda: KPI cabang, tren payroll/klaim, varians, dan simulasi What-If yang tidak mengubah data produksi.",
    menus: [
      [
        "Ikhtisar",
        "Approval rate, payroll, PPh 21, cabang dengan varians negatif, dan detail cabang.",
      ],
      ["MIS Intelligence", "Executive summary, tren, KPI per cabang, dan detail."],
      ["What-If Sandbox", "Simulasi perubahan kebijakan read-only."],
      ["Konsol Payroll", "Konteks batch dan nilai payroll."],
      ["Ruang Klaim", "Konteks volume dan status klaim."],
    ],
    workflowTitle: "Alur analisis bulanan",
    workflow: [
      ["Buka Ikhtisar", "Lihat fokus “Approval rate” dan sinyal varians negatif."],
      ["Pilih periode", "Buka MIS Intelligence dan pilih bulan acuan serta jumlah bulan tren."],
      [
        "Baca executive summary",
        "Bandingkan payroll, PPh 21, klaim, approval rate, dan budget utilization per cabang.",
      ],
      ["Telusuri tren", "Cari perubahan tajam. Bedakan volume, nilai, dan kualitas keputusan."],
      [
        "Jalankan What-If",
        "Pilih policy aktif, ubah parameter simulasi, dan jalankan. Hasil read-only; tidak mengubah payroll.",
      ],
      ["Bandingkan variance", "Bandingkan biaya aktual vs simulasi dan jelaskan driver utamanya."],
      [
        "Tulis insight",
        "Sertakan angka, periode, cabang, dan rekomendasi tindakan. Jangan hanya menampilkan chart.",
      ],
    ],
    checklist: [
      "Pastikan periode yang dipilih sesuai pertanyaan.",
      "Cek cabang dengan varians MoM negatif.",
      "Bandingkan approval rate dengan volume klaim.",
      "Cek PPh 21 dan BPJS terhadap payroll.",
      "Jalankan What-If dengan policy aktif yang benar.",
      "Catat asumsi simulasi dan batasannya.",
    ],
    tips: [
      "Gunakan 6–15 bulan data agar tren tidak noise.",
      "Jangan menyimpulkan kausalitas dari satu bulan.",
      "Simulasi What-If tidak boleh dijadikan dasar pembayaran langsung.",
    ],
    warnings: [
      "Jangan mengubah data produksi dari halaman MIS.",
      "Jangan mengekspor PII; gunakan agregat.",
      "Jangan membandingkan cabang tanpa konteks ukuran dan komposisi.",
    ],
  },
  {
    file: "panduan-karyawan.pdf",
    role: "Karyawan",
    code: "EMPLOYEE",
    email: "employee.siti@aletheia.id",
    accent: "#0e9384",
    tagline: "Ruang Saya: slip, absensi, cuti, lembur, dan reimburse.",
    summary:
      "Ruang Saya adalah rumah Anda. Di sini Anda melihat data pribadi dan mengajukan cuti, lembur, atau reimburse tanpa perlu menghubungi HR untuk hal rutin.",
    menus: [["Ruang Saya", "Slip gaji, absensi, saldo cuti, e-cuti, e-lembur, dan reimburse."]],
    workflowTitle: "Alur self-service",
    workflow: [
      ["Buka Ruang Saya", "Setelah login, Anda langsung diarahkan ke Ruang Saya."],
      [
        "Lihat slip",
        "Pilih periode untuk melihat dan mengunduh slip gaji. Slip hanya untuk akun Anda.",
      ],
      ["Cek absensi", "Lihat ringkasan hadir, cuti, dan lembur per bulan."],
      ["Cek saldo cuti", "Lihat entitlement, terpakai, dan sisa cuti sebelum mengajukan."],
      [
        "Ajukan cuti",
        "Pilih tanggal, jenis cuti, dan alasan. Pastikan saldo cukup dan tidak bentrok dengan kebutuhan tim.",
      ],
      ["Ajukan lembur", "Isi tanggal, jam, dan alasan. Lembur harus disetujui atasan/HR."],
      ["Ajukan reimburse", "Isi tanggal, kategori, nominal, deskripsi, dan unggah bukti."],
    ],
    checklist: [
      "Cek slip gaji setiap periode terbit.",
      "Cek absensi jika ada hari yang tidak sesuai.",
      "Pastikan saldo cuti cukup sebelum mengajukan.",
      "Ajukan cuti lebih awal agar tidak bentrok.",
      "Simpan bukti reimburse yang jelas.",
      "Pantau status pengajuan: PENDING, APPROVED, REJECTED.",
    ],
    tips: [
      "Slip dan data pribadi hanya terlihat oleh Anda.",
      "Jika pengajuan ditolak, baca catatan keputusan sebelum mengajukan ulang.",
      "Gunakan tanggal yang benar; data cuti memengaruhi payroll.",
    ],
    warnings: [
      "Jangan membagikan password atau sesi Anda.",
      "Jangan mengunggah dokumen dengan data nyata ke demo.",
      "Jangan mengajukan cuti untuk orang lain.",
    ],
  },
];

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function statusRows(rows) {
  return rows
    .map(
      ([name, description]) =>
        `<tr><td><code>${escapeHtml(name)}</code></td><td>${escapeHtml(description)}</td></tr>`,
    )
    .join("");
}

function renderGuide(guide) {
  const menuRows = guide.menus
    .map(
      ([name, description]) =>
        `<tr><td><strong>${escapeHtml(name)}</strong></td><td>${escapeHtml(description)}</td></tr>`,
    )
    .join("");
  const workflow = guide.workflow
    .map(
      ([title, description], index) =>
        `<li><span class="step">${index + 1}</span><div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(description)}</p></div></li>`,
    )
    .join("");
  const checklist = guide.checklist.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const tips = guide.tips.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const warnings = guide.warnings.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const glossary =
    guide.code === "CLAIMS_OFFICER" ||
    guide.code === "BRANCH_MANAGER" ||
    guide.code === "COMPLIANCE_ADMIN"
      ? statusRows(STATUS.claims)
      : guide.code === "EMPLOYEE"
        ? statusRows([
            ["PENDING", "Pengajuan menunggu keputusan."],
            ["APPROVED", "Pengajuan disetujui."],
            ["REJECTED", "Pengajuan ditolak; baca catatan."],
            ["PAID", "Reimburse sudah dibayar."],
          ])
        : statusRows(STATUS.payroll);

  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<style>
  @page { size: A4; margin: 18mm 16mm 20mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Segoe UI", Arial, sans-serif; color: #1b2433; font-size: 10.2pt; line-height: 1.5; }
  h1, h2, h3, p { margin: 0; }
  h1 { font-size: 30pt; line-height: 1.05; letter-spacing: -0.04em; }
  h2 { font-size: 17pt; line-height: 1.2; letter-spacing: -0.02em; margin-bottom: 4mm; }
  h3 { font-size: 11.5pt; margin: 0 0 2mm; }
  p { margin: 0 0 3mm; }
  .cover { min-height: 250mm; display: flex; flex-direction: column; page-break-after: always; }
  .cover-top { display: flex; align-items: center; gap: 12px; }
  .cover-top svg { width: 46px; height: 46px; }
  .brand { font-weight: 700; font-size: 15pt; letter-spacing: -0.02em; }
  .brand small { display: block; font-size: 7.5pt; letter-spacing: 0.16em; color: #5b657a; font-weight: 600; }
  .cover-main { margin-top: 44mm; }
  .eyebrow { color: ${guide.accent}; font-size: 8.5pt; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; }
  .role { margin-top: 5mm; color: ${guide.accent}; font-weight: 700; }
  .tagline { margin-top: 7mm; max-width: 135mm; color: #344054; font-size: 13pt; line-height: 1.45; }
  .cover-meta { margin-top: auto; display: flex; gap: 8mm; flex-wrap: wrap; padding-top: 12mm; border-top: 1px solid #e3e8f0; color: #5b657a; font-size: 9pt; }
  .cover-meta strong { display: block; color: #1b2433; font-size: 10pt; }
  .page { page-break-after: always; }
  .page:last-child { page-break-after: auto; }
  .lead { color: #475467; font-size: 10.8pt; line-height: 1.6; }
  .callout { margin-top: 6mm; padding: 5mm 6mm; border: 1px solid #e3e8f0; border-left: 4px solid ${guide.accent}; border-radius: 3mm; background: #f8fafc; }
  .callout strong { display: block; margin-bottom: 1.5mm; }
  .callout code { background: #eef2ff; padding: 0.6mm 1.6mm; border-radius: 1mm; }
  table { width: 100%; border-collapse: collapse; margin-top: 3mm; }
  th, td { text-align: left; vertical-align: top; padding: 2.4mm 2.6mm; border-bottom: 1px solid #e3e8f0; }
  th { color: #5b657a; font-size: 8.2pt; letter-spacing: 0.08em; text-transform: uppercase; }
  td { font-size: 9.6pt; }
  code { font-family: "Cascadia Mono", Consolas, monospace; font-size: 9pt; color: #1d2939; }
  ol.workflow { list-style: none; padding: 0; margin: 0; }
  ol.workflow li { display: flex; gap: 4mm; padding: 3.2mm 0; border-bottom: 1px solid #eef1f6; break-inside: avoid; }
  ol.workflow li:last-child { border-bottom: 0; }
  .step { flex: none; width: 8mm; height: 8mm; border-radius: 50%; background: ${guide.accent}; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 9pt; }
  ol.workflow p { margin: 1mm 0 0; color: #475467; font-size: 9.4pt; }
  ul.checks { list-style: none; padding: 0; margin: 0; }
  ul.checks li { padding: 2mm 0 2mm 6mm; position: relative; border-bottom: 1px solid #eef1f6; }
  ul.checks li::before { content: "✓"; position: absolute; left: 0; color: ${guide.accent}; font-weight: 700; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 7mm; }
  .card { padding: 5mm; border: 1px solid #e3e8f0; border-radius: 3mm; background: #fff; break-inside: avoid; }
  .card.warn { background: #fffbf5; border-color: #f5d0a9; }
  .small { color: #5b657a; font-size: 8.8pt; }
  .divider { height: 1px; background: #e3e8f0; margin: 7mm 0; }
  .footer-note { margin-top: 7mm; color: #667085; font-size: 8.2pt; }
</style>
</head>
<body>
  <section class="cover">
    <div class="cover-top">
      <span>${LOGO}</span>
      <div class="brand">Aletheia<small>PEOPLE OPERATIONS</small></div>
    </div>
    <div class="cover-main">
      <div class="eyebrow">Panduan penggunaan aplikasi</div>
      <h1 style="margin-top:4mm">${escapeHtml(guide.role)}</h1>
      <div class="role">${escapeHtml(guide.code)}</div>
      <p class="tagline">${escapeHtml(guide.tagline)}</p>
    </div>
    <div class="cover-meta">
      <div><strong>Tenant</strong>${TENANT}</div>
      <div><strong>Lingkungan</strong>Demo / data sintetis</div>
      <div><strong>Versi</strong>27 November 2026</div>
      <div><strong>Akses</strong>${LOGIN_URL.replace("https://", "")}</div>
    </div>
  </section>

  <section class="page">
    <h2>Tentang peran ini</h2>
    <p class="lead">${escapeHtml(guide.summary)}</p>
    <div class="callout">
      <strong>Login demo</strong>
      <p style="margin:0">Buka <code>${LOGIN_URL}</code>. Pilih kartu peran <strong>${escapeHtml(guide.role)}</strong>, lalu masuk dengan akun <code>${escapeHtml(guide.email)}</code>. Kata sandi demo: <code>${PASSWORD}</code>.</p>
    </div>
    <h3 style="margin-top:9mm">Menu yang Anda gunakan</h3>
    <table>
      <thead><tr><th>Menu</th><th>Kegunaan</th></tr></thead>
      <tbody>${menuRows}</tbody>
    </table>
    <p class="footer-note">Semua data di lingkungan ini sintetis. Jangan memasukkan data pelanggan, PII, atau kredensial nyata.</p>
  </section>

  <section class="page">
    <h2>${escapeHtml(guide.workflowTitle)}</h2>
    <ol class="workflow">${workflow}</ol>
  </section>

  <section class="page">
    <h2>Kebiasaan kerja yang baik</h2>
    <div class="grid-2">
      <div class="card">
        <h3>Checklist harian</h3>
        <ul class="checks">${checklist}</ul>
      </div>
      <div class="card">
        <h3>Tips</h3>
        <ul class="checks">${tips}</ul>
      </div>
    </div>
    <div class="divider"></div>
    <h2>Istilah status</h2>
    <table>
      <thead><tr><th>Status</th><th>Arti</th></tr></thead>
      <tbody>${glossary}</tbody>
    </table>
  </section>

  <section class="page">
    <h2>Keamanan dan kepatuhan</h2>
    <div class="card warn">
      <h3>Yang harus dihindari</h3>
      <ul class="checks">${warnings}</ul>
    </div>
    <div class="divider"></div>
    <h3>Prinsip dasar</h3>
    <ul class="checks">
      <li><strong>Maker ≠ checker.</strong> Pembuat transaksi tidak boleh menyetujui transaksi yang sama.</li>
      <li><strong>Jangan memecah nominal</strong> untuk menghindari batas kewenangan.</li>
      <li><strong>Baca sebelum memutuskan.</strong> Periksa dokumen, nominal, rekening, dan alasan.</li>
      <li><strong>Jaga jejak.</strong> Setiap keputusan harus punya alasan yang dapat diaudit.</li>
      <li><strong>Laporkan anomali.</strong> Flag konflik, laporan gagal, atau audit tidak valid harus ditindaklanjuti.</li>
    </ul>
    <div class="callout">
      <strong>Jika akses ditolak</strong>
      <p style="margin:0">Pastikan Anda login dengan peran yang benar. Halaman dan aksi dibatasi oleh RBAC; hubungi admin tenant jika peran Anda belum sesuai.</p>
    </div>
    <div class="callout">
      <strong>Jika data kosong atau lambat</strong>
      <p style="margin:0">Render free tier dapat cold start. Tunggu beberapa detik atau muat ulang. Jika tetap kosong, cek periode yang dipilih dan pastikan data untuk periode itu memang ada.</p>
    </div>
    <p class="footer-note">Panduan ini bagian dari Aletheia Demo. Untuk pertanyaan produk, gunakan kanal tim internal. Jangan mengirim password melalui chat.</p>
  </section>
</body>
</html>`;
}

const browser = await chromium.launch();
const page = await browser.newPage();
const previewDir = process.env.PREVIEW_DIR;
if (previewDir !== undefined) {
  mkdirSync(previewDir, { recursive: true });
}
for (const guide of guides) {
  await page.setContent(renderGuide(guide), { waitUntil: "load" });
  if (previewDir !== undefined) {
    await page.emulateMedia({ media: "print" });
    await page.screenshot({ path: resolve(previewDir, `${guide.code}.png`), fullPage: true });
  }
  await page.pdf({
    path: resolve(OUTPUT, guide.file),
    format: "A4",
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: "<span></span>",
    footerTemplate:
      '<div style="width:100%;padding:0 16mm;font-family:Segoe UI,Arial,sans-serif;font-size:7.5pt;color:#98a2b3;display:flex;justify-content:space-between;"><span>Aletheia · Panduan ' +
      escapeHtml(guide.role) +
      '</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
    margin: { top: "18mm", right: "16mm", bottom: "20mm", left: "16mm" },
  });
  console.log(`created docs/guides/${guide.file}`);
}
await browser.close();
