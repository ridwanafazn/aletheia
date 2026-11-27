# DESIGN.md — Aletheia Design System

**Direction:** *Daylight workspace.* A calm HR and finance operations surface: cool paper ground, white bordered cards, cobalt action, teal success, amber attention, violet category. The mood is modern, fresh, and low-stimulation. Familiar HRIS patterns carry the structure; the craft lives in spacing, typography, state clarity, and restraint.

**Mode:** Operate primary, Read for reports, Persuade for login only.

**References:** Mekari Talenta for HRIS information architecture and employee self-service familiarity; the supplied BordUp HR dashboard for the light sidebar, workspace card, pastel accents, and calm density; Dribbble HRIS dashboards for airy cards and legible data presentation.

---

## 1. Brand

- **Name:** Aletheia
- **Mark:** two mirrored cobalt brackets forming a broken portal. The gap in the middle is intentional; it reads as an opening, not a complete enclosure.
- **Logo assets:**
  - `apps/web/public/brand/aletheia-mark.svg` — blue mark for light surfaces.
  - `apps/web/public/brand/aletheia-mark-white.svg` — white mark for cobalt surfaces.
  - `apps/web/public/brand/aletheia-app-icon.svg` — app icon and favicon.
- **Primary blue:** `#2F4BD8`.
- **Tagline:** *Governed money movement, with evidence.*
- **Personality:** exact, composed, humane, calm.
- **Avoid:** gradients, glass, neon fintech, robot imagery, stock handshake photos, emoji, decorative illustration.

---

## 2. Color tokens

### Ink and surfaces

| Token | Hex | Use |
| --- | --- | --- |
| `--ink-900` | `#101828` | headings, primary text |
| `--ink-700` | `#344054` | body, labels |
| `--ink-500` | `#667085` | secondary text, metadata, nav labels |
| `--ink-300` | `#98A2B3` | disabled only; never body or placeholder text |
| `--surface-0` | `#FFFFFF` | cards, tables, dialogs |
| `--surface-50` | `#F6F8FC` | app background, sunken rows |
| `--surface-100` | `#EEF2F7` | tab track, table header |
| `--surface-200` | `#E4E9F1` | strongest neutral fill |
| `--border-200` | `#E3E8F0` | default border |
| `--border-300` | `#CFD6E2` | input border, strong divider |

### Action and status

| Role | Strong | Soft | Use |
| --- | --- | --- | --- |
| Primary | `#2F4BD8` | `#EEF1FF` | primary action, active nav, links |
| Primary hover | `#233BB8` | `#DDE3FF` | hover, selected |
| Success | `#087A6E` | `#ECFDF3` | approved, paid, valid |
| Warning | `#B54708` | `#FFFAEB` | pending, review, escalated |
| Danger | `#B42318` | `#FEF3F2` | rejected, failed, conflict |
| Info | `#175CD3` | `#EFF8FF` | queued, draft, informational |
| Violet | `#6941C6` | `#F4F3FF` | category accent, secondary icon tile |
| Focus | `#2F4BD8` | — | focus ring |

**Rules:**

- Status is never color-only. Pair it with text and a dot or icon.
- Use semantic color only for meaning. Do not color-code navigation or decorate cards.
- Text on tinted surfaces must meet WCAG AA. `--ink-500` is only safe on white and `--surface-50`, not on `--surface-100` or primary tints.
- Vivid fills are for actions, icons, charts, and status dots, not large backgrounds except the login panel.

---

## 3. Typography

- **Sans:** `"Plus Jakarta Sans Variable"`, `"Plus Jakarta Sans"`, `"Segoe UI"`, system UI.
- **Mono:** `"IBM Plex Mono"` for IDs, hashes, verification codes, and bank accounts.
- **Numerals:** `font-variant-numeric: tabular-nums lining-nums` on money, counts, dates, and codes.

| Style | Size / line-height | Weight | Use |
| --- | --- | --- | --- |
| Display | 36 / 44 | 700 | login headline only |
| H1 | 30 / 38 | 700 | page title |
| H2 | 20 / 28 | 700 | section title |
| H3 | 16 / 24 | 700 | card title |
| Body | 14 / 21 | 400 | default |
| Body strong | 14 / 21 | 600 | labels, emphasis |
| Small | 12 / 18 | 400 | metadata, helper |
| Micro | 10 / 14 | 700 | nav group labels, table headers |

