# DESIGN.md — Aletheia Design System

**Direction:** *Quiet ledger.* A financial operations surface that feels warm, exact, and trustworthy. Warm paper surfaces, jade action, amber caution, and generous rhythm. Dense where operators need density, spacious where they need to decide. No decorative gradients, no glassmorphism, no playful illustration in operational screens.

**Mode:** Operate (primary), Read (reports), Persuade (login/marketing only). Ambition shows as precision and restraint.

## 1. Brand

- **Name:** Aletheia
- **Mark:** a simple square ledger glyph or the letter A in a 1.5px stroke; monochrome, no gradient.
- **Tagline:** *Governed money movement, with evidence.*
- **Personality:** exact, composed, auditable, humane.
- **Avoid:** crypto/fintech neon, robot imagery, stock photos of handshakes, excessive iconography.

## 2. Color Tokens

### Core

| Token | Hex | Use |
| --- | --- | --- |
| `--ink-900` | `#17211F` | primary text, headings |
| `--ink-700` | `#34433F` | body text |
| `--ink-500` | `#5F6C67` | secondary text, metadata |
| `--ink-300` | `#A7B0AA` | disabled text, dividers strong |
| `--surface-0` | `#FFFDF8` | cards, tables, dialogs |
| `--surface-50` | `#F5F2EA` | app background |
| `--surface-100` | `#EFEAE0` | sunken areas, table header |
| `--border-200` | `#E3DCCF` | default border |
| `--border-300` | `#CFC6B6` | strong border, focus-adjacent |

### Action

| Token | Hex | Use |
| --- | --- | --- |
| `--primary-700` | `#0F6B5C` | primary button, active nav |
| `--primary-800` | `#0A5548` | hover/pressed |
| `--primary-50` | `#E6F2ED` | selected row, subtle background |
| `--focus-ring` | `#0F6B5C` | focus outline (2px, offset 2px) |

### Status

| Token | Hex | Background | Use |
| --- | --- | --- | --- |
| `--success-700` | `#0F6B5C` | `#E7F3ED` | approved, paid, valid |
| `--warning-700` | `#8F5511` | `#FBF1DF` | review, escalated, pending |
| `--danger-700` | `#A8323E` | `#FBEAEA` | rejected, failed, conflict |
| `--info-700` | `#2C5C7A` | `#EAF2F7` | informational, draft |
| `--neutral-700` | `#475569` | `#F1F5F9` | draft, archived, inactive |

**Rule:** status is never color-only. Always pair with text and/or icon.

### Data visualization

`#0F6B5C`, `#2C5C7A`, `#8F5511`, `#A8323E`, `#6D28D9`, `#475569`, `#0891B2`, `#65A30D`.

- Use at most 5 series per chart.
- Direct-label series; avoid legend-only.
- Gridlines subtle (`#E2E8F0`), no 3D, no drop shadows.
- Negative variance in `--danger-700`; positive in `--success-700`; neutral in `--ink-500`.

## 3. Typography

- **Family:** `"Plus Jakarta Sans Variable", "Plus Jakarta Sans", "Segoe UI", system-ui, -apple-system, sans-serif`.
- **Mono:** `"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`.
- **Numeric:** `font-variant-numeric: tabular-nums lining-nums;` untuk semua nominal uang, hitungan, dan tanggal.
- **Loading:** self-host WOFF2 di `apps/web/public/fonts` dengan `font-display: swap`. Jangan memakai lebih dari satu keluarga sans untuk antarmuka.

| Style | Size / line-height | Weight | Use |
| --- | --- | --- | --- |
| Display | 32 / 40 | 600 | login/empty hero only |
| H1 | 28 / 36 | 600 | page title |
| H2 | 20 / 28 | 600 | section |
| H3 | 16 / 24 | 600 | card title |
| Body | 14 / 21 | 400 | default |
| Body strong | 14 / 21 | 600 | labels, emphasis |
| Small | 12 / 16 | 400 | metadata, helper |
| Micro | 10 / 14 | 600 | badges, table captions |

**Rules:** max 3 weights per screen; no all-caps except micro labels with letter-spacing 0.04em; numbers right-aligned in tables.

## 4. Spacing & Layout

