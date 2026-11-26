# `10-testing-and-quality-strategy.md` — Strategi Pengujian & Gerbang Mutu Aletheia

* **Status Dokumen:** Spesifikasi Pengujian (*Single Source of Truth* untuk Agen OpenCode)
* **Prinsip:** Bukti otomatis, bukan klaim; uji batas dan kegagalan, bukan hanya happy path; tidak ada rilis dengan BLOCKER terbuka.

## 1. Tujuan Mutu

1. Membuktikan invarian finansial: tidak ada pencairan ganda, tidak ada perubahan audit, tidak ada pelanggaran SoD.
2. Membuktikan isolasi tenant dan perlindungan PII.
3. Membuktikan perhitungan PPh 21/BPJS/komisi pada batas kebijakan.
4. Membuktikan performa dan ketahanan di bawah beban.
5. Menyediakan artefak yang bisa ditunjukkan ke perekrut: coverage, test report, load test, E2E video.

## 2. Piramida Pengujian

| Lapis | Porsi | Alat | Fokus |
| --- | --- | --- | --- |
| Unit | 50% | Vitest, `go test` | aturan domain, money, policy lookup |
| Property-based | 10% | fast-check, Go fuzz | aritmetika, bracket, rounding |
| Contract | 10% | Zod, OpenAPI, Pact opsional | schema request/response |
| Integration | 20% | Vitest + PostgreSQL/Redis nyata | transaksi, constraint, RLS, audit |
| E2E | 8% | Playwright | alur per peran |
| Load/race/security | 2% | k6, `-race`, probe | konkurensi, beban, kontrol |

**Aturan:** jangan mengganti integration test dengan mock DB untuk invarian (unique constraint, trigger, RLS, `FOR UPDATE`).

## 3. Tooling

| Kebutuhan | Alat |
| --- | --- |
| TS unit/integration | Vitest |
| React component | Vitest + React Testing Library |
| Property-based | fast-check |
| Go unit/race | `go test -race`, `testing`, `fuzz` |
| E2E | Playwright |
| API contract | Zod + OpenAPI validator |
| Load | k6 |
| Accessibility | axe-core / Playwright axe |
| Mutation (opsional) | Stryker |
| Coverage | `c8`/`vitest --coverage`, `go test -cover` |
| Test data | seed deterministik + factory |
| DB sementara | Testcontainers/Neon branch |

## 4. Unit & Property Test

### 4.1 Domain keuangan

- PPh 21 TER: setiap batas bracket untuk kategori A/B/C; tepat di `max_gross` dan `+0.01`.
- PTKP mapping: semua status `TK/0..K/3`.
- BPJS: plafon Kesehatan dan JP; gross di bawah/di atas cap.
- JHT: tanpa cap (kecuali policy berubah).
- Komisi agen: batas tier, tepat di max, +0.01, sales 0.
- Net pay: tidak negatif; gross 0; potongan > gross.
- Rounding: `RoundHalfUp` pada 0.005; konsistensi total vs item.
- Annual PPh 21: progressive bracket, PTKP, kredit TER, under/overpayment.
- Risk score: cap 100, ambang `>=`, kombinasi weights.
- Approval routing: L1/L2, `==` vs `>`, conflict flag.

### 4.2 Property-based

Properti yang diuji:
- Untuk gross ≥ 0, net = gross − BPJS − PPh 21 (dengan rounding yang sama).
- Untuk dua item, total = sum(item) tanpa drift.
- Untuk setiap bracket, tarif bersifat monoton/valid.
- Untuk setiap tier komisi, tidak ada gap/overlap.
- Untuk idempotency key yang sama, hasil selalu sama.

### 4.3 Contoh kerangka

```ts
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { calculatePph21Ter } from "../src/pph21";

describe("PPh 21 TER", () => {
  it("uses the first bracket where gross <= max_gross", () => {
    const policy = loadFixture("payroll-policy-v2026.11.01");
    expect(calculatePph21Ter("5400000.00", "TK/0", policy).rate).toBe("0.0000");
    expect(calculatePph21Ter("5400000.01", "TK/0", policy).rate).toBe("0.0025");
  });

  it("never produces a negative tax", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 10_000_000_000n }), (gross) => {
        const result = calculatePph21Ter(gross.toString(), "K/1", policy);
        expect(BigInt(result.tax)).toBeGreaterThanOrEqual(0n);
      }),
    );
  });
});
```

## 5. Contract Test

