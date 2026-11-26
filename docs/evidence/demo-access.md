# Demo Access — Aletheia Lokal

* **Tanggal:** 26 November 2026
* **Lingkungan:** lokal, data sintetis
* **Status server:** dihentikan setelah M5.3. Nyalakan dengan `bash scripts/dev-up.sh` dan baca `HANDOVER.md`.
* **Kata sandi semua akun demo:** `AletheiaDemo!2026`
* **MFA:** nonaktif

## Akun

| Email | Role | Tenant | Cabang | Cocok untuk |
| --- | --- | --- | --- | --- |
| `officer.bdg@aletheia.id` | CLAIMS_OFFICER | SAU | BDG-01 | Buat, ubah, submit klaim |
| `officer.sby@aletheia.id` | CLAIMS_OFFICER | SAU | SBY-01 | Klaim cabang Surabaya |
| `manager.bdg@aletheia.id` | BRANCH_MANAGER | SAU | BDG-01 | Approval level 1 dan antrean persetujuan |
| `finance.vp@aletheia.id` | FINANCE_MANAGER | SAU | JKT-HQ | Approval level 2, pencairan, approve dan disburse payroll, retry payment |
| `hr.ops@aletheia.id` | HR_SPECIALIST | SAU | JKT-HQ | Employee directory, batch payroll, kalkulasi |
| `compliance@aletheia.id` | COMPLIANCE_ADMIN | SAU | JKT-HQ | Review kepatuhan, policy, audit chain |
| `mis.analyst@aletheia.id` | MIS_ANALYST | SAU | JKT-HQ | Dashboard MIS dan What-If |
| `compliance@bpui.id` | COMPLIANCE_ADMIN | BPUI | JKT-HQ | Uji isolasi tenant |

## URL

| Komponen | URL |
| --- | --- |
| Web | `http://localhost:5173` |
| Edge Gateway | `http://127.0.0.1:8787` |
| Governance Service | `http://127.0.0.1:4101` |
| Claims Service | `http://127.0.0.1:4102` |
| Payroll Service | `http://127.0.0.1:4103` |
| Go Worker | `http://127.0.0.1:4004` |
| Grafana | `http://localhost:3000` |
| Jaeger | `http://localhost:16686` |
| Prometheus | `http://localhost:9090` |
| PostgreSQL | `localhost:55432` |

Gunakan `localhost:5173`, bukan `127.0.0.1:5173`, karena Vite lokal hanya listen di IPv6 localhost.

## Menjalankan ulang

```bash
docker start aletheia-postgres-test
pnpm --filter @aletheia/shared-contracts build
pnpm --filter @aletheia/database build
pnpm --filter @aletheia/payments build
pnpm --filter @aletheia/observability build
pnpm --filter @aletheia/governance-service build
pnpm --filter @aletheia/claims-service build
pnpm --filter @aletheia/payroll-service build
```

Jalankan service dengan `DATABASE_URL=postgresql://aletheia:aletheia@localhost:55432/aletheia`, `PORT=4101` sampai `4103`, dan `OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318`.

```bash
pnpm --filter @aletheia/edge-gateway dev
pnpm --filter @aletheia/web dev
docker compose --profile observability up -d otel-collector jaeger prometheus grafana
```

## Catatan

* Semua data adalah sintetis. Tidak ada uang nyata atau PII nyata.
* Service demo memakai role pemilik database. RLS diverifikasi dengan role `aletheia_app`; pengikatan tenant per transaksi adalah prasyarat TASK-18.
* Edge preview live perlu deploy ulang di TASK-18. Web preview statis aktif di `https://aletheia-web-preview.pages.dev`.
