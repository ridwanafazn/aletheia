# `01-architecture-and-infra.md` — Topologi Sistem & Infrastruktur *Cloud-Native* Aletheia

* **Nama Sistem:** Aletheia (*Enterprise Disbursement Governance & MIS Intelligence Platform*)

* **Status Dokumen:** Spesifikasi Arsitektur & Infrastruktur (*Single Source of Truth* untuk Agen OpenCode)

* **Prinsip Utama:** *Zero-Cost Production-Ready, Stateless Cloud-Native, High Concurrency under Strict Resource Quotas*

## 1. Diagram Topologi Sistem (*End-to-End Architecture*)

Arsitektur Aletheia memisahkan jalur transaksi cepat (*Synchronous Path*) dengan jalur pemrosesan berat dan analitik lintas-domain (*Asynchronous Path*) guna menjaga latensi tetap rendah di atas infrastruktur *free-tier*.

```
flowchart TB
    subgraph ClientLayer ["1. Presentation Layer (Cloudflare Pages)"]
        UI["React 19 + TypeScript (Vite)<br/>TanStack Query + Feature-Sliced Architecture"]
    end

    subgraph EdgeLayer ["2. Edge API Gateway & BFF (Cloudflare Workers)"]
        GW["Hono / Yoga GraphQL Edge Gateway<br/>• JWT Verification & RBAC Claims<br/>• Sliding-Window Rate Limiter<br/>• GraphQL Aggregator (MIS Dashboard)<br/>• REST Reverse Proxy (Transactional)"]
    end

    subgraph MediaLayer ["External Object Storage"]
        CLD["Cloudinary Vault<br/>(Direct Signed Upload & RBAC Delivery)"]
    end

    subgraph ComputeLayer ["3. Core Microservices Runtime (Docker Containers)"]
        SVC_GOV["Governance & Policy Service<br/>(Express.js TS • Port 4001)"]
        SVC_CLM["Claims Operations Service<br/>(Express.js TS • Port 4002)"]
        SVC_PAY["Payroll & Incentive Service<br/>(Express.js TS • Port 4003)"]
        WRK_GO["Async Risk, Batch & MIS Worker<br/>(Go 1.26 • Port 4004)"]
    end

    subgraph DataLayer ["4. Serverless Data, Cache & Queue Layer"]
        NEON[("Neon PostgreSQL<br/>(PgBouncer Pooled + Branching)")]
        REDIS[("Upstash Redis<br/>(Cache-Aside, Locks, Idempotency)")]
        QSTASH[["Upstash QStash<br/>(HTTP Event Broker & Retry Queue)"]]
    end

    subgraph ObsLayer ["5. CI/CD & Observability"]
        GHA["GitHub Actions<br/>(Test, Lint, Multi-Stage Docker Build)"]
        GRAF["Grafana Cloud / Axiom<br/>(Structured JSON Logs & Traces)"]
    end

    UI -- "HTTPS (GraphQL / REST)" --> GW
    UI -- "Direct Signed Upload" --> CLD
    GW -- "Rate Limit & Cache Lookup" --> REDIS
    GW -- "Internal REST + Service Token" --> SVC_GOV
    GW -- "Internal REST + Service Token" --> SVC_CLM
    GW -- "Internal REST + Service Token" --> SVC_PAY
    GW -- "GraphQL Read Queries" --> SVC_GOV
    GW -- "GraphQL Read Queries" --> SVC_CLM
    GW -- "GraphQL Read Queries" --> SVC_PAY

    SVC_GOV & SVC_CLM & SVC_PAY -- "Pooled SQL (SSL)" --> NEON
    SVC_GOV & SVC_CLM & SVC_PAY -- "Cache & Distributed Lock" --> REDIS
    SVC_CLM & SVC_PAY -- "Publish Async Events" --> QSTASH
    QSTASH -- "Signed Webhook Push" --> WRK_GO
    WRK_GO -- "Batch Write & Anomaly Flag" --> NEON
    WRK_GO -- "Invalidate Cache" --> REDIS

    SVC_GOV & SVC_CLM & SVC_PAY & WRK_GO -. "Telemetry" .-> GRAF

```

