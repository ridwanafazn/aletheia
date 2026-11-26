# `08-security-and-compliance.md` — Model Ancaman, Kontrol Keamanan & Kepatuhan Aletheia

* **Status Dokumen:** Spesifikasi Keamanan & Kepatuhan (*Single Source of Truth* untuk Agen OpenCode)
* **Standar Acuan:** OWASP ASVS Level 2, OWASP Top 10 (2021), UU PDP Indonesia, prinsip ISO/IEC 27001
* **Prinsip:** Zero-Trust Internal, Least Privilege, Defense in Depth, Fail Closed, Audit Everything

## 1. Aset yang Dilindungi

| Aset | Contoh | Dampak jika bocor/berubah |
| --- | --- | --- |
| Dana | pencairan klaim, payroll, komisi | kerugian finansial langsung, fraud |
| Identitas | NIK, nama, kontak, rekening | pencurian identitas, penipuan |
| Dokumen | KTP, invoice medis, laporan polis | kebocoran PII, pemalsuan |
| Kebijakan | `rules_payload`, versi, checksum | manipulasi aturan, pelanggaran audit |
| Jejak audit | `audit_logs`, hash chain | hilangnya bukti, audit gagal |
| Kredensial | JWT secret, gateway secret, DB/Redis/Cloudinary | pengambilalihan sistem |
| Keputusan | approval, rejection, alasan | sengketa, penyalahgunaan wewenang |

## 2. Aktor & Trust Boundary

| Aktor | Kepercayaan | Batas |
| --- | --- | --- |
| Browser | tidak dipercaya | hanya boleh memegang access token di memori + refresh HttpOnly |
| Edge Gateway (Cloudflare Workers) | dipercaya terbatas | memverifikasi JWT, menandatangani header internal, rate limit |
| Express services | dipercaya | hanya menerima request bertanda tangan gateway; validasi ulang semua input |
| Go worker | dipercaya | hanya menerima webhook QStash bertanda tangan; akses DB read/write terbatas |
| Neon PostgreSQL | dipercaya | RLS, role terpisah, audit trigger |
| Upstash Redis/QStash | dipercaya terbatas | data non-rahasia, TTL eksplisit, signature verification |
| Cloudinary | pihak ketiga | signed upload, delivery terbatas, tanpa rahasia di client |
| Operator/Admin | dipercaya dengan kontrol | RBAC + audit + SoD; tidak ada akses langsung ke produksi tanpa jejak |

**Aturan:** setiap boundary memvalidasi ulang input dan identitas. Tidak ada "trusted network" di dalam VPC.

## 3. Autentikasi

1. **Access token JWT** — TTL 15 menit, alg `EdDSA` atau `RS256` (bukan `none`/`HS256` bersama), klaim wajib: `sub`, `tid`, `role`, `branch_id`, `iat`, `exp`, `jti`, `iss`, `aud`.
2. **Refresh token** — TTL 7 hari, disimpan sebagai hash (SHA-256 + pepper) di database, dikirim hanya via `HttpOnly; Secure; SameSite=Strict` cookie, path terbatas pada prefix `/api/v1/auth` agar refresh dan logout dapat mencabut family.
3. **Rotasi & reuse detection** — setiap refresh menerbitkan token baru dan mencabut yang lama; reuse token lama memicu pencabutan seluruh family dan audit `SECURITY_EVENT`.
4. **Password** — Argon2id (memory ≥ 64 MB, iterations ≥ 3, parallelism 1) atau bcrypt cost ≥ 12; password minimal 12 karakter; cek terhadap daftar password bocor (opsional).
5. **MFA** — wajib untuk `COMPLIANCE_ADMIN` dan `FINANCE_MANAGER` di produksi; TOTP; recovery code sekali pakai. Pengguna yang sudah enrollment selalu wajib menyertakan kode saat login, terlepas dari flag `MFA_ENFORCED`. Flag tersebut menolak login peran privileged yang belum enrollment.
6. **Login throttling** — 10 percobaan/menit/IP + 5 percobaan/menit/akun; lockout sementara dengan exponential backoff.
7. **Session revocation** — logout mencabut refresh family; perubahan role/tenant mencabut semua sesi pengguna.

## 4. Otorisasi

### 4.1 RBAC + Scope

| Peran | Scope data | Aksi sensitif |
| --- | --- | --- |
| `CLAIMS_OFFICER` | cabang sendiri | buat/revisi klaim; tidak boleh approve |
| `HR_SPECIALIST` | tenant | kelola personel, batch payroll; tidak boleh cairkan |
| `BRANCH_MANAGER` | cabang sendiri | approve Level 1 sesuai batas; tidak boleh approve klaim sendiri |
| `FINANCE_MANAGER` | tenant | approve Level 2, cairkan batch; tidak boleh approve buatannya sendiri |
| `MIS_ANALYST` | tenant (read-only) | baca dashboard, jalankan simulasi; tidak boleh mutasi |
| `COMPLIANCE_ADMIN` | tenant | kelola role, publish policy, baca audit; tidak boleh approve transaksi |