- Semua schema Zod berada di `packages/shared-contracts`; FE/BE/edge mengimpor schema yang sama.
- OpenAPI dihasilkan dari schema; CI memvalidasi contoh request/response.
- GraphQL SDL divalidasi terhadap resolver; query depth/complexity diuji.
- Perubahan schema yang breaking wajib versi baru + migration note.
- Test: payload valid diterima; field tak dikenal ditolak; tipe salah ditolak; enum di luar daftar ditolak.

## 6. Integration Test

Wajib memakai PostgreSQL nyata (Neon branch/Testcontainers) dan Redis nyata (atau emulator yang mendukung `SET NX`).

Skenario wajib:

| ID | Skenario | Ekspektasi |
| --- | --- | --- |
| I-01 | SoD: maker approve klaim sendiri | 403 `ERR_SOD_VIOLATION` |
| I-02 | 5 approval paralel | 1 × 200, 4 × 409 |
| I-03 | disburse dua kali dengan idempotency sama | 1 payment |
| I-04 | update/delete `audit_logs` | `SECURITY_VIOLATION` |
| I-05 | What-If +50% komisi | tidak mengubah `payroll.items`/`claims` |
| I-06 | tenant A baca/tulis tenant B | 404/403, tidak bocor |
| I-07 | publish policy baru | versi lama ARCHIVED atomik |
| I-08 | payslip vs item | total sama persis |
| I-09 | annual reconciliation | selisih diposting, bulanan tidak berubah |
| I-10 | export report | checksum file = checksum tersimpan |
| I-11 | cross-service header tanpa signature | 401 |
| I-12 | policy key hilang | 422 fail closed, bukan default 0 |
| I-13 | duplicate `(tenant_id, batch_id, personnel_id)` | ditolak constraint |
| I-14 | concurrent disbursement beda key | tetap 1 payment per item |
| I-15 | RLS tanpa `app.tenant_id` | 0 baris/error, bukan semua baris |
| I-16 | payroll approve oleh `created_by` | 403 `ERR_SOD_VIOLATION` |

## 7. E2E Playwright

Alur minimum:

1. Login setiap peran seed (6 akun).
2. Claims Officer membuat klaim + upload dokumen mock (signed URL).
3. Branch Manager approve Level 1; Finance Manager approve eskalasi.
4. SoD: maker tidak melihat tombol approve; direct API ditolak.
5. HR membuat batch payroll, kalkulasi, melihat breakdown.
6. Finance approve dan disburse. Payslip menyusul pada TASK-11.
7. HR generate laporan PPh 21/BPJS; unduh; checksum terlihat.
8. MIS Analyst melihat KPI, menjalankan What-If, melihat variance.
9. Compliance publish policy baru; klaim lama tetap memakai versi lama.
10. Audit explorer memverifikasi hash chain.

> **Status M5.3:** 21 test Playwright lulus dua run berturut-turut. Alur login enam peran, klaim sampai pencairan, eskalasi level 2, SoD, payroll create/calculate/approve/disburse, MIS, audit, keyboard, dan axe berjalan. Test payroll memakai worker lokal secara langsung karena QStash tidak aktif. UI payslip dan laporan belum tersedia; API-nya diverifikasi di M3.4.

Aturan:
- Gunakan seed data deterministik; jangan bergantung pada urutan test lain.
- Setiap test membuat data sendiri (factory) dan membersihkannya.
- Screenshot/video hanya untuk kegagalan; simpan artifact CI.
- Uji minimal satu alur di viewport mobile.

## 8. Race & Concurrency

- `go test -race -v ./...` wajib untuk setiap perubahan worker.
- Test 5 approval paralel (I-02), 2 disbursement paralel (I-14), retry QStash (I-03).
- Gunakan barrier/latch untuk memastikan request benar-benar bersamaan.
- Verifikasi tidak ada deadlock; timeout test < 30 detik.
- Uji `FOR UPDATE NOWAIT` menghasilkan 409, bukan menunggu.

## 9. Load & Performance Test

Mengacu `docs/09-observability-and-performance.md`:

- Smoke, claims-read, claim-submit, approval-race, payroll-batch, mis-dashboard, payment-retry.
- Threshold wajib; hasil disimpan di `docs/evidence/load/`.
- Analisis: p50/p95/p99, error rate, DB pool, Redis, queue.
- Jika gagal: identifikasi bottleneck, perbaiki, ulangi; jangan menurunkan threshold tanpa ADR.

## 10. Security Test

