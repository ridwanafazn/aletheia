# `05-devops-and-verification.md` — Kontainerisasi, CI/CD, Observabilitas & Kriteria Pengujian Aletheia

* **Nama Sistem:** Aletheia (*Enterprise Disbursement Governance & MIS Intelligence Platform*)
* **Status Dokumen:** Spesifikasi DevOps, Kualitas Kode & Verifikasi (*Single Source of Truth* untuk Agen OpenCode)
* **Target Lingkungan:** Local Docker Compose (Multi-Replica Simulation) & Cloud Free-Tier (Cloudflare, Koyeb/Render, Neon, Upstash)

---

## 1. Standar Kontainerisasi Produksi (*Multi-Stage Docker Builds*)

Seluruh layanan backend wajib dikemas menggunakan teknik *multi-stage build* untuk meminimalkan ukuran *image*, memangkas permukaan serangan keamanan (*attack surface*), dan menjaga konsumsi memori tetap aman di bawah batas kontainer *free-tier* ($512\text{ MB}$ RAM).

### A. Standar Dockerfile Layanan Express.js (`infra/docker/express-service.Dockerfile`)
* **Builder Stage (`node:20-alpine`):** Menginstal dependensi monorepo menggunakan `pnpm`, mengompilasi `packages/shared-contracts` dan layanan target menjadi JavaScript murni, lalu menjalankan `pnpm prune --prod`.
* **Runtime Stage (`node:20-alpine`):**
  * Hanya menyalin `node_modules` produksi dan folder hasil kompilasi `dist/`.
  * Wajib menjalankan proses menggunakan pengguna non-root bawaan (`USER node`) — dilarang keras menjalankan kontainer sebagai `root`.
  * Mengatur batas memori V8 secara eksplisit melalui variabel lingkungan: `ENV NODE_OPTIONS="--max-old-space-size=256"`.
  * Menyertakan instruksi pemeriksaan kesehatan internal:
    ```dockerfile
    HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
      CMD wget -qO- http://localhost:${PORT}/healthz || exit 1
    ```

### B. Standar Dockerfile Pekerja Asinkron Go (`infra/docker/go-worker.Dockerfile`)
* **Builder Stage (`golang:1.26.11-alpine`):** Mengunduh modul dan mengompilasi biner statis tanpa ketergantungan C (`CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o /app/worker ./cmd/worker`).
* **Runtime Stage (`gcr.io/distroless/static-debian12:nonroot`):**
  * Menghasilkan ukuran *image* akhir di bawah $15\text{ MB}$ tanpa shell (`/bin/sh`) maupun manajer paket di dalamnya.
  * Berjalan secara bawaan sebagai pengguna `nonroot` (`UID 65532`).
  * Mengatur batas pengumpul sampah (*garbage collector*) Go secara ketat: `ENV GOMEMLIMIT=128MiB`.

---

## 2. Orkestrasi Lokal & Simulasi *Load Balancing* (`docker-compose.yml`)

Untuk membuktikan ketahanan arsitektur *microservices*, *load balancing*, dan pencegahan transaksi ganda secara lokal sebelum *deployment* ke *cloud*, repositori wajib menyediakan konfigurasi `docker-compose.yml` lengkap dengan *reverse proxy* Nginx:

```yaml
# Ringkasan topologi orkestrasi lokal yang wajib dibangkitkan agen
services:
  nginx-lb:
    image: nginx:1.27-alpine
    ports:
      - "8080:80"
    volumes:
      - ./infra/nginx/nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      governance-service:
        condition: service_healthy
      claims-service:
        condition: service_healthy
      payroll-service:
        condition: service_healthy
      analytics-worker-go:
        condition: service_healthy

  governance-service:
    build:
      context: .
      dockerfile: infra/docker/express-service.Dockerfile
      args:
        SERVICE_NAME: governance-service
    env_file: .env
    environment:
      PORT: 4001

  claims-service:
    build:
      context: .
      dockerfile: infra/docker/express-service.Dockerfile
      args:
        SERVICE_NAME: claims-service
    env_file: .env
    environment:
      PORT: 4002
    # Mendukung pengujian skala horizontal: docker compose up --scale claims-service=2
```