### 4.2 Aturan penegakan

- Otorisasi dicek di **setiap** endpoint, bukan hanya di UI.
- `tenant_id` dan `branch_id` diambil dari token, bukan dari body/query.
- Approver harus berada di cabang yang sama untuk Level 1; Level 2 dapat lintas cabang dalam tenant.
- `approver_id !== created_by` untuk klaim dan batch payroll.
- Perubahan role hanya oleh `COMPLIANCE_ADMIN`, dengan audit before/after.
- Publish policy memerlukan dual control: `approved_by` (checker kedua) harus berbeda dari `published_by`; publish tanpa checker ditolak.
- Deny by default; endpoint baru wajib mendeklarasikan permission.

## 5. Isolasi Tenant & RLS

1. Setiap tabel tenant-scoped memiliki `tenant_id UUID NOT NULL`.
2. Unique constraint menyertakan `tenant_id`, misalnya `(tenant_id, email)`, `(tenant_id, claim_number)`, `(tenant_id, batch_code)`.
3. RLS aktif di semua tabel tenant-scoped:
   ```sql
   CREATE POLICY tenant_isolation ON claims.submissions
     USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
     WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
   ```
4. Service menetapkan `SET LOCAL app.tenant_id = $1` di awal transaksi; koneksi pool di-reset setelah transaksi.
5. Role database: `aletheia_app` (DML terbatas), `aletheia_readonly` (analytics), `aletheia_migrator` (DDL). Tidak ada role superuser untuk aplikasi.
6. Uji wajib: tenant A tidak bisa membaca/menulis data tenant B meski memiliki UUID yang valid; hasilnya 404/403 tanpa bocoran keberadaan data.
7. GraphQL BFF dan worker wajib meneruskan tenant dari token/event, bukan dari input pengguna.

## 6. Keamanan Edge Gateway

- Verifikasi JWT: signature, `exp`, `nbf`, `iss`, `aud`, `jti` revocation (Redis denylist untuk token yang dicabut).
- Inject header: `X-User-Id`, `X-User-Role`, `X-Branch-Id`, `X-Tenant-Id`, `X-Correlation-Id`, `X-Gateway-Timestamp`, `X-Request-Method`, `X-Request-Path`, `X-Body-Sha256`, `X-Gateway-Signature`.
- Signature: `HMAC-SHA256(method + ":" + path + ":" + bodySha256 + ":" + userId + ":" + role + ":" + branchId + ":" + tenantId + ":" + timestamp, INTERNAL_GATEWAY_SECRET)`.
- Service menolak jika signature invalid atau selisih timestamp > 30 detik; secret dirotasi berkala dengan masa transisi.
- Rate limit sliding window per IP/user/endpoint; 429 dengan `Retry-After`.
- CORS allowlist domain web; tidak ada `*` untuk endpoint ber-credential.
- Security headers: HSTS, CSP (tanpa `unsafe-inline` untuk script), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `frame-ancestors 'none'`.
- Body limit 1 MB; timeout 5 detik baca / 8 detik mutasi.
- Tolak request dengan `Content-Type` tidak sesuai; validasi JSON depth dan ukuran.

## 7. Validasi Input & Output

- Semua input divalidasi Zod di edge/service; tolak field tak dikenal (strict object).
- Query parameter divalidasi terhadap allowlist filter/sort; tidak ada SQL string interpolation.
- Gunakan parameterized query / Drizzle query builder; dilarang `sql.raw` dengan input pengguna.
- Output selalu melalui serializer; jangan pernah mengembalikan row database mentah.
- Error produksi: envelope standar + `correlation_id`; tanpa stack trace, SQL, nama tabel internal, atau PII.
- GraphQL: depth limit 4, complexity limit, disable introspection di produksi, persisted queries opsional.
- File name/path user tidak pernah dipakai langsung untuk path filesystem.

## 8. Keamanan Unggah Dokumen

1. Browser meminta signature ke `claims-service`; signature berisi `folder`, `timestamp`, `upload_preset`, `allowed_formats`, `max_file_size`.
2. Batas: 5 MB, `PDF/JPG/PNG/WEBP`; validasi MIME dan ekstensi; tolak SVG/HTML/executable.
3. Cloudinary `public_id` tidak boleh menebak isi; delivery memakai signed URL dengan TTL pendek untuk peran berwenang.
4. Simpan metadata (public_id, mime, size, hash) di `claims.documents`; jangan simpan binary di DB.
5. Scan malware (opsional; clamd/Cloudinary add-on) sebelum dokumen dapat diakses approver.
6. Audit setiap akses dokumen: siapa, kapan, untuk klaim mana.
7. Jangan pernah menerima upload biner melalui Express (`multer` dilarang).

