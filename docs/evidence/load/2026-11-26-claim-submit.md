# Load Test — Claim Submit

* Tanggal: 26 November 2026
* Skenario: buat klaim lalu submit, termasuk evaluasi risiko sinkron
* Beban: 20 VU selama 5 menit
* Target: edge gateway
* Perintah: `pnpm load:claim-submit`

## Hasil

| Metrik | Nilai | Threshold | Status |
| --- | --- | --- | --- |
| HTTP failure | 0,00% dari 16.677 request | < 1% | Lulus |
| p95 mutasi create + submit | 658 ms | < 800 ms | Lulus |
| Checks | 25.016 / 25.016 | > 99% | Lulus |
| Iterations | 8.338 klaim | — | — |

Semua klaim berakhir `UNDER_REVIEW` atau `ESCALATED`. Tidak ada klaim gagal submit.