### Konfigurasi Nginx Load Balancer (`infra/nginx/nginx.conf`)
* Menggunakan resolusi DNS internal Docker (`resolver 127.0.0.11 valid=10s;`) dan algoritma distribusi `least_conn` agar saat `claims-service` atau `payroll-service` dijalankan dalam mode multi-replika, beban terbagi merata.
* Meneruskan header pelacakan (`X-Correlation-Id`, `X-Forwarded-For`) dan mengatur batas ukuran *body* maksimal `1MB` (`client_max_body_size 1m;`) karena unggahan dokumen biner langsung diarahkan ke Cloudinary.

---

## 3. Pipeline Otomatisasi CI/CD (`.github/workflows/ci-cd.yml`)

Setiap *Pull Request* dan *push* ke cabang `main` wajib melewati empat gerbang otomatisasi berikut di GitHub Actions:

| Tahap Pipeline | Pemicu | Aktivitas Pemeriksaan & Otomasi | Syarat Lulus (*Gate Criteria*) |
| :--- | :--- | :--- | :--- |
| **1. Static Analysis & Security** | Semua PR & Push | Menjalankan `pnpm typecheck`, `eslint`, `golangci-lint run`, serta pemindaian kebocoran kredensial (*Gitleaks*). | Nol kesalahan tipe, nol peringatan *linter* kritis, nol rahasia terekspos. |
| **2. Automated Testing** | Semua PR & Push | Menjalankan pengujian unit (`vitest` & `go test -race ./...`), coverage domain dengan threshold, serta pengujian integrasi terhadap kontainer Postgres sementara. E2E full-stack dijalankan lokal dan pada job deployment. | $100\%$ kasus uji lulus, coverage domain minimal 90%, dan tidak terdeteksi *data race*. |
| **3. Container Build & Scan** | Push ke `main` | Membangun seluruh *multi-stage Docker images*, memindai kerentanan paket OS dengan **Trivy**, dan mendorong *image* bertag SHA komit ke GitHub Container Registry (`ghcr.io`). | Tidak ada kerentanan tingkat `CRITICAL` yang belum ditambal. |
| **4. Multi-Cloud Deployment** | Push ke `main` (setelah Stage 3 lulus) | Memicu *deploy* otomatis `apps/web` ke **Cloudflare Pages**, `apps/edge-gateway` ke **Cloudflare Workers** (`wrangler deploy`), dan memicu *deploy webhook* kontainer backend. | Seluruh titik akhir `/readyz` produksi merespons HTTP `200 OK` dalam waktu $< 30\text{ detik}$. |

### 3A. Workflow Keamanan Tambahan (`.github/workflows/security.yml`)

Workflow terpisah berjalan pada setiap PR, push ke `main`, dan `workflow_dispatch`:

| Job | Pemeriksaan | Syarat Lulus |
| :--- | :--- | :--- |
| `secrets-and-sast` | Gitleaks 8.30.1 dan Semgrep OWASP Top Ten | 0 secret, 0 temuan Semgrep severity ERROR |
| `dependencies` | `pnpm audit --prod --audit-level high`, Trivy lockfile, `govulncheck` | 0 HIGH/CRITICAL, 0 vulnerability Go |
| `image` | Build worker image dan Trivy image scan | 0 HIGH/CRITICAL |
| `database` | Migrasi, seed sintetis, `security:db`, `security:audit`, `security:pii` | 35/35 RLS checks, audit chain valid, 0 PII literal |

Perintah verifikasi lokal:

```bash
pnpm security:db
pnpm security:audit
pnpm security:pii
pnpm security:deps
```

`security:db` memeriksa RLS, policy, `WITH CHECK`, role `aletheia_app`, privilege audit, dan probe tanpa `app.tenant_id`. `security:audit` merekomputasi hash chain per tenant. `security:pii` memindai source untuk NIK dan rekening mentah. `security:deps` menjalankan audit dependency Node.

---

## 4. Observabilitas, Pemantauan & Pemeliharaan Sistem

