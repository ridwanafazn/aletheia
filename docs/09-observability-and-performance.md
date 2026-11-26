# `09-observability-and-performance.md` — Telemetri, SLO, Load Test & Kapasitas Aletheia

* **Status Dokumen:** Spesifikasi Observabilitas & Performa (*Single Source of Truth* untuk Agen OpenCode)
* **Prinsip:** Ukur sebelum optimasi, telemetri tanpa PII, alert yang actionable, bukti performa yang dapat direproduksi.
* **Stack:** OpenTelemetry (OTLP), Grafana Cloud / Axiom, Prometheus-compatible metrics, k6, Vite bundle analyzer.

## 1. Tujuan

1. Menemukan masalah sebelum pengguna melaporkannya.
2. Membuktikan klaim performa dengan angka, bukan opini.
3. Menjaga biaya free-tier tetap terkendali.
4. Menyediakan bukti untuk lowongan yang mensyaratkan *monitoring, performance, scalability*.

## 2. SLI & SLO

| Layanan | SLI | SLO target | Budget error |
| --- | --- | --- | --- |
| Web (Cloudflare Pages) | availability, LCP, INP | 99.9%; LCP < 2.5s; INP < 200ms | 0.1% |
| Edge Gateway | request success, p95 latency | 99.5%; p95 < 150ms (read), < 300ms (proxy) | 0.5% |
| Governance API | success, p95 | 99.5%; p95 < 300ms | 0.5% |
| Claims API | success, p95 mutation | 99.5%; p95 < 500ms | 0.5% |
| Payroll API | success, p95 read | 99.5%; p95 < 400ms | 0.5% |
| Payroll batch | 500 item selesai | < 60 detik p95 | 5% |
| Payment adapter | success rate, time to terminal | 99%; < 5 menit p95 (sandbox/mock) | 1% |
| Audit chain | verifikasi harian | 100% valid | 0 |
| Queue | lag, DLQ count | lag < 60s; DLQ = 0 | 0 |

**Aturan:** SLO adalah target internal, bukan janji kontraktual. Alert berbasis burn rate, bukan single spike.

## 3. Arsitektur Telemetri

```text
Browser (RUM/Sentry opsional)
   │  traceparent + X-Correlation-Id
   ▼
Cloudflare Worker (edge span)
   │  traceparent + X-Correlation-Id + internal signature
   ▼
Express service (HTTP span → DB span → Redis span → publish span)
   │
   ├── OTLP → Grafana Cloud / Axiom (traces, logs, metrics)
   └── /metrics → Prometheus scrape (opsional)
   ▼
Go worker (consumer span → DB span → batch child spans)
```

- **Propagasi:** W3C `traceparent` + `X-Correlation-Id` (UUIDv4) di semua hop.
- **Sampling:** 100% error traces; 10% success traces di produksi; 100% di staging.
- **Retensi:** trace 30 hari, log 90 hari, metrik 13 bulan (sesuai free tier).
- **Redaksi:** hapus `authorization`, `cookie`, `password`, `nik`, `bank_account`, `token`, `secret` sebelum ekspor.

## 4. Log Terstruktur

Format JSON satu baris:

```json
{
  "timestamp": "2026-11-25T03:45:12.410Z",
  "level": "INFO",
  "service": "claims-service",
  "env": "production",
  "version": "sha-abc1234",
  "correlation_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "span_id": "00f067aa0ba902b7",
  "tenant_id": "019361a2-7c00-7000-8000-000000000001",
  "user_id": "019361a2-7c00-7000-8000-000000000002",
  "action": "CLAIM_DECISION_RECORDED",
  "entity_type": "CLAIM_SUBMISSION",
  "entity_id": "019361a2-7c00-7000-8000-000000000003",
  "duration_ms": 42,
  "message": "Claim CLM-202611-000142 approved at level 1"
}
```

Aturan:
- `level` salah satu `DEBUG/INFO/WARN/ERROR`.
- Jangan log payload penuh; log field yang diizinkan.
- Error log wajib `error_code`, `correlation_id`, dan `retryable`.
- Jangan log NIK/rekening/token; gunakan `*_masked` atau hash.
- Setiap request punya tepat satu log selesai (access log) + log domain.

## 5. Trace Span Wajib

