# Production Deploy — M6.3–M6.6 dan Desain Fase 1–4

> **Catatan:** dokumen ini merekam deploy `5d231c1` pada 27 November 2026. Deploy UI Phase 5 berikutnya ada di [`ui-phase5-verification.md`](ui-phase5-verification.md) (commit `04962c3`).

- **Tanggal:** 27 November 2026, 06:23–06:30 WIB.
- **Commit:** `5d231c1` (`feat(web): refine MIS and audit with motion polish`).
- **Status:** Freeze deploy dicabut. Seluruh service live dan smoke production 15/15 lulus.
- **Data:** sintetis; payment provider `MOCK`.

## 1. Database

| Langkah | Hasil |
| --- | --- |
| Snapshot pra-deploy | Neon snapshot `snap-divine-hill-biu84g87`, berlaku sampai 4 Desember 2026 |
| Migrasi production | 18 migrasi, termasuk `0012`–`0017` |
| `pnpm db:check` | 31/31 tabel, 31 RLS policy, 0 kebocoran tenant |
| `pnpm security:db` | 41/41 check lulus |
| Tenant plan | SAU `HRIS_PRO`, BPUI `BASIC` |

Catatan: migrasi `0016` sengaja menurunkan tenant yang masih memakai default lama ke `BASIC`. Setelah migrasi, SAU dikembalikan ke `HRIS_PRO` secara eksplisit dan diverifikasi lewat badge paket di web production.

## 2. Render

| Service | Deploy ID | Status | Commit |
| --- | --- | --- | --- |
| Governance | `dep-dc4bu356e07s73ep91r0` | live | `5d231c1` |
| Claims | `dep-dc4bua56e07s73ep9irg` | live | `5d231c1` |
| Payroll | `dep-dc4buad6e07s73ep9jd0` | live | `5d231c1` |
| Worker | `dep-dc4bual6e07s73ep9kh0` | live | `5d231c1` |

Health:

- Governance `https://aletheia-governance.onrender.com/healthz` → 200.
- Claims `https://aletheia-claims.onrender.com/healthz` → 200.
- Payroll `https://aletheia-payroll.onrender.com/healthz` → 200.
- Worker `https://aletheia-worker-zjnt.onrender.com/healthz` → 200.

## 3. Cloudflare

| Komponen | Versi | URL |
| --- | --- | --- |
| Edge Worker | `fdad3218-a6eb-4340-a7e7-687d3f6d4d75` | `https://aletheia-edge.ridwanafzn.workers.dev` |
| Pages | `0c8fc8af-7cc4-4b20-8e20-41e0bac819b3` | `https://aletheia-web-preview.pages.dev` |

Pages berjalan di environment **Production**, branch `main`, source commit `5d231c1`. Aset `index-DiaApVur.js` sama dengan build lokal terakhir.

Header production tetap aktif: CSP, HSTS, COOP, dan Permissions-Policy.

## 4. Verifikasi

```bash
pnpm warm:production
EDGE_URL="$(grep '^EDGE_URL=' .env.production.local | cut -d= -f2-)" \
  WEB_URL="https://aletheia-web-preview.pages.dev" pnpm smoke:production
pnpm async:production
```

Hasil:

| Pemeriksaan | Hasil |
| --- | --- |
| Warm semua service | 5/5 PASS |
| Smoke production | 15/15 PASS |
| Login enam peran | 6/6 PASS |
| Audit chain verify | valid |
| MIS GraphQL | 200 |
| Web CSP | 200 |
| Async QStash/worker | event diproses ~5 detik |
| Verifikasi visual production | MIS v2 tampil, KPI cards 4, paket `HRIS Pro` |

Bukti visual production: `docs/evidence/design-phase4/production-mis.png`.

## 5. Rollback

- Render: deploy sebelumnya per service masih tersedia; rollback lewat dashboard atau API Render.
- Cloudflare Pages: deployment sebelumnya `9a8cf3f8-a69d-4305-b34b-1839d68726d0` dapat dipromosikan kembali.
- Cloudflare Workers: version sebelumnya tersedia melalui `wrangler deployments list`.
- Neon: restore snapshot `snap-divine-hill-biu84g87` bila migrasi perlu dibatalkan.

## 6. Catatan

- Freeze deploy dicabut setelah persetujuan eksplisit pada 27 November 2026.
- `autoDeployTrigger` Render tetap `off`; deploy dilakukan manual dengan commit yang sudah di-push.
- Production Monitor tetap berjalan setiap 6 jam.
- Full E2E suite tetap tidak dijalankan ulang; verifikasi memakai smoke production, spec tertarget, axe, dan `pnpm verify` sebelum deploy.