### A. Standar *Structured Logging* & Masking PII
Seluruh layanan Express.js (menggunakan `pino`) dan pekerja Go (menggunakan `log/slog`) wajib mencetak log dalam format JSON satu baris ke `stdout`:

```json
{
  "timestamp": "2026-11-25T03:45:12.410Z",
  "level": "INFO",
  "service": "claims-service",
  "correlation_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "user_id": "019361a2-7c00-7000-8000-000000000001",
  "action": "CLAIM_DECISION_RECORDED",
  "duration_ms": 42,
  "message": "Claim CLM-202611-000142 approved at level 1"
}
```

* **Aturan Redaksi Otomatis (*PII Redaction*):** Logger wajib dikonfigurasi untuk otomatis menyensor (`[REDACTED]`) setiap properti bernama `password`, `token`, `authorization`, `nik`, `bank_account`, dan `secret` sebelum dicetak ke aliran log.

### B. Pemisahan Titik Akhir Kesehatan (*Liveness vs Readiness*)
1. **`GET /healthz` (*Liveness Probe*):** Mengembalikan HTTP `200 OK` secara instan tanpa menyentuh database. Digunakan oleh *load balancer* dan pemantau *uptime* untuk memastikan proses aplikasi tidak macet (*hang*).
2. **`GET /readyz` (*Readiness Probe*):** Melakukan kueri ringan `SELECT 1` ke Neon PostgreSQL (batas waktu $2\text{ detik}$) dan perintah `PING` ke Upstash Redis. Mengembalikan HTTP `503 Service Unavailable` jika salah satu dependensi tidak terjangkau sehingga *load balancer* sementara menghentikan pengiriman trafik ke instans tersebut.

---

## 4A. SLO, Load Test & Kapasitas

| Layanan | SLO |
| --- | --- |
| Web | availability 99.9%, LCP < 2.5s, INP < 200ms |
| Edge | p95 < 150ms (read), < 300ms (proxy) |
| Claims API | p95 < 500ms mutasi |
| Payroll API | p95 < 400ms baca |
| Payroll batch 500 item | < 60 detik p95 |
| Audit chain | 100% valid |
| Queue | lag < 60s, DLQ = 0 |

Skenario k6 wajib: `smoke`, `claims-read`, `claim-submit`, `approval-race`, `payroll-batch`, `mis-dashboard`, `payment-retry`. Threshold dan bukti mengikuti `docs/09-observability-and-performance.md`; hasil disimpan di `docs/evidence/load/`.

**Kapasitas free-tier:** pool DB `max: 5` per service, Redis hanya untuk rate limit/lock/idempotency/cache agregasi, QStash coarse-grained batch, edge hanya auth/route/forward. Jika pemakaian > 60% kuota harian, kurangi cache/rate limit atau naikkan paket.

## 4B. Deployment, Backup & Rollback

**Deployment matrix:**

| Komponen | Target | Strategi |
| --- | --- | --- |
| Web | Cloudflare Pages | preview per PR, production dari `main` |
| Edge | Cloudflare Workers | `wrangler deploy`, preview per PR |
| Services | Koyeb/Render | image GHCR tag SHA, rolling deploy |
| Worker Go | Koyeb/Render | image distroless, rolling deploy |
| DB | Neon | branch per PR, migration job, PITR |
| Redis/QStash | Upstash | namespace per environment |
| Cloudinary | Cloudinary | folder per environment/tenant |

**Urutan deploy:** migration → governance → claims/payroll → worker → edge → web. Setiap langkah punya smoke test; jika gagal, rollback ke image/tag sebelumnya.

**Backup/restore:** Neon PITR + `pg_dump` harian untuk tabel kritis; uji restore minimal sekali per fase. Audit log diarsipkan dengan checksum. Redis/QStash bukan source of truth; kehilangan cache tidak boleh kehilangan data finansial.

**Rollback:** image tag sebelumnya, feature flag untuk endpoint baru, migration down/forward plan. Jangan pernah rollback dengan menghapus kolom yang sudah berisi data tanpa backup.

## 4C. Runbook Insiden (Ringkas)