| Span | Attribut |
| --- | --- |
| `http.server` | method, route, status, duration, tenant_id, role |
| `db.query` | db.system, operation, table, rows, duration (tanpa SQL mentah/PII) |
| `redis.command` | operation, key_prefix, cache_hit, duration |
| `queue.publish` | topic, event_type, message_id |
| `queue.consume` | event_type, attempt, duration, outcome |
| `payroll.batch` | batch_id, headcount, policy_version, duration, item_failures |
| `claim.decision` | claim_id, decision, level, risk_score, policy_version |
| `payment.call` | provider, operation, status, duration |
| `audit.append` | entity_type, action, chain_position |

Jangan jadikan `user_id`/`tenant_id` sebagai nama span (kardinalitas tinggi); jadikan attribut.

## 6. Katalog Metrik

**HTTP**
- `http_requests_total{service,route,method,status}`
- `http_request_duration_seconds{service,route,method}` (histogram)
- `http_errors_total{service,route,code}`

**Database**
- `db_pool_connections{state}`
- `db_query_duration_seconds{operation,table}`
- `db_slow_queries_total`

**Cache/Queue**
- `redis_commands_total{operation}`
- `redis_errors_total`
- `queue_publish_total{event_type}`
- `queue_consume_total{event_type,outcome}`
- `queue_lag_seconds`
- `queue_dlq_total`

**Domain**
- `claims_submitted_total{tenant,category}`
- `claims_decided_total{decision,level}`
- `claim_decision_duration_seconds`
- `payroll_batch_duration_seconds{headcount_bucket}`
- `payroll_items_failed_total{reason}`
- `payment_success_total{provider}`
- `payment_failure_total{provider,reason}`
- `payslip_generated_total`
- `report_generated_total{type,status}`
- `audit_chain_broken_total`
- `sod_violation_total`
- `idempotency_replay_total`

**Frontend (RUM)**
- LCP, INP, CLS, TTFB
- route transition duration
- API error rate per route
- JS bundle size per route

## 7. Dashboard

1. **Executive health** — availability, error rate, p95 latency, SLO burn, active incidents.
2. **Claims funnel** — submitted → review → escalated → approved/rejected → disbursed; SLA aging; risk distribution.
3. **Payroll** — batch status, duration, item failures, variance, payslip/report generation.
4. **Payments** — success/failure by provider, pending age, reversals.
5. **Tenant usage** — request volume, storage, queue, top errors (tanpa PII).
6. **Data layer** — pool saturation, slow queries, Redis errors, queue lag, audit chain status.
7. **Frontend** — Core Web Vitals, route bundle size, API error rate.

Setiap dashboard disimpan sebagai JSON di `infra/observability/dashboards/` dan di-provision otomatis bila memungkinkan.

## 8. Alert & Runbook

| Alert | Kondisi | Severity | Runbook |
| --- | --- | --- | --- |
| API error rate high | > 2% selama 5 menit | P1 | cek deploy terakhir, DB, Redis, edge |
| p95 latency high | > 2× SLO selama 10 menit | P2 | cek slow query, pool, downstream |
| DB pool exhausted | > 90% selama 5 menit | P1 | cek koneksi bocor, naikkan pool sementara |
| Redis errors | > 1% selama 5 menit | P2 | cek kuota/network, fallback DB |
| Queue lag | > 5 menit | P2 | cek worker, QStash, DLQ |
| Payment failures | > 5% selama 10 menit | P1 | cek provider, hentikan batch, rekonsiliasi |
| Audit chain broken | > 0 | P0 | hentikan write audit, investigasi, restore |
| Double payment detected | > 0 | P0 | hentikan disbursement, reversal, audit |
| Cross-tenant access | > 0 | P0 | blokir endpoint, investigasi, notifikasi |
| Disk/storage quota | > 80% | P2 | arsipkan, bersihkan, upgrade |

Alert harus menyertakan: symptom, tenant/service, trace/correlation ID contoh, dashboard link, runbook link, dan owner.

## 9. Performance Budget

| Area | Budget | Cara ukur |
| --- | --- | --- |
| Initial JS (gzip) | < 200 KB | `vite build` + `rollup-plugin-visualizer` |
| Route chunk | < 80 KB | analyzer |
| LCP (p75, 4G) | < 2.5 s | Lighthouse/RUM |
| INP (p75) | < 200 ms | RUM |
| API read p95 | < 300 ms | k6/APM |
| API mutation p95 | < 500 ms | k6/APM |
| DB query p95 | < 50 ms | `pg_stat_statements`/APM |
| Payroll 500 items | < 60 s | k6 + worker trace |
| Memory Express | < 256 MB | container metrics |
| Memory Go worker | < 128 MB | `GOMEMLIMIT` + metrics |