**Rules:** maximum three weights per screen; no all-caps except micro labels with `letter-spacing: 0.08em`; headings use `-0.03em` tracking, never below `-0.04em`; body measure 65–75ch.

---

## 4. Layout and shell

| Token | Value |
| --- | --- |
| Sidebar expanded | 252px |
| Sidebar collapsed | 78px |
| Topbar | 64px |
| Content padding | 28px desktop, 16px mobile |
| Content max width | 1480px |
| Grid gap | 12–24px |
| Base unit | 4px |

### Sidebar

- White surface, 1px border-right, no shadow.
- Brand mark and wordmark at top.
- Workspace switcher card: tenant name and code, Building icon, links to profile.
- Nav groups: Ringkasan, Operasional, Payroll, Intelligence, Governance.
- Nav item: 40px, 10px radius, 13px medium; active is cobalt-soft fill with a full border, not a one-sided bar.
- User block at the bottom is a button to the profile page.
- Collapse control in the topbar. Collapsed state shows a 78px icon rail, tooltips, and group separators.
- Mobile: fixed drawer with overlay, opened by the hamburger, closed by Escape or backdrop.

### Topbar

- White, 1px bottom border, 64px.
- Left: collapse control, section and page breadcrumb.
- Right: role chip, profile avatar button.
- No tenant plan badge. Tenant context lives in the sidebar card and profile page.

### Content

- Background `--surface-50`.
- Page header: title, one-sentence description, primary action on the right.
- Panels use a full border and no shadow. Shadows are reserved for floating layers.

### Two-card rule

When two cards sit side by side, both stretch to the row height. The shorter card keeps the same outer size and may contain empty space; never let the right card dictate a taller row while the left card shrinks to its content. Use `align-items: stretch` and `height: 100%` on the card children.

---

## 5. Shape and elevation

| Token | Value | Use |
| --- | --- | --- |
| Radius sm | 8px | small controls |
| Radius md | 10px | buttons, inputs |
| Radius lg | 14px | cards, stat tiles |
| Radius xl | 20px | dialogs, login card, large surfaces |
| Card elevation | none | 1px border only |
| Raised | `0 12px 32px -20px rgba(16,24,40,.28)` | dropdowns, floating controls |
| Dialog | `0 24px 64px -24px rgba(16,24,40,.32)` | dialogs, drawers |

Declare elevation once. Do not combine a wide soft shadow with a 1px border on the same card.

---

## 6. Components

### Buttons

- Height 38px default, 32px small; 10px radius; 600 weight.
- Primary: cobalt fill, white text, subtle 1px shadow.
- Secondary: white fill, `--border-300`, ink text.
- Ghost: transparent, hover `--surface-50`.
- Danger: dark red fill only for irreversible actions; otherwise outline.
- Icon-only buttons require `aria-label` and a tooltip.

### Inputs

- Height 40px; 10px radius; white fill; `--border-300`.
- Focus: cobalt border plus 3px `--primary-100` outline.
- Error replaces helper text and uses `--danger-700`.
- Placeholder uses `--ink-500`; never `--ink-300`.
- Money inputs: right aligned, tabular numerals, `Rp` prefix outside the value.

### Panels

- White, 1px `--border-200`, 16px radius, no shadow.
- Header padding 20px 22px, body 22px, footer 14px 22px.
- Use panels for genuine grouping, not for every section. Avoid nested cards.

### Tables

- Header `--surface-50`, 10px uppercase micro, 700 weight.
- Row height approximately 52px, 13px 16px padding, 1px row border.
- Hover `--surface-50`; last row no border.
- Numeric columns right aligned; status and actions left; actions right.
- Mobile: replace primary tables with card lists when the table exceeds three columns. Existing card patterns: employees, payroll, claims, MIS, audit, self-service payslips.

### Badges and chips

- Badges are pills with tinted background and no border; 11px 600.
- Chips are neutral context pills with a 1px border; plan chips are removed.
- Compliance chip uses success tint; role chip uses neutral tint.

### Tabs

- Track `--surface-100`, 12px radius, 4px padding.
- Active item: white fill, cobalt text, 1px soft shadow.
- Inactive item: `--ink-700`; never `--ink-500` on the tinted track.

### Stat and KPI tiles