- Base unit 4px. Scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.
- App shell: sidebar 240px (collapsible 64px), topbar 56px, content padding 24px (16px mobile).
- Content max-width 1440px; tables can go full width.
- Grid: 12 columns, 24px gutter; forms use 2 columns on ≥ 1024px, 1 column below.
- Card padding: 20px; table cell: 12px 16px; compact mode: 8px 12px.
- Page header: title + description + primary action on the right; breadcrumb above.

## 5. Radius, Border, Elevation

- Radius: 6px controls, 8px cards/dialogs, 4px badges, 999px only avatars/status dots.
- Border: 1px `--border-200`; no double borders.
- Shadow: `0 1px 2px rgba(15,23,42,.06)` for cards; `0 4px 12px rgba(15,23,42,.08)` for dialogs/drawers.
- No glow, no inner shadow, no gradient borders.

## 6. Components

### Buttons
- Height 36px (default), 32px compact, 40px large.
- Primary: solid `--primary-700`, white text; hover `--primary-800`.
- Secondary: white, 1px border, ink text.
- Ghost: transparent, hover `--surface-100`.
- Destructive: solid `--danger-700` only for irreversible actions; otherwise outline.
- Loading: spinner + label, disabled; no layout shift.
- Icon-only buttons require `aria-label` and tooltip.

### Inputs
- Height 36px; label above; helper below; error replaces helper with `--danger-700`.
- Required marked with text, not just asterisk color.
- Money input: prefix `Rp`, right-aligned, tabular numerals, no thousand separators while typing.
- Select/multiselect: searchable when > 8 options.
- Date: explicit format `dd MMM yyyy`; timezone label if relevant.

### Tables
- Header: `--surface-100`, 12px uppercase micro, sticky.
- Row height 48px (comfortable) / 40px (compact).
- Numeric columns right-aligned; status column left; actions right.
- Hover `--surface-50`; selected `--primary-50` + left 2px primary border.
- Empty state inside table body, not a separate page.
- Pagination: cursor-based "Muat lebih banyak" or page controls; show total if cheap.
- Column visibility menu; saved views.
- Person/entity column: 32px initial avatar, name, secondary code or NIK masked; keep the row action accessible name equal to the person name.

### Badges
- 4px radius, 11px/14 medium, padding 2px 8px.
- Status badge includes text; risk badge includes score + label.
- No pill-shaped status badges (too playful for finance).

### Cards / KPI
- Title 12px uppercase muted; value 24px tabular; delta with arrow + sign.
- Delta must state comparison period.
- Sparkline optional, 32px height, no axes.
- Identity card: 58px initial avatar, name, code + branch, then 4 facts aligned in a grid.
- Balance card: remaining value, used/pending progress track, and entitlement/used/pending text; never encode meaning in color alone.

### Dialogs / Drawers
- Dialog for confirmation/decision; drawer for detail/audit.
- Max width 560px dialog; drawer 480–640px.
- Decision dialog: summary block (amount, policy, risk), reason textarea, confirm disabled until valid.
- Focus trap, Escape, restore focus.

### Tabs
- Underline tabs for page sections; segmented control for view modes.
- URL-synced; no more than 6 tabs.
- On narrow screens, wrap tabs onto a second row instead of hiding them behind horizontal scroll.

### Toast
- Bottom-right, 4s, one action max.
- Success after server confirmation only; error includes correlation ID.
- Never use toast for validation errors; use inline.

### Empty / Error / Loading
- Empty: title, one sentence, primary action, optional secondary link.
- Error: error code, correlation ID, retry, "Kembali".
- Loading: skeleton matching final layout; no full-page spinner.
- Permission denied: explain required role, no data leakage.

## 7. Screen Patterns

### List + detail
- List left (or full width) with filters; detail opens as page or drawer.
- Preserve filters in URL; back returns to same state.
- Bulk actions only when selection is explicit and reversible.

### Approval
- Queue sorted by urgency/SLA; risk and conflict visible before opening.
- Detail shows policy version, amount vs limit, risk breakdown, documents, audit.
- Decision controls sticky at bottom; reason required for reject/return.
- After decision, show outcome + next step; do not auto-advance silently.

### Financial form
- Group into sections: identity, amount, evidence, review.
- Show policy-bound limits inline; validate on blur and submit.
- Disable submit while pending; one idempotency key per submission.
- Confirmation step for amounts above a threshold or irreversible actions.