**Catatan arsitektur baru:** setiap request membawa `tenant_id` dari JWT; edge meneruskannya ke service. Pencairan klaim/payroll melewati `packages/payments` (interface `PaymentProvider`, mock untuk demo, adapter Xendit/Midtrans opsional). Semua service mengekspor trace OTLP dan metrik; lihat `docs/09-observability-and-performance.md`.

## 1A. Keputusan Repo & Deployment (ADR-001)

Aletheia memakai **satu monorepo dengan deploy terpisah**:

- `apps/web` → Cloudflare Pages (static SPA).
- `apps/edge-gateway` → Cloudflare Workers (`wrangler deploy`).
- `services/*` dan `analytics-worker-go` → Render (Docker build dari repo).
- `packages/*` → library internal, tidak di-deploy sendiri.

Alasan: kontrak berubah dalam satu PR atomik, CI memakai path filter, dan perekrut melihat satu repo yang koheren. Dua repo FE/BE ditolak untuk konteks proyek ini; lihat `docs/12-delivery-repo-and-portfolio-strategy.md` dan ADR-001.

## 2. Pemetaan Lapisan Komputasi & Tanggung Jawab Teknis

### A. Lapisan Antarmuka (*Cloudflare Pages*)

* **Teknologi:** React 19, TypeScript, Vite, Tailwind CSS, TanStack Router, TanStack Query, dan GraphQL Request/REST client.

* **Strategi Pengiriman:** Kompilasi aset statis (*SPA*) yang didistribusikan melalui jaringan CDN *edge* Cloudflare. Menggunakan *code-splitting* berbasis rute agar bundel awal tetap di bawah `200 KB` (gzipped).

* **Penanganan Dokumen:** Berkas bukti klaim (PDF/gambar) tidak pernah melewati server Express.js. Frontend meminta *upload signature* berdurasi singkat (`TTL 5 menit`) dari `Claims Service`, lalu mengunggah berkas langsung ke **Cloudinary**.

### B. Lapisan Gerbang *Edge* & BFF (*Cloudflare Workers*)

* **Teknologi:** TypeScript di atas V8 Isolate (menggunakan kerangka kerja ringan seperti Hono dan GraphQL Yoga).

* **Peran Ganda (*Hybrid API Gateway*):**

  1. **REST Reverse Proxy:** Meneruskan mutasi transaksional (`POST`, `PUT`, `PATCH`) ke masing-masing layanan Express.js dengan menyisipkan *header* identitas terverifikasi (`X-User-Id`, `X-User-Role`, `X-Branch-Id`, `X-Correlation-Id`).

  2. **GraphQL BFF (*Backend-for-Frontend*):** Melayani kebutuhan pembacaan kompleks untuk **Dasbor MIS Analyst** dan **Detail Audit Klaim**, menggabungkan data dari layanan *Governance*, *Claims*, dan *Payroll* dalam satu permintaan HTTP tunggal tanpa *over-fetching*.

* **Keamanan *Edge*:** Melakukan verifikasi tanda tangan JWT dan menerapkan *sliding-window rate limiting* menggunakan Upstash Redis REST API sebelum permintaan menyentuh kontainer backend.

### C. Lapisan *Microservices* Inti (*Express.js TS & Go Worker*)

Untuk menjaga kemurnian arsitektur *microservices* sekaligus mengakomodasi batasan memori *free-tier* (Render), layanan dibangun secara terpisah di dalam monorepo dengan jejak memori minimal:

1. **`governance-service` (Express.js + TypeScript):** Mengelola autentikasi, RBAC, siklus versi *Policy Reference*, dan buku besar *Immutable Audit Trail*.

2. **`claims-service` (Express.js + TypeScript):** Menangani siklus hidup klaim, pembuatan *signed upload* Cloudinary, validasi *Maker–Checker–Approver*, dan penerbitan event pemeriksaan risiko ke QStash.