## 10. Load Test (k6)

Skenario wajib di `tests/load/`:

| File | Skenario | Beban | Threshold |
| --- | --- | --- | --- |
| `smoke.js` | login + baca dashboard | 5 VU, 1 menit | error < 1%, p95 < 500 ms |
| `claims-read.js` | daftar & detail klaim | 50 VU, 5 menit | error < 1%, p95 < 300 ms |
| `claim-submit.js` | submit klaim + upload signature | 20 VU, 5 menit | error < 1%, p95 < 800 ms |
| `approval-race.js` | 5 approver paralel pada klaim yang sama | 1 iterasi × 20 klaim | 1 success, 4 × 409 |
| `payroll-batch.js` | kalkulasi 500 item | 1 batch × 5 | p95 < 60 s, 0 duplicate |
| `mis-dashboard.js` | GraphQL KPI | 30 VU, 5 menit | error < 1%, p95 < 500 ms |
| `payment-retry.js` | retry webhook | 100 event duplikat | 1 payment |

Aturan:
- Gunakan data seed khusus load test; jangan pernah production.
- Ukur DB/Redis/queue selama test.
- Simpan hasil di `docs/evidence/load/<date>-<scenario>.md` (ringkasan + grafik).
- Jika threshold gagal, buka issue performa; jangan menurunkan threshold tanpa analisis.

## 11. Kapasitas & Free-Tier

| Komponen | Batas | Strategi |
| --- | --- | --- |
| Neon | 512 MB, ~100 pooled conn, auto-suspend | pool max 5/service, keyset pagination, arsip, materialized view |
| Upstash Redis | 10k cmd/hari, 256 MB | cache selektif, pipeline, TTL, hindari `KEYS *` |
| QStash | 500 msg/hari | coarse-grained batch, dedup, DLQ |
| Cloudflare Workers | 100k req/hari, 10ms CPU | edge hanya auth/route/forward |
| Render | 512 MB/container, sleep | `--max-old-space-size=256`, `GOMEMLIMIT=128MiB`, health check, `pnpm warm:production` |
| Cloudinary | 25 credit/bulan | 5 MB limit, format allowlist, transformasi minimal |

**Budget harian:** hitung perkiraan request × command Redis; jika > 60% kuota, kurangi cache/rate-limit atau naikkan paket.

## 12. Optimasi Query

- Keyset pagination `(created_at, id)`; tidak ada `OFFSET` untuk transaksi.
- Index sesuai pola filter: `(tenant_id, branch_id, status, created_at DESC)`.
- Partial index untuk status aktif; covering index untuk rekap batch.
- `EXPLAIN (ANALYZE, BUFFERS)` sebelum dan sesudah perubahan; simpan hasil.
- Hindari N+1 di GraphQL; gunakan DataLoader dan batch endpoint.
- Materialized view untuk KPI; refresh `CONCURRENTLY` setelah event, tetapi **dikoalesikan per tenant** (debounce minimal 5 menit) agar tidak membebani Neon 0.25 vCPU/QStash. Jangan mengirim satu refresh per approval.
- Cache agregasi 10 menit; invalidasi eksplisit setelah approval/disbursement.

## 13. Caching

| Key | Isi | TTL | Invalidasi |
| --- | --- | --- | --- |
| `aletheia:policy:active:<tenant>:<domain>` | policy aktif | 1 jam | publish policy |
| `aletheia:mis:kpi:<tenant>:<month>:<branch>` | KPI | 10 menit | refresh view |
| `aletheia:claims:pending:<tenant>:<branch>` | count | 2 menit | submit/decide |
| `aletheia:idem:<tenant>:<user>:<method>:<path>:<key>` | status/respons | 24 jam | eksplisit |
| `aletheia:ratelimit:<scope>:<id>` | counter | window | otomatis |

Aturan: setiap `SET` punya TTL; gunakan pipeline untuk multi-command; jangan cache data PII mentah.

## 14. Bukti Performa untuk Portofolio

Simpan di `docs/evidence/`:

- `load/` — ringkasan k6 + grafik + analisis.
- `query-plans/` — before/after `EXPLAIN`.
- `bundle/` — screenshot analyzer + ukuran gzip.
- `slo/` — screenshot dashboard + burn rate.
- `incidents/` — post-mortem simulasi (misalnya Redis down).

Setiap bukti mencantumkan tanggal, commit SHA, lingkungan, dan perintah reproduksi.

## 15. Runbook Singkat

