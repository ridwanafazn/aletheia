# Load Test — Approval Race

* Tanggal: 26 November 2026
* Skenario: 5 approval paralel pada klaim yang sama, 20 klaim
* Beban: 20 iterasi, 5 request paralel per iterasi
* Target: edge gateway
* Perintah: `pnpm load:approval-race`

## Hasil

| Metrik | Nilai | Threshold | Status |
| --- | --- | --- | --- |
| Approval menang | 20 | tepat 1 per klaim | Lulus |
| Approval kalah 409 | 80 | tepat 4 per klaim | Lulus |
| Respons tak terduga | 0 | 0 | Lulus |
| p95 race duration | 59,65 ms | < 1.000 ms | Lulus |
| HTTP failure | 0,00% dari 142 request | < 1% | Lulus |

Race approval menghasilkan tepat satu pemenang dan empat konflik pada setiap klaim.