### Dashboard
- Top row: 4–6 KPI cards; second row: trend + breakdown; third row: table.
- Every chart has a text summary and accessible table alternative.
- Filters global at top; show active filter chips.
- If only one period exists, replace the trend plot with a month snapshot and keep the raw table available. Never fabricate a trend line from a single point.

### Audit ledger
- Integrity panel states the current chain status, loaded row count, domain count, and latest event time.
- Rows show time, actor, action, domain, entity, and hash; decision context expands inline as a definition list.
- Hash and entity values use mono chips with the full value in the title.
- On mobile, the table becomes a ledger card list; verification stays reachable above the filters.

### Payslip
- Header: period, employee masked, net pay large.
- Sections: earnings, employee deductions, employer contributions, YTD.
- Footer: policy version, verification code, checksum, download.
- Print stylesheet: A4, no nav, black text.

## 8. Motion

- Duration: 120ms (micro), 180ms (dialogs/drawers), 220ms (route arrival), 240ms (page transition max).
- Easing: `cubic-bezier(0.2, 0, 0, 1)`; route arrival uses a fast exponential ease-out.
- Animate opacity/transform only; never animate money values or table row heights.
- One authored route arrival, not a staggered entrance on every section.
- Respect `prefers-reduced-motion: reduce`; disable non-essential motion.
- No confetti, bouncing, or attention-seeking loops.

## 9. Accessibility

- WCAG 2.2 AA: text contrast ≥ 4.5:1, UI components ≥ 3:1.
- Focus visible on every interactive element; never `outline: none` without replacement.
- Keyboard: all actions reachable; table navigation; dialog trap; skip link.
- Forms: explicit labels, `aria-describedby`, error summary, `aria-live` for async status.
- Status: text + icon + color.
- Charts: table alternative + summary.
- Target size ≥ 24×24px (prefer 44×44 on touch).
- Test with keyboard, 200% zoom, and a screen reader for critical flows.

## 10. Content & Voice

- Bahasa Indonesia for UI; English for code/docs.
- Sentence case for labels and headings; no Title Case everywhere.
- Buttons: verb + object ("Setujui Klaim", "Ekspor Laporan"), not "OK".
- Errors: what happened, financial impact, next action. No blame.
- Numbers: `Rp 12.500.000` in display; raw decimal string in API.
- Dates: `25 Nov 2026`; time `14:30 WIB`.
- Never expose NIK/rekening penuh; use masked format with clear label.
- **No parentheses in UI copy.** Tulis sebagai kalimat kedua atau pisahkan dengan koma.
- **No ampersand in UI copy.** Gunakan "dan".
- No exclamation marks, emoji, hashtags, or hype words such as "seamless", "unlock", "empower", "supercharge".
- No slash-heavy shorthand. Tulis "klaim dan payroll", bukan "klaim/payroll".
- One idea per sentence. Helper text maksimal dua baris.
- Use Plus Jakarta Sans for all UI copy. IBM Plex Mono only for numerals, codes, and measurements. Jangan memakai font display di layar operasional.

## 11. Dark Mode

- Phase 2, not milestone.
- If added: surface `#0B1220`, elevated `#111A2E`, border `#1E293B`, text `#E2E8F0`, primary `#60A5FA`.
- Keep status colors accessible; do not simply invert.
- Persist preference; respect `prefers-color-scheme` on first visit.

## 12. Do / Don't

**Do**
- Use one primary action per screen.
- Align money right; use tabular numerals.
- Show policy version and audit context near decisions.
- Use whitespace and borders instead of shadows.
- Design empty/error/loading before happy path.

**Don't**
- Use gradients, glass, neon, or 3D charts.
- Hide critical rules behind disabled buttons without explanation.
- Use color alone for status.
- Animate numbers or use count-up effects.
- Use pill badges for dense financial data.
- Put more than 6 KPI cards above the fold.

## 13. Implementation Notes

- Tokens live in `apps/web/src/styles/tokens.css` and are exposed as Tailwind theme extensions.
- No arbitrary hex values in components; use tokens.
- Component stories/fixtures live beside components; no production fake data.
- Screenshots for each screen at 1440, 1024, 390 widths in `docs/assets/screens/`.
- Run `impeccable` critique/polish before marking a screen done.
