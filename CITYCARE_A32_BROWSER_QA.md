# CityCare A-3.2 — Browser and accessibility QA evidence

**Status: owner review; implementation frozen and not accepted.** No product changes or
migration. Evidence in [`qa-evidence/`](qa-evidence/) contains **synthetic** demo data.

## Test environment and limitations

An isolated test cluster, fresh PostgreSQL 17.11 `citycare_browser_qa_fresh`, was
bootstrapped from the repo's synthetic seed; app bound to local port 3111. Headless
Chromium 153.0.8010.0 + Puppeteer were installed outside the repository. The missing
NSPR libraries were built from `mozilla/nspr` in the isolated workspace, NSS libraries
were unpacked from npm `chrome-aws-lambda`, and `LD_LIBRARY_PATH` supplied them only to
test processes. A full current NSS build was attempted and failed with a legacy make
`multiple target patterns` error; the Chromium launch with the isolated libraries did
succeed. Chromium's serverless arguments include `--no-sandbox` and
`--disable-web-security`: these app-level access checks do **not** validate browser
sandbox, same-origin, CORS or CSP enforcement. Do not deploy these test flags/libraries.

The initial browser environment lacked Devanagari glyph fallback and rendered boxes
([screenshot](qa-evidence/records-hi-no-fallback.png)). For further checks a test-only
Noto Sans Devanagari font was obtained from Google Fonts' GitHub repository and supplied
through local Fontconfig; CDP reported that font rendering Devanagari glyphs. This is
not proof the app bundles or that every end-user platform has a fallback. No application
font or production infrastructure was changed. Desktop 1280×900 and mobile 390×844 CSS
pixels were checked; other sizes/devices were not comprehensively tested.

## Actual browser workflow results

| Scenario | Result | Scope / limitations |
|---|---|---|
| Language switch, `<html lang>` and reload persistence | PASS en/hi/mr | Browser DOM values after selection and reload; no screen-reader speech verification. |
| Populated records | PASS en/hi/mr | Synthetic timeline, lab, medicine, allergy and chart sections observed; source data remains English where entered that way. |
| Empty records | PASS en/hi/mr | Synthetic patient with no timeline, medicine, allergies/conditions, readings or documents; empty labels observed. |
| Documents | PASS en/hi/mr | UI selected/uploaded a synthetic PDF (201), minted signed link (200), browser saved bytes beginning `%PDF`, UI deleted it (200) and row disappeared. Native save dialog and expired-link UI not separately exercised. |
| Document loading/error/retry | PASS en/hi/mr | Browser intercepted GET to delay and inject a 500; localized `role=status` loading and `role=alert` fallback appeared, retry after restoring network succeeded. This is fault injection, not a real server outage. |
| Trend form | PASS en/hi/mr | Browser selected and saved a valid weight (201 and localized `role=status`); cleared date produced localized `aria-invalid` + description/alert. Value clearing used an input/change event in browser; malformed native date entry and screen-reader announcement not tested. |
| Prescription backfill | PASS en/hi/mr | First run: UI sample, preview, POST, draft confirmation PATCH (200). On a repeat run with the *same* sample, the harness timed out waiting for a new draft because existing rows had been confirmed/deduplicated; that repeat is **not** evidence of a product failure. Raw initial and retry logs are retained. |
| FHIR | PASS en/hi/mr | Browser clicked export, received success, saved file, saw localized ready state. Fault-injected 500 produced localized `role=alert`; not a real backend outage. |
| Consent revocation | PASS en/hi/mr | A synthetic patient's actual `Revoke now` UI returned 200; previously authorized doctor page no longer carried print summary and a browser-side doctor record fetch returned 403. Regrant between locales was synthetic API setup; the independent access-page body remains English/out of records localization scope. |
| Print action | PARTIAL en/hi/mr | Actual patient print button sent audit POST 200 and browser `beforeprint` fired; headless PDF rendering inspected below. Native print-dialog interaction, physical printer and actual screen reader were not tested. |

First-run harness failures for document title selector and download overwrite detection
were corrected and retried successfully; they are **not** product defects. The first
English populated-state check also compared case-sensitive `innerText` under CSS uppercase
and passed after checking DOM text. `browser-initial.log` and `browser-retry.log` retain
these test-harness attempts, including repeat-backfill timeouts.

## Accessibility checks actually executed

- Chrome accessibility tree for Hindi invalid date exposed `Date` name `तारीख`,
  localized description and `invalid=true` linked to the alert. Actual screen-reader
  announcement was **not** verified; en/mr DOM associations were checked in browser.
- 20 successive real Tab key presses on English records page: every reached element
  matched `:focus-visible` with a 2px solid outline; order was recorded in
  [`keyboard-focus.json`](qa-evidence/keyboard-focus.json). This is not a complete
  keyboard-only task run and did not cover every locale or every control.