- Stat cards: white, 1px border, 14px radius, 16–18px padding.
- Label: 11px 600 with a 5px semantic dot.
- Value: 22px 700, tabular, truncated only when necessary.
- Meta: 11px `--ink-500`.
- KPI cards: icon tile 30px, value 26px, meta below. Icon tile colors: cobalt, teal, violet, amber.
- No sparklines as decoration. Trends belong in a chart with labels and context.

### Workspace switcher

- 12px radius, `--surface-50`, 1px border.
- 32px icon tile, tenant name 12px 700, tenant code and “Ruang kerja” 10px.
- Whole card is a button to `/profile`; no fake dropdown chevron.

### Profile page

- Hero: 64px avatar, name 24px, role and email, role and tenant chips.
- Two-column details: identity and access/tenant.
- Display preference: sidebar lengkap or ringkas, persisted in local storage and dispatched to the shell.
- Demo notice: synthetic data, no real money or PII.
- Topbar avatar and sidebar user block both open this page.

### Login

- Diagonal cobalt panel (clip-path) with a large translucent white logo watermark.
- Brand mark, headline, body, and feature labels in white over cobalt.
- Right panel: white with a crisp line illustration of a calm office scene, 42% opacity.
- Login card: white, 20px radius, soft floating shadow, 420px max width.
- Demo role options are a looping horizontal card slider with arrows, dots, and swipe. One active card is centered; adjacent cards peek with a fade. No vertical grid, no bento asymmetry. MFA input is hidden in the demo login; the backend still supports MFA.
- Mobile: stacked layout; cobalt header with watermark, form card below, illustration hidden.

### Dialogs and drawers

- Radius 18px; shadow only; no border.
- Header, body, footer split with 1px dividers.
- Destructive actions require explicit labels and consequences.

---

## 7. Page patterns

### Overview

- Page header with greeting, date, role, and up to three quick actions.
- Four KPI tiles with meaningful labels and distinct icon tones.
- One insight chart and one “Perlu perhatian” queue.
- One branch or recent-activity table.
- Do not use a dark hero or a marketing-style banner.

### HRIS tables

- Filters first, then table or card list.
- Keep primary identity in the first column with avatar, name, and code.
- Status pills for employment and payment states.
- One row action menu or a single chevron; avoid multiple competing links.

### Self-service

- Profile summary, tabs, then task content.
- Tabs: Slip Gaji, Absensi, Cuti dan Lembur, Reimburse.
- Mobile payslips use cards with period, gross, net, verification code, and download.
- Leave and overtime forms use clear labels, helper text, and one primary submit action.

### MIS and audit

- Filters in a compact panel.
- KPI strip with 4–6 metrics, then a branch table.
- Audit rows show actor, action, domain, entity, hash, and time; use a card list on mobile.

---

## 8. Motion

- One authored route-arrival animation; do not animate every section.
- Hover and state transitions: 150ms cubic-bezier(0.2, 0, 0, 1).
- Press: 1px translate only.
- Respect `prefers-reduced-motion`; animations become effectively instant.
- No parallax, looping decoration, or attention-seeking motion in operational screens.

---

## 9. Accessibility and psychology

- **Contrast:** body and placeholder text ≥4.5:1; large text ≥3:1; badges must pass on their tinted backgrounds.
- **Focus:** visible 2px focus ring with 2px offset; focus order follows reading order.
- **Targets:** 44px minimum on touch; 36–40px on desktop.
- **Semantics:** headings in order, tables with captions, dialogs with labels, icon buttons with `aria-label`.
- **Recognition over recall:** keep navigation stable; do not move primary actions between screens.
- **Hick’s law:** one primary action per region; secondary actions are quiet.
- **Jakob’s law:** use familiar HRIS patterns; do not invent navigation metaphors.
- **Gestalt:** group with spacing before borders; align labels and values on a shared grid.
- **Feedback:** every mutation has pending, success, error, and recovery copy.
- **Trust:** show tenant, role, policy, and audit context without turning the page into a compliance dashboard.
- **Calm defaults:** limited palette, no gradients, no glass, no emoji, no decorative charts.
- **Empty states:** explain why the area is empty and the next useful action.

---

## 10. Responsive

| Breakpoint | Behavior |
| --- | --- |
| ≥821px | Expanded or collapsed sidebar; four-column stat grids; two-column page grids |
| ≤820px | Sidebar becomes a drawer; topbar 16px padding; content 16px; login stacks; profile hero stacks |
| ≤700px | Primary tables become card lists; filters stack; action buttons full width when primary |
| ≤520px | Stat value 17px; KPI value 22px; tabs wrap; no horizontal overflow for core tasks |