3. **`payroll-service` (Express.js + TypeScript):** Mengelola data master karyawan/agen, inisiasi periode penggajian, dan memicu antrean pemrosesan massal ke pekerja Go.

4. **`analytics-worker-go` (Go 1.26):** Layanan pekerja konkuren (*stateless HTTP consumer* untuk Upstash QStash) yang menangani tiga beban kerja berat:

   * Kalkulasi paralel *batch payroll* (PPh 21 & BPJS) dengan goroutine worker pool.

   * Pemindaian anomali lintas-domain (pencocokan identitas/rekening klaim vs karyawan/agen).

   * Eksekusi simulasi *What-If* bagi analis MIS dan penyegaran *Materialized Views* PostgreSQL.

> **Catatan Deployment Fleksibel (Multi-Container vs Consolidated Gateway):**
> Di lingkungan lokal (`docker-compose.yml`), keempat layanan berjalan sebagai kontainer terpisah di belakang *load balancer* Nginx. Pada lingkungan produksi *free-tier* yang membatasi jumlah kontainer aktif, layanan Express.js dijalankan sebagai empat service Render terpisah di belakang edge gateway, dengan batas memori ketat tanpa mengubah satu baris pun logika domainnya.

## 3. Batasan Keras *Free-Tier* & Strategi Mitigasi Arsitektural

Agen pengembangan wajib mematuhi batasan kuota layanan gratis berikut agar sistem tidak pernah mengalami *out-of-memory* (OOM), kehabisan koneksi database, atau pemblokiran kuota harian:

| Layanan *Free-Tier* | Batasan Kuota Keras | Risiko Kegagalan | Mitigasi Wajib di Level Kode & Infrastruktur | 
| ----- | ----- | ----- | ----- | 
| **Neon PostgreSQL** | Maks. `0.25 - 1 vCPU`, \~100 koneksi *pooled*, batas penyimpanan `512 MB`, *auto-suspend* setelah 5 menit idle. | *Connection exhaustion* saat lonjakan *microservice* & latensi *cold start* `~1-2 detik`. | Wajib menggunakan *endpoint* **PgBouncer Neon** (`-pooler`), membatasi `max: 5` koneksi per layanan Express/Go, serta menerapkan *retry with exponential backoff* pada koneksi awal. | 
| **Upstash Redis** | Maks. `10.000` perintah/hari & kapasitas `256 MB` pada paket gratis. | Kuota perintah harian habis jika setiap kueri kecil menyentuh Redis. | Gunakan Redis secara selektif hanya untuk: (1) *Rate limiting* mutasi, (2) *Distributed lock* & *Idempotency key* pencairan, dan (3) *Cache* hasil agregasi dasbor MIS (`TTL 5–15 menit`). Hindari `KEYS *`. | 
| **Upstash QStash** | Maks. `500` pesan/hari pada paket gratis. | Pengiriman pesan gagal jika setiap baris data dikirim sebagai 1 event terpisah. | Terapkan pola **Coarse-Grained Batch Events**: satu periode *payroll* berisi 500 karyawan dikirim sebagai **1 pesan QStash** berisi `batch_id`, bukan 500 pesan terpisah. | 
| **Cloudflare Workers** | Maks. `100.000` permintaan/hari & batas waktu CPU `10 ms` per eksekusi. | Eksekusi dihentikan paksa jika *edge* melakukan pemrosesan data besar. | *Edge Worker* dilarang melakukan agregasi berat atau transformasi array besar; tugasnya murni validasi JWT, *routing*, dan *forwarding* GraphQL/REST. | 
| **Container Runtime** *(Render)* | RAM `512 MB` per kontainer, *sleep* setelah 15 menit tanpa trafik. | Node.js mengalami *OOM Crash* atau *cold start* lambat saat *demo*. | Konfigurasi `NODE_OPTIONS="--max-old-space-size=256"` pada semua kontainer Express.js, gunakan `GOMEMLIMIT=128MiB` pada pekerja Go, dan sediakan *endpoint* `/healthz` ringan untuk pemantauan *uptime*. |
| **Cloudinary** | `25` kredit/bulan (\~25 GB penyimpanan/bandwidth). | Pembengkakan ukuran unggahan dokumen bukti klaim. | Batasi ukuran unggahan maksimal `5 MB` per berkas melalui parameter *signed upload* (format `PDF`, `JPG`, `PNG`, `WEBP` saja). | 

