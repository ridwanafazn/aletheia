# UI Phase 5 — Final Polish & Production Cutover

- **Tanggal:** 27 November 2026.
- **Commit production:** `04962c3` (`fix(web): unblock inline fonts and polish sidebar scroll`).
- **Status:** selesai. Production live, smoke **15/15**, async QStash/worker ~5 detik, dan production UI check 0 console error.
- **Data:** sintetis; payment provider `MOCK`.

## 1. Scope

Phase 5 adalah fase penutup UI. Fokusnya bukan menambah layar baru, tetapi menyelesaikan dua masalah yang terlihat saat demo dan membawa seluruh UI ke production:

1. Menu sidebar terpotong untuk peran dengan daftar menu panjang (`FINANCE_MANAGER`, `COMPLIANCE_ADMIN`).
2. Font bundel diblokir CSP production, sehingga browser mencatat error dan memakai fallback font.
3. Cutover production dari commit final, termasuk Render, edge Worker, dan Cloudflare Pages.

UI Phase 3 (form clarity, validasi inline, sticky action, penjelasan SoD) dan Phase 4 (mobile table-to-card) tetap **ditunda** dan tercatat sebagai backlog. Keduanya bukan bagian dari cutover ini.

## 2. Sidebar scroll

Perubahan:

- `.nav` menjadi area scroll mandiri dengan `flex: 1`, `min-height: 0`, `overflow-y: auto`, dan scrollbar tipis.
- `.sidebar__footer` memakai `flex: none`, sehingga blok akun, tombol Keluar, dan catatan demo selalu terlihat.
- `.nav` mendapat fade 18px di tepi bawah dan spacer 18px, sehingga label terakhir tidak tertutup fade saat scroll mencapai akhir.
- Brand dan workspace switcher tidak ikut menyusut.

Verifikasi production pada viewport **1280×720**:

| Peran | Nav | Footer bottom | Item terakhir |
| --- | --- | --- | --- |
| Manajer Keuangan | 733px konten di 401px | 676px | 547px |
| Administrator Kepatuhan | 653px konten di 401px | 676px | 547px |

Item terakhir berada di atas tepi nav (567px), footer tetap di dalam viewport 720px, dan tidak ada item yang tidak dapat dijangkau.

Playwright lokal menambahkan test `long role sidebars scroll while the account footer stays visible` untuk dua peran tersebut, termasuk axe.

## 3. CSP font

Bundel Vite menginline subset Plus Jakarta Sans sebagai `data:font/woff2`. CSP production sebelumnya hanya mengizinkan `font-src 'self'`, sehingga browser memblokir font dan mencatat error.

Perbaikan di `apps/web/public/_headers`:

```text
font-src 'self' data:
```

Setelah deploy, production UI check mencatat **0 console/page error** dan font tampil dari bundel.

## 4. Production deployment

| Komponen | ID / versi | Commit | URL |
| --- | --- | --- | --- |
| Cloudflare Pages | `5400735c-8b21-42cb-aab5-717510533df8` | `04962c3` | https://aletheia-web-preview.pages.dev |
| Cloudflare Workers edge | `5cb41084-dc66-444f-8c52-7730c264e4fc` | edge code unchanged | https://aletheia-edge.ridwanafzn.workers.dev |
| Governance | `dep-dc4igic9v7es73f3ns9g` | `04962c3` | https://aletheia-governance.onrender.com |
| Claims | `dep-dc4igimq1p3s73e5ipd0` | `04962c3` | https://aletheia-claims.onrender.com |
| Payroll | `dep-dc4igip7lnhs738k0um0` | `04962c3` | https://aletheia-payroll.onrender.com |
| Worker | `dep-dc4igj7f3r2c73bgoubg` | `04962c3` | https://aletheia-worker-zjnt.onrender.com |

Aset web production:

- `assets/index-DfEMeRU1.js`
- `assets/index-DhZWYi4G.css`

Tidak ada migrasi database pada cutover ini. Neon tetap memakai skema dan seed yang sudah live.

## 5. Verifikasi

| Gate | Hasil |
| --- | --- |
| `pnpm verify` | Lulus |
| Full Playwright E2E | **49 passed, 2 skipped** |
| `phase2.spec.ts` | 2 passed; enam role home + sidebar panjang, axe 0 serious/critical |
| Build web | **152.3 KB gzip** |
| Warm production | 4/5 pada percobaan pertama karena DNS transien `aletheia-claims`; smoke berikutnya lulus penuh |
| Smoke production | **15/15** |
| Login enam peran operasional | 6/6 |
| Audit chain | `valid=true` |
| MIS GraphQL | 200 |
| Web CSP | 200; `font-src 'self' data:` |
| Async QStash/worker | event `38fc1298-3e1b-48fb-976c-164f4d5d3938`, diproses ~5 detik |
| Production UI check | 0 console error; sidebar scroll dan footer terverifikasi |
| CI | `45954282337` hijau |
| Security | `45954282286` hijau |

Bukti visual:

- `docs/evidence/ui-phase5/finance-manager-sidebar.png`
- `docs/evidence/ui-phase5/finance-manager-sidebar-scrolled.png`
- `docs/evidence/ui-phase5/compliance-sidebar.png`
- `docs/evidence/ui-phase5/compliance-sidebar-scrolled.png`
- `docs/evidence/ui-phase2/compliance-sidebar.png` (verifikasi lokal)

## 6. Rollback

| Komponen | Target |
| --- | --- |
| Pages | Deployment `1905cb27-8dfa-473f-a3f4-dddd146d45ad` |
| Edge | Version `fdad3218-a6eb-4340-a7e7-687d3f6d4d75` |
| Governance | Deploy `dep-dc4i5cuq1p3s73e4djig` |
| Claims | Deploy `dep-dc4i5d3l550s739dpuq0` |
| Payroll | Deploy `dep-dc4i5d8u01pc73f875q0` |
| Worker | Deploy `dep-dc4i5dmq1p3s73e4dlng` |

## 7. Batasan

- Phase 3–4 belum dikerjakan; form dan tabel mobile memakai pola yang sudah ada.
- Sidebar tetap memerlukan scroll pada viewport pendek; fade dan scrollbar adalah affordance, bukan solusi tanpa scroll.
- M6.2 monitoring sign-off masih menunggu 3 run terjadwal berikutnya.
- Render free tier tetap memiliki cold start; jalankan `pnpm warm:production` sebelum demo.