## 9. PII & Data Sensitif

| Data | Penyimpanan | Tampilan | Logging |
| --- | --- | --- | --- |
| NIK | `nik_hash` (SHA-256 + pepper) + `nik_masked` | masked | dilarang |
| Rekening bank | `bank_account_hash` + `bank_account_masked` | masked | dilarang |
| Nama | plaintext (perlu operasional) | lengkap sesuai peran | boleh, hati-hati |
| Dokumen | Cloudinary + metadata | signed URL | hanya metadata |
| Password | Argon2id hash | tidak pernah | dilarang |
| Token | hash di DB; access di memori | tidak pernah | dilarang |

- Pepper disimpan di secret manager, bukan DB; rotasi pepper memerlukan re-hash bertahap.
- Retensi: dokumen klaim 7 tahun (kebijakan), audit 7 tahun, log operasional 90 hari, trace 30 hari.
- Penghapusan/anonimisasi hanya untuk data non-audit; audit trail tetap immutabel.
- Ekspor laporan tidak boleh memuat NIK/rekening penuh; gunakan masked atau hash.
- Uji PII: grep log/trace/error untuk pola NIK 16 digit dan nomor rekening.

## 10. Integritas Audit Trail

1. `governance.audit_logs` bersifat append-only; role aplikasi hanya memiliki `EXECUTE` pada `governance.append_audit_log()` dan **tidak** memiliki `INSERT`/`UPDATE`/`DELETE` langsung.
2. Trigger `BEFORE UPDATE OR DELETE` melempar `SECURITY_VIOLATION`.
3. Hash chain per tenant: `record_hash = SHA256(canonical_json(row tanpa record_hash) + prev_record_hash)`; canonical JSON memakai RFC 8785.
4. Serialisasi penulisan dengan `pg_advisory_xact_lock(hashtext(tenant_id::text))` agar tidak ada fork chain.
5. `prev_record_hash` diambil dari baris terakhir tenant yang sama; baris pertama memakai genesis hash.
6. Verifikasi berkala (job) menghitung ulang chain dan menandai gap; hasilnya metrik `audit_chain_broken`.
7. Audit tidak boleh dihapus saat retensi; arsipkan ke storage terpisah dengan checksum.
8. Setiap keputusan finansial wajib menulis audit dalam transaksi yang sama; jika audit gagal, transaksi rollback.
9. `correlation_id` dan `policy_version_id` wajib ada untuk keputusan klaim/payroll.

## 11. Idempotensi & Konkurensi

- Header `Idempotency-Key` wajib untuk `POST /claims`, `POST /claims/:id/decide`, `POST /payroll/batches`, `POST /payroll/batches/:id/disburse`, `POST /payments/*`.
- Redis: `SET aletheia:idem:<tenant>:<user>:<method>:<path>:<key> "IN_PROGRESS" NX EX 86400`; simpan respons sukses 24 jam.
- PostgreSQL: unique constraint pada `(tenant_id, idempotency_key)`; simpan respons/atau status.
- Approval: `SELECT ... FOR UPDATE NOWAIT`; 409 `ERR_CONCURRENT_LOCK`.
- Disbursement: payment intent per service (`claims.disbursements`, `payroll.payments`); partial unique `(tenant_id, entity_id) WHERE status IN ('PENDING','PROCESSING','PAID')`; conditional transition; **no** `ON CONFLICT DO NOTHING` untuk payment.
- Retry QStash: idempotent handler; event ID deduplikasi di Redis/DB; DLQ setelah 3 percobaan.

## 12. Manajemen Rahasia

- Tidak ada secret di repo, Dockerfile, compose, atau source.
- `.env.example` hanya nama variabel.
- Produksi: GitHub Actions secrets/OIDC, Koyeb/Render secret, Cloudflare secret, Neon connection string terenkripsi.
- Rotasi: JWT signing key 90 hari (dengan `kid`), gateway secret 90 hari, DB credential 180 hari, Cloudinary 180 hari.
- Akses secret minimal; tidak ada logging nilai secret; audit akses secret di platform.
- Backup secret di password manager tim, bukan di repo.

## 13. Supply Chain & CI Security

- Lockfile wajib; `pnpm install --frozen-lockfile`.
- Dependabot/Renovate untuk update; review perubahan major.
- `gitleaks` pada setiap PR; `trivy` pada image; `semgrep` untuk SAST; `pnpm audit`/`govulncheck`.
- GitHub Actions dipin ke SHA; permission workflow minimal (`contents: read`, `id-token: write` hanya untuk deploy).
- Image non-root, read-only root filesystem bila memungkinkan, tanpa shell di image Go.
- SBOM (Syft) dan provenance (SLSA) opsional; simpan artefak.
- Jangan pernah menjalankan skrip dari PR fork dengan secrets.

