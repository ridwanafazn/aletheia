# Render Blueprint — Nilai Env per Service

Gunakan file ini saat Render meminta nilai `sync: false` pada Blueprint pertama.
Semua nilai diambil dari `.env.production.local` (di-ignore Git). Jangan menempelkan nilai secret ke chat atau commit.

**Status 26 November 2026:** Blueprint sudah diterapkan dan keempat service live. Env `WORKER_URL`, `WORKER_PUBLIC_URL`, dan `QSTASH_URL` sudah diaudit lewat Render API; nilainya sesuai tabel di `docs/evidence/m6.2-verification.md`.

## Ringkasan service

| Service Render | Dockerfile | Health check |
| --- | --- | --- |
| `aletheia-governance` | `infra/docker/express-service.Dockerfile` (`SERVICE_NAME=governance-service`) | `/healthz` |
| `aletheia-claims` | `infra/docker/express-service.Dockerfile` (`SERVICE_NAME=claims-service`) | `/healthz` |
| `aletheia-payroll` | `infra/docker/express-service.Dockerfile` (`SERVICE_NAME=payroll-service`) | `/healthz` |
| `aletheia-worker` | `infra/docker/go-worker.Dockerfile` | `/healthz` |

## Nilai yang diminta Render

### `aletheia-governance`

| Key | Sumber di `.env.production.local` |
| --- | --- |
| `DATABASE_URL_APP` | `DATABASE_URL_APP` |
| `JWT_PRIVATE_KEY` | `JWT_PRIVATE_KEY` |
| `JWT_PUBLIC_KEY` | `JWT_PUBLIC_KEY` |
| `REFRESH_TOKEN_PEPPER` | `REFRESH_TOKEN_PEPPER` |
| `MFA_ENCRYPTION_KEY` | `MFA_ENCRYPTION_KEY` |
| `INTERNAL_GATEWAY_SECRET` | `INTERNAL_GATEWAY_SECRET` |
| `PII_PEPPER` | `PII_PEPPER` |
| `QSTASH_TOKEN` | `QSTASH_TOKEN` |
| `QSTASH_CURRENT_SIGNING_KEY` | `QSTASH_CURRENT_SIGNING_KEY` |
| `QSTASH_NEXT_SIGNING_KEY` | `QSTASH_NEXT_SIGNING_KEY` |

### `aletheia-claims`

| Key | Sumber di `.env.production.local` |
| --- | --- |
| `DATABASE_URL_APP` | `DATABASE_URL_APP` (sama dengan governance) |
| `INTERNAL_GATEWAY_SECRET` | `INTERNAL_GATEWAY_SECRET` (sama) |
| `PII_PEPPER` | `PII_PEPPER` (sama) |
| `PAYMENT_WEBHOOK_SECRET` | `PAYMENT_WEBHOOK_SECRET` |
| `FILE_SIGNING_SECRET` | `FILE_SIGNING_SECRET` |
| `CLOUDINARY_CLOUD_NAME` | `CLOUDINARY_CLOUD_NAME` |
| `CLOUDINARY_API_KEY` | `CLOUDINARY_API_KEY` |
| `CLOUDINARY_API_SECRET` | `CLOUDINARY_API_SECRET` |
| `QSTASH_TOKEN` | `QSTASH_TOKEN` (sama) |
| `QSTASH_CURRENT_SIGNING_KEY` | `QSTASH_CURRENT_SIGNING_KEY` (sama) |
| `QSTASH_NEXT_SIGNING_KEY` | `QSTASH_NEXT_SIGNING_KEY` (sama) |

### `aletheia-payroll`

| Key | Sumber di `.env.production.local` |
| --- | --- |
| `DATABASE_URL_APP` | `DATABASE_URL_APP` (sama) |
| `INTERNAL_GATEWAY_SECRET` | `INTERNAL_GATEWAY_SECRET` (sama) |
| `PII_PEPPER` | `PII_PEPPER` (sama) |
| `PAYMENT_WEBHOOK_SECRET` | `PAYMENT_WEBHOOK_SECRET` (sama) |
| `FILE_SIGNING_SECRET` | `FILE_SIGNING_SECRET` (sama) |
| `CLOUDINARY_CLOUD_NAME` | `CLOUDINARY_CLOUD_NAME` (sama) |
| `CLOUDINARY_API_KEY` | `CLOUDINARY_API_KEY` (sama) |
| `CLOUDINARY_API_SECRET` | `CLOUDINARY_API_SECRET` (sama) |
| `QSTASH_TOKEN` | `QSTASH_TOKEN` (sama) |
| `QSTASH_CURRENT_SIGNING_KEY` | `QSTASH_CURRENT_SIGNING_KEY` (sama) |
| `QSTASH_NEXT_SIGNING_KEY` | `QSTASH_NEXT_SIGNING_KEY` (sama) |

### `aletheia-worker`

| Key | Sumber di `.env.production.local` |
| --- | --- |
| `WORKER_DATABASE_URL` | `WORKER_DATABASE_URL` (direct, role `aletheia_app`) |
| `QSTASH_TOKEN` | `QSTASH_TOKEN` (sama) |
| `QSTASH_CURRENT_SIGNING_KEY` | `QSTASH_CURRENT_SIGNING_KEY` (sama) |
| `QSTASH_NEXT_SIGNING_KEY` | `QSTASH_NEXT_SIGNING_KEY` (sama) |

## Catatan penting

1. **Jangan mengubah `PII_PEPPER`.** Nilai ini dipakai saat seed Neon; kalau berbeda, hash NIK/rekening tidak cocok.
2. `JWT_PRIVATE_KEY` dan `JWT_PUBLIC_KEY` disimpan satu baris dengan urutan `\n`. Copy persis dari file; jangan mengubah menjadi baris baru.
3. `DATABASE_URL_APP` adalah koneksi **pooled** Neon dengan role `aletheia_app`.
4. `WORKER_DATABASE_URL` adalah koneksi **direct** Neon dengan role `aletheia_app`.
5. `WORKER_URL` dan `WORKER_PUBLIC_URL` sudah diisi di `render.yaml` sebagai `https://aletheia-worker-zjnt.onrender.com` (Render memberi suffix pada nama service). Jangan memakai `https://aletheia-worker.onrender.com`; host itu milik aplikasi lain.
6. Setelah Blueprint apply, tunggu keempat service berstatus **Live** dan health check hijau.
7. `QSTASH_URL` harus memakai region token: `https://qstash-us-east-1.upstash.io`. Endpoint default `https://qstash.upstash.io` mengarah ke `eu-central-1` dan menghasilkan `enqueued=false`.
8. Jika service gagal start, buka **Logs** dan cari pesan seperti:
   - `DATABASE_URL_APP wajib diisi di production` → env belum terpasang di service itu.
   - `INTERNAL_GATEWAY_SECRET wajib diisi` → secret belum diisi.
   - `WORKER_DATABASE_URL atau DATABASE_URL wajib diisi` → env worker belum diisi.
9. Jika Render meminta kartu untuk free tier, ikuti verifikasi yang diminta; ini di luar kendali aplikasi.
