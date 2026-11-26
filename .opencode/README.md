# `.opencode` — Agents & Skills Aletheia

Folder ini berisi konfigurasi OpenCode untuk proyek Aletheia. Tidak ada kode produk di sini.

## Agent

| Agent | Mode | Kapan dipakai |
| --- | --- | --- |
| `aletheia-lead` | primary | Orkestrasi task, scope, delegasi, verifikasi gate |
| `architect` | subagent | Review arsitektur, ADR, deteksi drift kontrak |
| `database-engineer` | subagent | Skema, migrasi, index, RLS, query plan |
| `backend-engineer` | subagent | Express.js TS & Go worker |
| `frontend-engineer` | subagent | React 19 + TS + Vite, UX/design |
| `security-auditor` | subagent | Audit auth, tenant, PII, SoD, audit trail (read-only) |
| `qa-engineer` | subagent | Unit, property, integration, E2E, race, load |
| `finance-reviewer` | subagent | Review payroll, PPh 21, BPJS, payslip, disbursement (read-only) |
| `devops-engineer` | subagent | Docker, CI/CD, observability, deployment |

## Skill

| Skill | Lokasi | Kapan dipakai |
| --- | --- | --- |
| `aletheia-finance` | `.opencode/skills/aletheia-finance` | Payroll, PPh 21, BPJS, komisi, payslip, laporan, payment |
| `impeccable` | `.agents/skills/impeccable` | Desain, kritik, polish, audit UI |
| `superpowers` | `.agents/skills/` (15 skill) | Brainstorming, TDD, systematic debugging, planning, code review, verification |
| `karpathy-guidelines` | `.agents/skills/karpathy-guidelines` | Disiplin coding: asumsi eksplisit, perubahan surgical, kriteria sukses terverifikasi |
| `payroll-prep` | `.agents/skills/payroll-prep` | Referensi alur payroll (US/Gusto; bukan aturan Indonesia) |
| `plan-payroll` | `.agents/skills/plan-payroll` | Referensi perencanaan payroll + cash flow |
| `cash-flow-snapshot` | `.agents/skills/cash-flow-snapshot` | Referensi forecast cash flow |
| `invoice-chase` | `.agents/skills/invoice-chase` | Referensi penagihan invoice |

## Cara memakai

1. Pilih agent `aletheia-lead` untuk sesi utama.
2. Minta delegasi eksplisit, misalnya:
   ```text
   Gunakan database-engineer untuk membuat migrasi TASK-03, lalu finance-reviewer untuk mengaudit hasilnya.
   ```
3. Muat skill secara eksplisit jika perlu:
   ```text
   Muat skill aletheia-finance dan audit docs/11.
   ```
4. Untuk pekerjaan UI:
   ```text
   Gunakan frontend-engineer dan skill impeccable untuk mendesain ulang layar Approval Queue.
   ```

## Aturan

- Fase 0 selesai; **jangan** menjalankan `TASK-01` tanpa persetujuan pengguna.
- Dokumen `docs/` adalah source of truth; kontrak berubah → update dokumen + ADR.
- Reviewer (`architect`, `security-auditor`, `finance-reviewer`) tidak boleh mengedit kode.
- Semua klaim selesai harus punya bukti verifikasi.
- Jangan menaruh secret di agent, skill, atau config.