### DB down / pool exhausted
1. Cek status Neon dan connection count.
2. Cek kebocoran koneksi (pool metrics, long-running transaction).
3. Turunkan traffic (rate limit/feature flag), restart service jika perlu.
4. Jika perlu, failover ke read replica atau naikkan pool sementara.
5. Catat insiden + correlation ID.

### Redis down / quota habis
1. Bypass cache (fallback DB) dan nonaktifkan rate limit sementara dengan proteksi WAF.
2. Cek kuota Upstash dan command terbanyak.
3. Matikan endpoint non-kritis; antrekan event.
4. Pulihkan, hangatkan cache, pantau error.

### QStash backlog / DLQ
1. Cek lag dan DLQ.
2. Replay DLQ dengan idempotency aman.
3. Skalakan worker atau pecah batch.
4. Pastikan tidak ada duplicate payment.

### Payment provider down
1. Hentikan batch `DISBURSING` baru.
2. Biarkan state `PROCESSING` dengan timeout; jangan retry buta.
3. Rekonsiliasi status via provider API.
4. Jika gagal terminal, tandai `FAILED`, audit, dan minta retry eksplisit.

### Audit chain broken
1. Hentikan semua write audit (feature flag).
2. Identifikasi gap/tenant/rentang.
3. Restore dari backup/PITR ke instance terpisah.
4. Bandingkan hash, dokumentasikan, lanjutkan dengan genesis baru jika perlu.
5. Notifikasi compliance.

## 16. Batasan Keras Observabilitas

> 1. Dilarang mengirim PII ke log/trace/metric label.
> 2. Dilarang membuat metric dengan `user_id`/`claim_id` sebagai label.
> 3. Dilarang menurunkan threshold load test tanpa analisis tertulis.
> 4. Dilarang mengklaim performa tanpa bukti di `docs/evidence/`.
> 5. Dilarang menambahkan alert tanpa runbook dan owner.
> 6. Dilarang mematikan tracing di produksi tanpa persetujuan.

---

## 17. Implementasi M5.2

* **Tanggal:** 26 November 2026
* **Paket:** `packages/observability` untuk Node, `internal/telemetry` untuk Go worker.
* **Stack lokal:** OTel Collector 0.140.1, Jaeger 1.76.0, Prometheus 3.16.0, Grafana 13.3.2.
* **Preload:** service Express dijalankan dengan `node --import ./services/<service>/dist/instrumentation.js`.
* **Export:** OTLP HTTP ke `OTEL_EXPORTER_OTLP_ENDPOINT`, metric interval 5 detik.
* **Sampling:** parent-based dengan rasio dari `OTEL_TRACES_SAMPLER_ARG`, default 1.
* **Log:** pino memakai `currentTraceFields` dan request logger menambahkan `trace_id` serta `span_id`.

Metric yang aktif:

* `http_requests_total`, `http_request_duration_seconds`, `http_errors_total`
* `db_pool_connections`
* `claims_submitted_total`, `claims_decided_total`, `claim_decision_duration_seconds`
* `queue_publish_total`, `queue_consume_total`, `queue_consume_duration_seconds`
* `payroll_batch_duration_seconds`, `payroll_items_failed_total`
* `payment_success_total`, `payment_failure_total`
* `audit_chain_broken_total`

Histogram memakai boundary detik eksplisit. Boundary default OTel dalam milidetik tidak boleh dipakai untuk nilai detik.

Dashboard dan alert:

* `infra/observability/grafana/dashboards/`
* `infra/observability/prometheus/alerts.yml`
* Screenshot: `docs/evidence/slo/`
* Trace: `docs/evidence/slo/m5.2-jaeger-trace.png`

Perintah:

```bash
docker compose --profile observability up -d otel-collector jaeger prometheus grafana
pnpm load:seed
pnpm load:smoke
pnpm load:claims-read
pnpm load:claim-submit
pnpm load:approval-race
pnpm load:payroll-batch
pnpm load:mis-dashboard
pnpm load:payment-retry
pnpm --filter @aletheia/web exec node scripts/capture-dashboards.mjs
```

Bukti lengkap: `docs/evidence/m5.2-verification.md` dan `docs/evidence/load/`.

Server demo dihentikan setelah M5.3. Nyalakan ulang stack observability dengan `pnpm obs:up`, atau seluruh stack dengan `bash scripts/dev-up.sh`. Hentikan dengan `bash scripts/dev-down.sh`. Lihat `HANDOVER.md`.
