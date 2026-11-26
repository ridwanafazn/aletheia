# Load Test — Payroll Batch

* Tanggal: 26 November 2026
* Skenario: kalkulasi 5 batch, masing-masing 505 pegawai
* Beban: 1 VU, 5 iterasi
* Target: edge gateway dan Go worker langsung
* Seed: `node scripts/seed-load-test.mjs` menambahkan 500 pegawai sintetis dan absensi 2027-01 sampai 2027-05
* Perintah: `pnpm load:seed` lalu `pnpm load:payroll-batch`

## Hasil

| Metrik | Nilai | Threshold | Status |
| --- | --- | --- | --- |
| p95 batch duration | 268,2 ms | < 60.000 ms | Lulus |
| Headcount per batch | 505 | >= 500 | Lulus |
| Batch siap approval | 5 / 5 | 5 / 5 | Lulus |
| HTTP failure | 0,00% dari 21 request | < 1% | Lulus |

Run final setelah dependency Go dinaikkan menghasilkan p95 268,2 ms. Run sebelumnya menghasilkan 120,2 ms. Kalkulasi 505 item berjalan di Go worker dengan concurrency 8. Tidak ada item gagal dan tidak ada duplikasi item.
