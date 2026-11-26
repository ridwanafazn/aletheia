# Load Test — Claims Read

* Tanggal: 26 November 2026
* Skenario: daftar klaim dan detail klaim
* Beban: 50 VU selama 5 menit
* Target: edge gateway
* Perintah: `pnpm load:claims-read`

## Hasil

| Metrik | Nilai | Threshold | Status |
| --- | --- | --- | --- |
| HTTP failure | 0,00% dari 64.169 request | < 1% | Lulus |
| p95 list klaim | 224,48 ms | < 300 ms | Lulus |
| p95 detail klaim | 230,58 ms | < 300 ms | Lulus |
| Iterations | 32.084 | — | — |

Detail klaim menyertakan audit history dan tidak menghasilkan error. Uji ulang 20 VU selama 30 detik menghasilkan p95 106,35 ms.