## 14. Pemetaan OWASP ASVS L2 (Ringkas)

| Kategori | Kontrol Aletheia |
| --- | --- |
| V1 Architecture | trust boundary, microservice, edge verification, docs |
| V2 Authentication | Argon2id, JWT rotation, MFA admin, lockout |
| V3 Session | refresh HttpOnly, revocation, idle timeout |
| V4 Access Control | RBAC, tenant/branch scope, SoD, deny by default |
| V5 Validation | Zod, strict schema, parameterized SQL, output encoding |
| V6 Cryptography | TLS, HMAC, SHA-256, Argon2id, key rotation |
| V7 Error/Logging | envelope, correlation ID, PII redaction, no stack trace |
| V8 Data Protection | hashing, masking, retention, signed URLs |
| V9 Communication | TLS internal, signature, timestamp |
| V10 Malicious Code | signed uploads, MIME allowlist, dependency scan |
| V11 Business Logic | idempotency, state machine, limits, anti-automation |
| V12 Files | Cloudinary signed, size/type limits, no backend upload |
| V13 API | rate limit, schema validation, GraphQL depth, REST idempotency |
| V14 Config | secrets, headers, CORS, environment separation |

## 15. Kepatuhan & Tata Kelola

- **UU PDP (Indonesia):** dasar pemrosesan, minimalisasi data, hak subjek, retensi, breach notification (≤ 3×24 jam), DPO/ kontak.
- **ISO 27001 (alignment):** asset inventory, access control, incident management, business continuity, supplier management, audit log.
- **Kontrol mirip SOX:** pemisahan tugas, approval berjenjang, audit trail immutabel, review akses berkala, change management.
- **Kebijakan retensi:** dokumen 7 tahun, audit 7 tahun, log 90 hari, trace 30 hari; arsip terenkripsi.
- **Review akses:** kuartalan untuk role sensitif; otomatis mencabut akses tidak aktif 90 hari.
- **Incident response:** klasifikasi severity, owner, komunikasi, post-mortem tanpa menyalahkan, action item.

## 16. Insiden & Runbook Keamanan

| Insiden | Deteksi | Tindakan |
| --- | --- | --- |
| Token dicuri | anomali geolokasi/IP, reuse refresh | cabut family, paksa re-login, audit |
| Cross-tenant leak | test RLS, alert 403/404 anomali | blokir endpoint, investigasi, notifikasi |
| Audit chain broken | job verifikasi | hentikan write, restore dari backup, investigasi |
| Double payment | rekonsiliasi payment | hentikan batch, reversal, audit, laporan |
| Secret bocor | gitleaks/alert | rotasi segera, revoke, audit akses |
| Malware upload | scan alert | quarantine, hapus akses, investigasi |
| DDoS/brute force | rate limit alert | aktifkan challenge/WAF, blokir IP, komunikasi |

## 17. Gerbang Keamanan Rilis

- [x] Tidak ada secret di repo/log.
- [x] Semua endpoint memiliki cek auth + role + tenant/branch.
- [x] RLS aktif dan diuji lintas tenant.
- [x] SoD diuji (I-01) dan race approval (I-02).
- [x] Idempotensi diuji (I-03) dan replay aman.
- [x] Audit immutabel diuji (I-04).
- [x] PII masking di respons/log/trace/ekspor.
- [x] Rate limit dan header keamanan aktif.
- [x] Dependency/image scan tanpa CRITICAL.
- [x] Tidak ada stack trace/SQL di error produksi.
- [x] Runbook insiden diperbarui.

> **Status M5.1:** seluruh item checklist di atas lulus pada 26 November 2026. Bukti ada di `docs/evidence/m5.1-verification.md`. Pengecualian deployment: service demo masih memakai role pemilik database; pengikatan sesi tenant pada pool service wajib diselesaikan sebelum production.

## 18. Batasan Keras Keamanan untuk Agen

> 1. Dilarang melemahkan RLS, SoD, atau idempotensi demi demo.
> 2. Dilarang menyimpan token di localStorage atau menonaktifkan `HttpOnly`.
> 3. Dilarang menambahkan endpoint tanpa deklarasi permission dan audit.
> 4. Dilarang menulis PII mentah ke log, trace, metric label, atau pesan error.
> 5. Dilarang memakai `service_role`/superuser untuk aplikasi.
> 6. Dilarang mengizinkan upload biner melalui Express.
> 7. Dilarang menonaktifkan signature gateway atau memperpanjang timestamp window > 30 detik.
> 8. Dilarang mengklaim aman tanpa menjalankan probe di Bagian 16 dan gerbang di Bagian 17.