The sidebar collapse control is desktop-only. The mobile menu is a drawer with a backdrop and focus return.

---

## 11. Content rules

- Indonesian UI; English code and technical docs.
- Factual, composed, precise. No hype, exclamation marks, emoji, or anthropomorphic errors.
- No parentheses in UI copy; write a second sentence.
- No ampersand; use “dan”.
- No slash-heavy shorthand; write “klaim dan payroll”.
- Errors explain what happened, the financial impact, and the next action.
- Never expose PII, stack traces, or internal SQL.
- Label synthetic demo data honestly.

---

## 12. Implementation map

| Concern | File |
| --- | --- |
| Color, radius, spacing tokens | `apps/web/src/styles/tokens.css` |
| Visual layer and shell | `apps/web/src/styles/theme.css` |
| Legacy structure and page classes | `apps/web/src/styles/global.css` |
| Shell, sidebar, topbar, workspace card | `apps/web/src/widgets/AppShell.tsx` |
| Login composition | `apps/web/src/features/auth/LoginPage.tsx` |
| Profile page | `apps/web/src/features/profile/ProfilePage.tsx` |
| Charts | `apps/web/src/features/overview/charts.tsx` |
| Logo and login illustration | `apps/web/public/brand/` |

`theme.css` is the current visual authority. `global.css` retains the original structure and some legacy selectors; a future cleanup can merge the two without changing the rendered result.

---

## 13. Status

**Phase 0 — Foundation: complete.**

- New logo, app icon, and favicon.
- Cobalt daylight palette, typography, spacing, radii, and elevation.
- Light collapsible sidebar, workspace switcher, topbar, profile avatar.
- HRIS Pro badge removed from the topbar; tenant context lives in the workspace card and profile.
- Profile page at `/profile`, reachable from the topbar avatar and sidebar user block.
- Login page with diagonal cobalt panel, watermark, line illustration, and floating card.
- Desktop visual pass across overview, payroll, employees, workforce, organization, payslips, reports, claims, MIS, audit, and profile.
- Mobile self-service payslips converted to cards.
- Playwright theme review with axe checks on login, overview, payroll, profile, and self-service.

**Phase 1 — Navigation and orientation: complete.**

- Topbar search trigger with `Ctrl/Cmd+K`.
- Command palette combining page navigation with role-aware quick actions.
- Keyboard navigation: ArrowUp/ArrowDown, Enter, Escape; input autofocus; scroll lock.
- Quick actions: create claim, payroll console, workforce queue, audit verify, MIS.
- Mobile: icon-only search trigger; palette remains full-width.
- Sidebar collapse and profile entry remain from Phase 0.

**Phase 2 — Insight hierarchy: complete.**

- Role-based home for Claims Officer, Branch Manager, Finance Manager, HR Specialist, Compliance Admin, and MIS Analyst.
- Action-first layout: “Perlu tindakan” or “Sinyal analisis” before metrics.
- One primary focus card per role, followed by a three-metric secondary strip.
- One chart with a short “Apa artinya” insight, then a role-specific detail table.
- Empty, loading, and error states for the active queries.
- Chart bars render without entrance animation so evidence and reduced-motion users see the final state immediately.
- Employee role keeps Ruang Saya as its home.

**Phase 3 — Core workflow clarity: deferred.**

- Form hierarchy, inline validation, sticky actions, and SoD explanations are not part of the final portfolio cut.
- The existing forms and approval explanations remain usable; the deeper workflow pass is logged as backlog.

**Phase 4 — Mobile table conversion: deferred.**

- Mobile table-to-card conversion for payslips, reports, and workforce remains backlog.
- The current mobile tables stay horizontally scrollable and axe-clean.

**Phase 5 — Final polish and production cutover: complete.**

- Sidebar navigation scrolls independently for long role menus; the account footer stays pinned and visible.
- Menu labels fade softly at the scroll edge, with a spacer so the last item is never hidden under the fade.
- Cloudflare Pages CSP allows the bundled `data:` font subsets, so Plus Jakarta Sans loads in production with zero console errors.
- Production runs commit `04962c3`: four Render services, Cloudflare Workers edge, and Cloudflare Pages web.
- Post-deploy smoke **15/15**, async QStash/worker ~5 seconds, six-role login, and role-home browser checks pass.
- Phase 3–4 remain documented backlog; no P0/P1 issues are open.