| Insiden | Tindakan |
| --- | --- |
| API 5xx tinggi | cek deploy terakhir, DB pool, Redis, downstream; rollback jika perlu |
| DB pool exhausted | cek koneksi bocor/long transaction; turunkan traffic; restart |
| Redis down/quota | fallback DB, nonaktifkan cache non-kritis, proteksi WAF |
| QStash backlog/DLQ | cek worker, replay idempotent, pecah batch |
| Payment provider down | hentikan batch baru, rekonsiliasi status, jangan retry buta |
| Audit chain broken | hentikan write audit, investigasi, restore, notifikasi compliance |
| Double payment | hentikan disbursement, reversal, audit, laporan |
| Cross-tenant leak | blokir endpoint, investigasi, notifikasi, patch RLS |

Setiap insiden menghasilkan post-mortem tanpa menyalahkan, action item, dan update runbook.

## 5. Matriks Pengujian & *Acceptance Criteria* Wajib untuk Agen OpenCode

Agen OpenCode tidak diizinkan menyatakan tugas pengembangan selesai sebelum seluruh skenario pengujian otomatis berikut berhasil dijalankan dan diverifikasi:

### A. Pengujian Unit Deterministik (`packages/shared-contracts` & `analytics-worker-go`)
* **Test Case U-01 (BPJS Kesehatan Ceiling Cap):** Karyawan dengan gaji pokok Rp $20.000.000$ wajib dipotong BPJS Kesehatan maksimal $1\% \times \text{Rp } 12.000.000 = \text{Rp } 120.000$.
* **Test Case U-02 (BPJS JP Ceiling Cap):** Batas JP $1\% \times \text{Rp } 10.042.300 = \text{Rp } 100.423$.
* **Test Case U-03 (PPh 21 TER Boundary):** Menguji batas bawah bebas pajak ($0\%$) dan batas peralihan tarif TER pada Kategori A (`TK/0`), Kategori B (`K/1`), dan Kategori C (`K/3`) hingga presisi $2\text{ desimal}$.
* **Test Case U-13 (Claims Risk Threshold):** Klaim dengan skor tepat di ambang eskalasi wajib dieskalasi (`>=`).
* **Test Case U-14 (Conflict Below L1):** Klaim di bawah batas Level 1 tetapi `has_conflict_flag == true` wajib dieskalasi ke `FINANCE_MANAGER`.

### B. Pengujian Integrasi & Konkurensi (`tests/integration/`)
* **Test Case I-01 (Segregation of Duties Enforcement):** Permintaan `POST /api/v1/claims/:id/decide` yang dikirim menggunakan token JWT milik *Claims Officer* pembuat klaim tersebut wajib ditolak dengan HTTP `403 Forbidden` (`ERR_SOD_VIOLATION`).
* **Test Case I-02 (Race Condition & Double-Approval Prevention):** Mengirimkan $5\text{ permintaan}$ `POST /api/v1/claims/:id/decide` secara bersamaan (*concurrent HTTP promises*) untuk klaim yang sama: tepat **1 permintaan** boleh berhasil (`200 OK`), sementara **4 permintaan lainnya** wajib ditolak dengan `409 Conflict` (`ERR_CONCURRENT_LOCK` atau `ERR_IDEMPOTENCY_CONFLICT`).
* **Test Case I-03 (Idempotent Payroll Disbursement):** Mengirimkan pesan *webhook* `PAYROLL_BATCH_CALCULATE` dan `disburse` dua kali dengan `Idempotency-Key` yang sama wajib menghasilkan tepat **1 catatan pembayaran** di `payroll.items` tanpa duplikasi saldo.
* **Test Case I-04 (Immutable Audit Log Protection):** Eksekusi perintah SQL langsung `UPDATE governance.audit_logs SET action = 'TAMPERED'` atau `DELETE FROM governance.audit_logs` wajib memicu galat database `SECURITY_VIOLATION`.
* **Test Case I-05 (What-If Sandbox Isolation):** Menjalankan simulasi *What-If* dengan perubahan tarif komisi $+50\%$ wajib menghasilkan laporan varians di `analytics.what_if_simulations` tanpa mengubah satu pun angka di `payroll.items` maupun `claims.submissions`.
* **Test Case I-06 (Cross-Tenant Isolation):** Token tenant A mengakses klaim/payslip/laporan tenant B wajib menghasilkan `404`/`403` tanpa membocorkan data.
* **Test Case I-07 (Policy Publish Atomic):** Menerbitkan policy baru mengarsipkan versi aktif lama dalam satu transaksi; tidak ada dua `ACTIVE` untuk `(tenant, domain)`.
* **Test Case I-08 (Payslip Reconciliation):** Total gross/deduction/net pada payslip sama persis dengan `payroll.items` setelah pembulatan.
* **Test Case I-09 (Annual Reconciliation):** Rekonsiliasi PPh 21 tahunan memposting selisih tanpa mengubah baris bulanan.
* **Test Case I-10 (Report Checksum):** Generate ulang laporan untuk snapshot yang sama menghasilkan checksum yang sama; unduhan diaudit.
* **Test Case I-11 (Forged Gateway Header):** Request dengan `X-User-*` palsu tanpa signature valid ditolak `401`.
* **Test Case I-12 (Missing Policy Key):** Policy tanpa kunci wajib gagal `422 ERR_POLICY_RULE_VIOLATION`, bukan default 0.
* **Test Case I-13 (Duplicate Batch/Personnel):** Constraint `(tenant_id, batch_id, personnel_id)` menolak duplikasi.
* **Test Case I-14 (Concurrent Disbursement):** Dua request disburse dengan idempotency key berbeda untuk batch/personel yang sama tetap menghasilkan satu `PAID`.
* **Test Case I-15 (RLS Without Tenant):** Query tanpa `app.tenant_id` mengembalikan 0 baris/error, bukan seluruh data.
* **Test Case I-16 (Payroll SoD):** `POST /payroll/batches/:id/approve` oleh `created_by` yang sama ditolak `403 ERR_SOD_VIOLATION`.

