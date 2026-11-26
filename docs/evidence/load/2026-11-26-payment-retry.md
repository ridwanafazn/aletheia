# Load Test — Payment Retry

* Tanggal: 26 November 2026
* Skenario: 100 webhook `PAID` duplikat untuk satu payment
* Beban: 1 iterasi, 100 request paralel
* Target: edge gateway webhook publik
* Perintah: `pnpm load:payment-retry`

## Hasil

| Metrik | Nilai | Threshold | Status |
| --- | --- | --- | --- |
| Webhook diterima | 100 / 100 | 100 / 100 | Lulus |
| Klaim berstatus DISBURSED | Ya | Ya | Lulus |
| Total waktu 100 webhook | 732 ms | — | — |
| HTTP failure | 0,00% dari 108 request | < 1% | Lulus |

## Verifikasi database

```sql
select d.claim_id, count(*) as disbursements
  from claims.disbursements d
 group by d.claim_id
 order by max(d.requested_at) desc limit 1;
```

Hasil: `1` disbursement untuk klaim terakhir.

```sql
select entity_id, count(*) as disbursed_audit_rows
  from governance.audit_logs
 where action = 'CLAIM_DISBURSED'
 group by entity_id
 order by max(recorded_at) desc limit 1;
```

Hasil: `1` baris audit. Seratus webhook duplikat tidak membuat payment atau audit ganda.
