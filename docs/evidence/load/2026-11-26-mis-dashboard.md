# Load Test — MIS Dashboard

* Tanggal: 26 November 2026
* Skenario: GraphQL KPI executive summary dan trend
* Beban: 30 VU selama 5 menit
* Target: edge gateway GraphQL BFF
* Perintah: `pnpm load:mis-dashboard`

## Hasil

| Metrik | Nilai | Threshold | Status |
| --- | --- | --- | --- |
| HTTP failure | 0,00% dari 26.405 request | < 1% | Lulus |
| p95 GraphQL | 110,04 ms | < 500 ms | Lulus |
| Checks | 79.214 / 79.214 | > 99% | Lulus |
| Iterations | 26.404 | — | — |

KPI cache dan trend GraphQL merespons tanpa error. Uji ulang 10 VU selama 30 detik menghasilkan p95 47,24 ms.
