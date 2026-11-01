# CityCare — UI/UX Audit (Step 1)

_Audited 2026-11-01 by reading all 27 pages, 40 component files, `globals.css` (tokens), and
the animation components, plus rendering page HTML from the production build over HTTP.
**Limitation, stated plainly: this sandbox has no browser** — visual rendering, responsive
breakpoints, real-device feel and perceived performance are **NOT VERIFIED** here. Code-level
claims below are exact; anything needing eyes-on is flagged `_needs visual pass`._

## 1. Design system assessment (code-level)

The existing token system in `globals.css` is already close to the brief's direction and should
be **the** foundation, not a starting sketch:

- **Colour**: deep healthcare teal `#0f766e` (brand) / `#115e59` (brand-2), warm wash
  `#f4f8f9`/`#eaf2f3` backgrounds, ink `#12222b`, single accent amber `#f59e0b` reserved
  "attention only, never decoration" — exactly the calm-hierarchy brief wants. Semantic
  danger/warn/ok are muted (not neon).
- **Typography**: self-hosted Inter (`next/font/local` — zero third-party requests),
  `cv11/ss01/tnum` features (tabular numerals — correct for clinical data), antialiased.
- **Shapes/depth**: single radius 14px, two restrained shadows, 1px hairlines — no glassmorphism,
  no gradient abuse (the hero's two "blobs" are the only decorative element, slow ±30px drift).
- **Motion**: one global `prefers-reduced-motion` kill-switch; Motion for UI (reveals, page
  transitions, `layoutId` tab underline), GSAP+Lenis landing-only; `gsap.context()` +
  `mm.revert()` cleanup verified in every component (no ScrollTrigger leaks found).
- **A11y baseline**: `:focus-visible` ring globally, `aria-hidden` on decorative SVGs,
  `lang`/`hrefLang` on hi/mr legal pages, keyboard-only outline policy.

**Verdict**: the visual language is *already* "premium private healthcare" in its tokens; the
gap is in **consistency of application across app pages and in polish tiers** (see §3).

## 2. GSAP / Motion / Lenis architecture (audit H)

| Question | Finding (evidence) |
|---|---|
| Duplicate animation libraries? | **Yes, deliberately split**: GSAP (landing: hero timeline, ScrollTrigger parallax, MotionPath consent diagram, Lenis smooth scroll) vs Motion (app UI: reveals, transitions, tab underline). Two runtimes ship, but **on disjoint route sets**: the gsap chunk is referenced by `/` only (D35: +97 KB gzip on the landing over app baseline; verified: no gsap import in any non-landing component). Not a bug; a cost. |
| Bundle impact | Landing-only. `.next/static/chunks` totals ~1.1 MB raw across the build; biggest chunk 229 KB (landing, includes GSAP). App pages stay lean. |
| ScrollTrigger cleanup | `ctx.revert()` + `mm.revert()` on unmount (hero.tsx L35-37, L93-95; flow-diagram L34-36). Correct React lifecycle. |
| Hydration | All GSAP is in `useEffect` (client-only); landing copy is SSR HTML (server component) — no hydration mismatch path found. Lenis mounts after paint. |
| Reduced motion | Global CSS rule + `gsap.matchMedia("(prefers-reduced-motion: reduce)")` gates. Correct. |
| Mobile perf | GSAP blob parallax + MotionPath loop run continuously (`repeat: -1`) — on a 2019-range phone at Nagpur clinic Wi-Fi this is wasted battery. `_needs visual pass` for a frame-rate check; recommend pausing the MotionPath loop when the diagram scrolls out of view (ScrollTrigger already tracks visibility — small change). |
| Where GSAP adds value | Landing only — justified (it's the marketing surface). **Medical dashboards correctly have zero GSAP** — only Motion reveals. No animated medical alerts (alert severities are colour + text, not motion) — good, keep it that way. |
| Recommendation | P3: `LazyMotion`+`domAnimation` would trim ~20 KB (D35 note); bigger win is the out-of-view pause; bigger still is leaving the app shell GSAP-free, which it already is. |

## 3. Page-by-page state & gaps

**Landing `/`** — the strongest surface: hero + animated consent flow diagram (every hop
"lands in the ledger" — the differentiator, animated), feature grid, honest-limits section,
Hindi/Marathi legal link. Gaps: (a) no regional-language toggle for the landing copy itself
(Marathi-first for Nagpur is a market decision — NG-F03); (b) social proof is absent (no pilot
logos/testimonials — appropriate for demo, needed for pilot); (c) `_needs visual pass` for
type scale on 320px.

**Patient portal** — utilitarian by design (right call for clinical clarity).
- Home: appointments + pending consents + record completeness card (single-query layout, A41).
  Empty states present.
- Records (hero): timeline + allergies/conditions/meds + trends card (SVG sparkline + shaded
  band) + files + print button + FHIR export. Data-dense but well-grouped; tabular numerals
  on values. Gap: trends unit inconsistency is counted but the UI message could be friendlier
  (says how many were dropped — honest, slightly engineer-speak).
- Access & trust: consent list with live verdicts, ledger (keyset-paged), nominee, security
  panel (devices/recovery), purge with confirm phrase. This page is the trust differentiator —
  it works; `_needs visual pass` for the ledger density on mobile.
- Doctor search / booking: filters + slot picker (45-s live refetch, "2 left" capacity text,
  distinct 409 messages). Gap: no calendar-month view (list of 14 days only — fine at this
  scale); no reminder (NG-F01).
- Onboard: 4-step wizard. Gap: no photo capture for the dependent-child flow (F11 territory).

**Doctor portal** — the money screen is `patients/[id]`: consent banner (scope + expiry,
DB-clock), rule alerts (CRITICAL first, evidence shown), record sections, encounter form,
break-glass with mandatory reason. Gaps: (a) alert panel and record compete for vertical
space on small screens (`_needs visual pass`); (b) no quick "last visit" summary line above
the timeline (F18 print summary has it — the screen could borrow one line); (c) encounter form
has no ICD-10 assist (NG-C05) — free-text diagnosis only.

**Admin portal** — queues with overdue-first ordering (grievances SLA, emergencies tally,
incident 72-h clock), system monitor. Functional and honest; low visual investment is
appropriate. Gap: incident "intimate affected users" is one click with no dry-run preview
(mass-notification safety — add a count preview before fan-out; cheap).

**Legal pages** — itemised privacy rendered from code (`DATA_INVENTORY`), terms, grievance
form, licenses (361 packages, no copyleft — gate script), transparency (anchors + OTS scope
honestly stated). hi/mr key-points with `lang` attrs. Gaps: legal-cell review of translations
(L-G2), full UI i18n (D17).

## 4. Cross-cutting UX findings (register links)

| ID | Sev | Finding | Fix |
|---|---|---|---|
| NG-U01 | **Medium (P2)** | **Form errors are a joined string, not field-mapped.** Probe today: `400 {"error":"valueNum: value out of plausible range; takenOn: Invalid input: expected string, received undefined",…}` — correct content, engineer format. On a 6-inch clinic phone a patient gets a wall of text. | Map zod issues to field-level inline errors (the client already has per-field state; the route already returns structured issues — parse them) | inline red per field; e2e unchanged |
| NG-U02 | **Medium (P2)** | **No automated accessibility audit has ever run** (no axe/lighthouse in CI or locally). The manual baseline is good; unverified ≠ verified. | Add `@axe-core/playwright` (or Lighthouse CI) to the CI gate over the key pages | 0 critical axe findings on /login, /patient/records, /doctor workspace |
| NG-U03 | **Low (P2)** | **Mobile responsiveness is code-present, visually unverified** — every page uses Tailwind responsive classes, but no breakpoint has been eyeballed in this environment. The data-dense doctor workspace and the ledger are the risk areas. | `_needs visual pass` on 320/375/768 px (owner or Playwright screenshots in CI) | screenshots archived; no horizontal scroll at 320px |
| NG-U04 | **Low (P3)** | Dark mode (F16) | tokens are already CSS variables — half a day | `prefers-color-scheme` respected |
| NG-U05 | **Low (P3)** | No PWA/manifest (F10) — installability on clinic phones, offline shell | manifest + icons + offline page; push later (D42) | install prompt on Android |
| NG-U06 | **Medium (P2, design)** | **Two visual tiers exist (premium landing / utilitarian app) and the brief wants the app shell elevated too** — without losing clinical clarity. The right plan is *elevation, not redesign*: consistent card rhythm, a true design-token set for spacing (spacing is currently ad-hoc `rem` values), one shared empty-state component, one shared error-state component, consistent 8-pt spacing scale, and a typography scale pass on the three dense pages. | Design tokens v2 (spacing/type/size scale) + component audit; **no framework change, no shadcn import, no gradient/glass** | design tokens file; 3 dense pages re-scored in a visual pass |
| NG-U07 | **Low (P3)** | No network-error state (offline/5xx) on data pages — warmup mitigates cold start but a failed fetch shows a blank card. | Global error boundary + per-card retry (Next error.tsx exists per segment? — `error.tsx` files not found: add them) | killed-DB screenshot shows retry UI, not blank |
| NG-U08 | **Info** | `error.tsx` segment boundaries absent (only `loading.tsx` skeletons for /patient + /doctor). | add `error.tsx` where `loading.tsx` exists | — |

## 5. Proposed design-system plan (for Step 2 — not started, per instructions)

1. **Keep**: teal/ink/wash palette, single amber accent, Inter, 14px radius, shadow system,
   focus-visible, reduced-motion rule. These already match the brief.
2. **Add tokens**: spacing scale (4/8/12/16/24/32/48), type scale (12/14/16/20/24/30 +
   line-heights), component size scale (sm/md/lg buttons/inputs), z-index scale.
3. **Unify**: one `EmptyState` (icon + one line + one action), one `ErrorState` (message +
   retry), one `SectionHeader` (title + count + action), one `StatCard`.
4. **Elevate the three dense pages** (patient records, doctor workspace, access & trust) with
   the token pass — no layout invention.
5. **Motion policy**: landing = GSAP as today; app = Motion reveals ≤200 ms, no continuous
   loops inside portals; alerts are never motion-driven.
6. **i18n-ready**: strings already mostly centralised (`onboard.ts`, page copy) — next-intl
   dictionaries hi/mr-first (market: Nagpur is Marathi-speaking; D17/D58).
