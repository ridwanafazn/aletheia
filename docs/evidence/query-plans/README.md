# Query Plans M5.2

* Tanggal: 26 November 2026
* Database: PostgreSQL 16, data seed dan 8.399 klaim load test, 25.984 audit log saat pengukuran awal
* Perintah: `EXPLAIN (ANALYZE, BUFFERS)`

## Sebelum dan sesudah

| Query | Sebelum | Sesudah | Perubahan |
| --- | --- | --- | --- |
| Daftar klaim per cabang | Seq Scan + top-N sort, 5,853 ms, 500 buffer | Index Only Scan `idx_claims_branch_date`, 1,183 ms, 28 buffer | 5x lebih cepat |
| Daftar klaim per tenant | Seq Scan + sort | Index Scan `idx_claims_tenant_date`, 0,290 ms | Top-N tanpa sort |
| Daftar audit per tenant | Index Scan Backward `idx_audit_tenant_recorded`, 0,302 ms | 0,357 ms | Sudah optimal |
| Detail batch payroll | Index `idx_payroll_items_batch_cover` | — | Sudah optimal |

Migrasi `0007_claims_list_indexes.sql` menambahkan:

* `idx_claims_branch_date` pada `(tenant_id, branch_id, created_at DESC, id DESC)` dengan `INCLUDE (status, requested_amount)`.
* `idx_claims_tenant_date` pada `(tenant_id, created_at DESC, id DESC)`.

## File

* `before-claims-list.txt` dan `after-claims-list.txt`
* `after-claims-tenant-list.txt`
* `before-audit-list.txt` dan `after-audit-list.txt`

Semua query di bawah budget DB p95 50 ms.