- axe-core executed in the browser for en/hi/mr. It found two **moderate best-practice**
  rules in each locale: no visible level-one heading (`page-has-heading-one`) and two
  regions outside landmarks (`region`: demo banner and language switcher). See
  [`axe-en.json`](qa-evidence/axe-en.json), [`axe-hi.json`](qa-evidence/axe-hi.json),
  [`axe-mr.json`](qa-evidence/axe-mr.json). Execution of axe is not a pass; automated
  results are not a substitute for a full accessibility audit.
- Localized loading/success/error roles were observed in DOM. Actual auditory
  announcements, screen-reader language switching and reading order were **NOT RUN**;
  no screen reader was available/used.

## Defects requiring owner disposition (no code changes made)

### QA-1 — Extra blank print pages
- **Severity:** moderate; **locales:** en, hi, mr; **component:** patient print CSS
  `web/src/app/globals.css` / print summary. **Reproduce:** open synthetic populated
  patient records, choose a locale, invoke Print/Save and generate A4 PDF in headless
  Chromium with background printing. **Expected:** summary prints without unrelated
  blank pages. **Actual:** synthetic short summary occupies page 1 but PDF has 4 pages
  in English and 3 pages in Hindi/Marathi; remaining pages contain no extractable text
  and appear blank/grey. Visual evidence: [Hindi page 1](qa-evidence/print-hi-page-1.png),
  [Hindi page 2](qa-evidence/print-hi-page-2.png), [Marathi page 1](qa-evidence/print-mr-page-1.png),
  [PDF](qa-evidence/print-hi.pdf). `visibility:hidden` retaining page layout is a
  likely contributor, not a proven single cause. **Recommend:** investigate print flow
  so non-summary content does not reserve printable height; regression-test patient and
  doctor output, long multi-page summaries and real print dialogs.

### QA-2 — Mobile page horizontal overflow
- **Severity:** moderate; **locales:** en, hi, mr; **component:** records page grid /
  minimum widths. **Reproduce:** open populated `/patient/records` in 390×844 viewport.
  **Expected:** main content fits viewport (navigation's deliberate internal horizontal
  scroll excluded). **Actual:** document `clientWidth=390`, `scrollWidth=411`; records
  grid/cards extend to x=411, requiring horizontal scroll/cropping of right edge.
  [Evidence](qa-evidence/mobile-overflow.json), [Marathi screenshot](qa-evidence/records-mr-mobile.png).
  **Recommend:** inspect grid child min-width and long controls, permit wrapping/shrinking,
  then test at 320–400px with keyboard focus.

### QA-3 — Missing visible H1 and non-landmark content
- **Severity:** moderate best-practice accessibility finding; **locales:** en, hi, mr;
  **components:** records route, demo banner and language switcher. **Reproduce:** run
  axe-core on populated `/patient/records`. **Expected:** a meaningful visible H1 and
  navigable landmark structure. **Actual:** `page-has-heading-one` and `region` flagged;
  the print-only H1 is not visible on screen and demo banner/switcher sit outside a
  landmark. **Recommend:** review a localized page heading and appropriate landmark
  placement with an accessibility specialist; do not claim this alone proves a WCAG
  violation or resolves screen-reader UX.

### QA-4 — Devanagari unavailable without a system fallback font
- **Severity:** conditional/high for affected environment; **locales:** hi, mr;
  **component:** font delivery / fallback, environment-dependent. **Reproduce:** launch
  this isolated headless Chromium without Noto or another Devanagari font; open records
  in Hindi. **Expected:** legible glyphs. **Actual:** missing-glyph boxes
  ([evidence](qa-evidence/records-hi-no-fallback.png)). Supplying Noto only in the test
  environment produced legible Hindi and Marathi ([Hindi](qa-evidence/records-hi-desktop.png),
  [Marathi](qa-evidence/records-mr-desktop.png)) and Devanagari in extracted PDF text.
  This is not proof of failure on machines with a proper system font. **Recommend:**
  verify supported-device font coverage and, if self-contained coverage is required,
  consider a licensed Devanagari font/fallback with owner approval and load/print tests.

## Remaining NOT RUN / caveats

No actual screen reader or speech announcements; no full keyboard-only workflow,
real native dialog, physical print, long-record multi-page print or visual comparison
on real devices/browsers; no exhaustive responsive/text-clipping audit, secure-browser
policy verification, locale-specific expired/deleted separate-tab error UI, or qualified
clinical/legal/Hindi/Marathi translation approval. The screenshot/PDF samples are
synthetic and only cover the test data and font environment above. Application-owned
selector captions translate, but stored clinical reading names remain original because
provenance cannot reliably be inferred. Stop for explicit owner review.
