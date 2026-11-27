# Stage 3A — Leave Approval → Attendance Summary

- **Tanggal:** 27 November 2026.
- **Commit:** `3d0aa67` (`feat(payroll): sync approved leave to attendance`).
- **Status:** selesai di `main`, CI, dan production melalui deploy UI Phase 5 `04962c3`. Development UI selesai 27 November 2026; lihat `docs/FINAL-STATUS.md`.
- **Lingkungan:** lokal, PostgreSQL test container `55432`, role aplikasi `aletheia_app`.
- **Data:** sintetis.

## 1. Tujuan

Menutup gap P1: persetujuan cuti harus otomatis memperbarui `payroll.attendance_summaries` agar komponen `paid_leave_days`/`unpaid_leave_days` yang dipakai payroll tidak diisi manual dua kali.

## 2. Perilaku

| Kejadian | Hasil |
| --- | --- |
| Cuti `APPROVED` jenis `ANNUAL`, `SICK`, `MATERNITY`, `OTHER` | `paid_leave_days` periode bertambah |
| Cuti `APPROVED` jenis `UNPAID` | `unpaid_leave_days` periode bertambah |
| Cuti `REJECTED` | Tidak ada perubahan attendance |
| Cuti lintas bulan | Dibagi per bulan berdasarkan hari kerja Senin–Jumat, dengan largest-remainder rounding |
| Hari pecahan (mis. 0.5) | Dibulatkan ke bawah; attendance tetap bilangan bulat |
| Ringkasan periode belum ada | `409 ERR_ATTENDANCE_MISSING`, seluruh approval rollback |
| `present + paid + unpaid + absent` akan melebihi `working_days` | `422 ERR_ATTENDANCE_CAPACITY`, seluruh approval rollback |
| Approval kedua untuk cuti yang sama | `409 ERR_CONCURRENT_LOCK`, tidak menambah attendance lagi |

Audit `LEAVE_DECIDED` sekarang menyimpan `leave_type`, rentang tanggal, jumlah hari, dan `attendance_sync` berisi periode serta nilai `paid_leave_days`/`unpaid_leave_days` setelah perubahan.

## 3. Perubahan kontrak

- Error code baru: `ERR_ATTENDANCE_CAPACITY` (HTTP 422).
- `packages/shared-contracts/openapi.json` diregenerasi.
- Tidak ada endpoint baru; perilaku baru berada pada `POST /api/v1/leave-requests/:id/decide`.

## 4. Test

Unit:

```bash
pnpm exec vitest run services/payroll-service/src/lib/workforce.test.ts
```

Hasil: **9/9 lulus**, termasuk single-month, cross-month, weekend-only, fractional floor, dan proportional remainder.

Integrasi 3A:

```bash
RUN_PAYROLL_INTEGRATION=true \
DATABASE_URL="postgresql://aletheia:aletheia@localhost:55432/aletheia" \
DATABASE_URL_APP="postgresql://aletheia_app:aletheia_app@localhost:55432/aletheia" \
pnpm exec vitest run services/payroll-service/src/app.test.ts --testNamePattern=3A
```

Hasil: **5/5 lulus**:

1. Cuti tahunan menambah `paid_leave_days`.
2. Cuti tidak berbayar menambah `unpaid_leave_days`.
3. Cuti lintas bulan memperbarui dua ringkasan (Desember 2 hari, Januari 1 hari).
4. Ringkasan hilang menghasilkan `ERR_ATTENDANCE_MISSING` dan cuti tetap `PENDING`.
5. Kapasitas penuh menghasilkan `ERR_ATTENDANCE_CAPACITY` dan attendance tidak berubah.

Gate lain:

| Gate | Hasil |
| --- | --- |
| `pnpm -r typecheck` | Lulus |
| `pnpm -r lint` | Lulus |
| `pnpm test` | Lulus; payroll unit 27 lulus, 27 integration skipped |
| `pnpm format:check` | Lulus |

Catatan: suite integrasi payroll penuh masih memiliki 5 kegagalan lama pada alur batch/payslip/payment yang tidak terkait 3A. Kegagalan tersebut sudah ada sebelum perubahan ini dan tidak diubah oleh Stage 3A; perlu task terpisah.

## 5. Batasan

- Belum ada kalender hari libur; pembagian memakai hari kerja Senin–Jumat.
- Cuti setengah hari tidak menambah attendance karena kolom attendance bertipe `SMALLINT`; HR tetap dapat menyesuaikan manual.
- Integrasi bersifat aditif. HR sebaiknya tidak mengisi hari cuti yang sama pada attendance sebelum approval, karena akan dihitung dua kali dan dapat terkena guard kapasitas.
- Belum ada endpoint pembatalan cuti; jika ditambahkan nanti, pembatalan harus mengurangi attendance dengan guard yang sama.

## 6. File utama

- `services/payroll-service/src/lib/workforce.ts` — alokasi bulan dan sinkronisasi attendance.
- `services/payroll-service/src/routes/workforce.ts` — pemanggilan saat approval dan audit.
- `packages/shared-contracts/src/errors.ts` — `ERR_ATTENDANCE_CAPACITY`.
- `services/payroll-service/src/lib/workforce.test.ts` — unit test alokasi.
- `services/payroll-service/src/app.test.ts` — lima test integrasi 3A.