---

## 6. Batasan Keras DevOps & Keamanan untuk Agen OpenCode

> **Instruksi Wajib bagi Seluruh Agen Pengembangan:**
> 1. **Dilarang Menyimpan Rahasia di Repositori:** Jangan pernah menuliskan kredensial Neon, Upstash, Cloudinary, atau `JWT_SECRET` di dalam `Dockerfile`, `docker-compose.yml`, maupun kode sumber. Sediakan hanya berkas `.env.example` berisi nama variabel tanpa nilai asli.
> 2. **Wajib Race Detector pada Go:** Setiap perubahan kode pada `services/analytics-worker-go` wajib diuji menggunakan perintah `go test -race -v ./...` untuk menjamin tidak ada *race condition* pada pemrosesan paralel *batch payroll*.
> 3. **Skrip Verifikasi Satu Perintah:** Agen wajib membuat dan memelihara skrip `scripts/verify-all.sh` yang menjalankan *typecheck*, *unit test*, dan *integration test* secara berurutan agar mudah diaudit saat *code review*.
> 4. **Kepatuhan Kode Bersih (*Clean Code*):** Setiap fungsi publik pada layanan backend maupun fungsi pembantu (*helper*) aturan bisnis wajib dilengkapi komentar dokumentasi standar (TSDoc / GoDoc) yang menjelaskan tujuan bisnis dan referensi kebijakan yang digunakan.
>
> 5. **Bukti Load Test:** Setiap klaim performa wajib disertai hasil k6 di `docs/evidence/load/` (tanggal, commit SHA, environment, threshold, analisis). Dilarang menurunkan threshold tanpa ADR.
>
> 6. **Gate Keamanan:** gitleaks, trivy, semgrep, dan `pnpm audit`/`govulncheck` wajib lulus tanpa CRITICAL. Temuan HIGH harus punya issue + mitigasi.
>
> 7. **Deploy Butuh Persetujuan:** Deploy production dan perubahan RLS/migration destruktif wajib persetujuan eksplisit pengguna. Preview environment boleh otomatis.
>
> 8. **Observability Wajib:** Service baru wajib mengirim trace OTLP, log JSON dengan `tenant_id`/`trace_id`, metrik dasar, `/healthz`, `/readyz`, dan runbook. Tanpa itu, task belum selesai.