## 4. Pola Ketahanan Sistem (*Cloud-Native Resiliency & Load Balancing*)

1. **Arsitektur *Stateless* 100%:** Tidak ada layanan yang boleh menyimpan sesi pengguna di memori lokal atau menulis berkas sementara ke sistem berkas kontainer (`/tmp` hanya digunakan jika benar-benar perlu dan wajib dibersihkan seketika). Seluruh *state* terdistribusi disimpan di Neon PostgreSQL atau Upstash Redis.

2. **Load Balancing & Distribusi Trafik:**

   * Di tingkat global, Cloudflare otomatis mendistribusikan trafik ke *edge node* terdekat.

   * Di tingkat internal (dan simulasi *production* lokal via Docker Compose), *reverse proxy* Nginx menerapkan algoritma `least_conn` dengan pemeriksaan kesehatan aktif (`health_check` tiap 10 detik ke `/healthz`) untuk membagi beban ke beberapa replika layanan backend.

3. **Graceful Shutdown:** Seluruh layanan Express.js dan Go wajib menangkap sinyal `SIGTERM` dan `SIGINT`—menghentikan penerimaan permintaan baru, menyelesaikan transaksi database yang sedang berjalan (batas tunggu `10 detik`), menutup *pool* koneksi database dan Redis, lalu keluar dengan kode `0`.

4. **Sirkuit Pengaman & Timeout (*Timeout & Circuit Breaker*):**

   * Komunikasi sinkron dari Cloudflare Workers ke layanan backend memiliki batas waktu maksimal `8 detik` untuk mutasi dan `5 detik` untuk kueri baca.

   * Pengiriman *webhook* dari Upstash QStash ke `analytics-worker-go` wajib memverifikasi tanda tangan kriptografis (`Upstash-Signature`) dan mengonfigurasi *exponential backoff* maksimal `3 kali` percobaan ulang sebelum masuk ke *Dead Letter Queue* (DLQ).

## 5. Struktur Direktori Monorepo (*Agentic Workspace Layout*)

OpenCode dan agen AI wajib mengikuti struktur direktori berikut agar batas antar-layanan tetap terjaga dan kode bersama (*shared contracts*) tidak terduplikasi:

```
aletheia/
├── docs/                               # Spesifikasi, ADR & bukti
│   ├── 00-context-and-vision.md
│   ├── 01-architecture-and-infra.md
│   ├── 02-database-and-governance.md
│   ├── 03-api-and-graphql-contracts.md
│   ├── 04-business-rules-and-engines.md
│   ├── 05-devops-and-verification.md
│   ├── 06-execution-roadmap.md
│   ├── 07-frontend-architecture-and-ux.md
│   ├── 08-security-and-compliance.md
│   ├── 09-observability-and-performance.md
│   ├── 10-testing-and-quality-strategy.md
│   ├── 11-hris-lite-and-payroll-reporting.md
│   ├── 12-delivery-repo-and-portfolio-strategy.md
│   ├── 13-job-targeting-matrix.md
│   ├── 14-architecture-decision-records.md
│   ├── assets/                         # screenshot, diagram
│   └── evidence/                       # load test, query plan, bundle, SLO
├── apps/
│   ├── web/                            # React 19 + TS + Vite (Cloudflare Pages)
│   └── edge-gateway/                   # Hono + GraphQL Yoga (Cloudflare Workers)
├── services/
│   ├── governance-service/             # Auth, tenant/RBAC, policy, audit verify
│   ├── claims-service/                 # Claims lifecycle, Cloudinary signer, disbursement
│   ├── payroll-service/                # HRIS-lite, batches, payslip, reports
│   └── analytics-worker-go/            # Go: payroll calc, anomaly, What-If, MV refresh
├── packages/
│   ├── shared-contracts/               # Zod, OpenAPI, GraphQL SDL, error codes
│   ├── database/                       # Drizzle schema, migrations, seed, RLS
│   ├── payments/                       # PaymentProvider + mock + optional adapter
│   ├── observability/                  # OTel, logger, correlation
│   └── ui/                             # design system (opsional)
├── tests/
│   ├── integration/
│   ├── e2e/
│   └── load/
├── infra/
│   ├── nginx/                          # Load balancer lokal
│   ├── docker/                         # Multi-stage Dockerfiles
│   └── observability/                  # dashboard, alert rules
├── scripts/                            # verify-all, seed, db:*
├── docker-compose.yml
├── pnpm-workspace.yaml
├── PRODUCT.md
├── DESIGN.md
├── README.md
└── .github/workflows/                  # CI/CD (test, lint, scan, deploy)

```