- Replay idempotency (same/different key).
- Forged `X-User-*` tanpa signature.
- Expired/tampered JWT; refresh reuse.
- Cross-tenant dan cross-branch.
- SQL injection pada filter/sort; mass assignment.
- Upload tipe/ukuran salah; akses dokumen tanpa izin.
- Audit tamper.
- PII leakage di log/error/trace.
- Rate limit: 429 + `Retry-After`.
- Dependency/image scan: tidak ada CRITICAL.

## 11. Accessibility Test

- axe pada layar kritis: login, claims, approval, payroll, payslip, reports, MIS, policy/audit.
- Keyboard-only: navigasi tabel, dialog, form, upload.
- Screen reader dasar: label, error, status.
- Kontras warna; status tidak hanya warna.
- `prefers-reduced-motion`.
- Target: 0 pelanggaran serius/kritis.

## 12. Test Data & Seed

- Seed idempoten (`pnpm db:seed`) dengan tenant demo, 3 cabang, 6 akun peran, 2 policy version, personel, batch, klaim.
- Data PII sintetis; jangan pernah data nyata.
- Factory untuk unit/integration; seed untuk E2E/demo.
- Reset database test sebelum suite; gunakan transaksi rollback bila memungkinkan.
- Seed harus bisa dijalankan berulang tanpa duplikasi.

## 13. CI Gates

| Gate | Perintah | Syarat |
| --- | --- | --- |
| Typecheck | `pnpm -r typecheck` | 0 error |
| Lint | `pnpm -r lint`, `golangci-lint run` | 0 error kritis |
| Unit | `pnpm -r test`, `go test ./...` | 100% lulus |
| Race | `go test -race ./...` | 0 race |
| Integration | `pnpm test:integration` | 100% lulus |
| Contract | `pnpm test:contract` | 100% lulus |
| E2E | `pnpm test:e2e` | 100% lulus (smoke) |
| Coverage | `pnpm test:coverage` | domain ≥ 90%; hasil M5.3 96,26% lines, 96,33% statements, 99,08% functions, 89,92% branches |
| Security | gitleaks, trivy, semgrep, audit | 0 CRITICAL, 0 secret |
| Load smoke | `k6 run tests/load/smoke.js` | threshold lulus |
| A11y | `pnpm test:a11y` | 0 serius/kritis |

## 14. Flaky Test Policy

- Test flaky dilarang di-merge; perbaiki atau karantina dengan issue dan owner.
- Gunakan waktu deterministik (fake timers), bukan `sleep`.
- Isolasi data per test; jangan bergantung pada urutan.
- Retry maksimal 1× hanya untuk E2E jaringan; catat retry.
- M5.3 menjalankan suite penuh dua kali tanpa retry dan tanpa flaky. E2E memakai `workers: 1` karena database dan akun seed dipakai bersama.
- Test yang di-skip wajib alasan + issue + tanggal expire.

## 15. Definition of Done

Sebuah task selesai jika:

- [ ] Kode + test + dokumentasi diperbarui.
- [ ] Semua gate CI lulus.
- [ ] Test baru mencakup batas dan kegagalan, bukan hanya happy path.
- [ ] Tidak ada BLOCKER dari security/finance reviewer.
- [ ] Bukti disimpan (test report, screenshot, load result).
- [ ] Job-targeting matrix diperbarui.
- [ ] Tidak ada `TODO` tanpa issue.

## 16. Traceability ke Lowongan

| Kebutuhan lowongan | Test/artefak |
| --- | --- |
| PPh 21 & BPJS | U-01..U-07, U-15, laporan PPh 21/BPJS |
| RBAC/approval/audit | I-01, I-02, I-04, E2E approval |
| Anti-duplikasi | I-03, I-13, I-14 |
| PostgreSQL advanced | query plan evidence, integration test |
| Docker/CI/CD | pipeline green, image scan |
| Performance/scalability | k6 results, SLO dashboard |
| Clean code/review | lint, coverage, ADR, PR template |
| Testing | coverage report, E2E video, race report |

## 17. Batasan Keras Pengujian

> 1. Dilarang menghapus/menurunkan assertion agar test lulus.
> 2. Dilarang memakai mock DB untuk invarian constraint/trigger/RLS.
> 3. Dilarang memakai data produksi/PII nyata di test.
> 4. Dilarang merge dengan test flaky atau coverage domain < 90%.
> 5. Dilarang mengklaim gate lulus tanpa output perintah.
> 6. Dilarang menonaktifkan `-race` untuk worker Go.