## 6. Batasan Keras Infrastruktur untuk Agen OpenCode

> **Instruksi Wajib bagi Seluruh Agen Pengembangan:**
>
> 1. **Dilarang Membuka Koneksi Database Tanpa Batas:** Setiap layanan wajib menggunakan konfigurasi *connection pool* eksplisit (`max: 5`, `idleTimeoutMillis: 30000`, `connectionTimeoutMillis: 5000`) dan terhubung melalui *pooled connection string* Neon.
>
> 2. **Verifikasi Autentikasi Berlapis (*Zero-Trust Internal*):** Layanan Express.js tidak boleh mempercayai *header* `X-User-*` begitu saja tanpa memverifikasi tanda tangan *internal gateway secret* (`X-Gateway-Signature`) dari Cloudflare Workers, termasuk `method`, `path`, dan `sha256(body)`, agar layanan tidak bisa ditembak langsung atau di-replay melewati gerbang *edge*.
>
> 3. **Dilarang Melakukan *Upload* Biner Melalui Backend:** Jangan pernah memasang *middleware* seperti `multer` untuk menerima unggahan berkas di Express.js. Seluruh dokumen bukti wajib diunggah langsung dari browser ke Cloudinary menggunakan *signed payload*.
>
> 4. **Efisiensi Penggunaan Upstash:** Setiap perintah Redis yang ditulis agen harus menyertakan `TTL` eksplisit (*expiration*) dan menggunakan *pipeline* jika mengeksekusi lebih dari satu operasi sekaligus guna menghemat kuota harian *free-tier*.
>
> 5. **Standar Observabilitas:** Seluruh layanan wajib mencetak log dalam format JSON satu baris (*structured logging*) yang memuat `timestamp`, `level`, `service_name`, `correlation_id`, `trace_id`, `tenant_id`, dan `user_id` tanpa membocorkan rahasia kredensial atau NIK/nomor rekening penuh. Trace OTLP wajib aktif untuk alur kritis.
>
> 6. **Tenant dari Token:** `tenant_id` wajib berasal dari JWT terverifikasi dan diteruskan sebagai header internal bertanda tangan. Dilarang membaca `tenant_id` dari body/query. Service menetapkan `app.tenant_id` untuk RLS di setiap transaksi.
>
> 7. **Payment Adapter Wajib:** Pencairan tidak boleh memanggil provider secara langsung dari service. Gunakan `packages/payments`; mock untuk demo/test, adapter nyata opsional. Status `PAID` hanya dari provider/mock, bukan input manual.
>
> 8. **Deploy Terpisah, Repo Tunggal:** Jangan memecah repo tanpa ADR baru. Pipeline wajib memakai path filter agar perubahan FE tidak membangun ulang Go worker.
>
> 9. **HRIS-lite Dikunci:** Jangan menambahkan absensi clock-in/out, shift scheduling, rekrutmen, performance, atau THR otomatis ke milestone tanpa keputusan baru. Lihat `docs/11-hris-lite-and-payroll-reporting.md`.