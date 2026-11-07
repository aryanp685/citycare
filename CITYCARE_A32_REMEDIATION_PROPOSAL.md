# A-3.2 browser QA — defect triage and remediation proposal

**Decision requested, not an implementation.** A-3.2 remains frozen and unaccepted.
No product code or migration changed. Reproduction uses only existing synthetic records
in the isolated browser-QA database. Reviewed the original report, ledger, axe results,
mobile screenshots, Hindi/Marathi page-1 and blank-page renders and source. Further
headless Chromium 153 investigations used *temporary in-memory DOM/styles only*, not
changes to application files. Numeric observations are in
[`qa-evidence/triage-measurements.json`](qa-evidence/triage-measurements.json).
The temporary experiments are diagnostic, not evidence a proposed fix is implemented
or production-ready. Browser flags include `--no-sandbox` and `--disable-web-security`;
this work does not validate browser security controls.

## QA-2 — Horizontal overflow on patient records

- **Classification / severity / impact:** genuine product defect, moderate. At small
  widths patients must pan the page; right edges of records cards and controls may be
  off-screen. Keyboard focus can move to content outside the viewport.
- **Route, components, viewport, locales:** `/patient/records`, records page outer
  grid (`web/src/app/patient/records/page.tsx`), `DocumentManager`
  (`web/src/components/document-manager.tsx`) and interactive `TrendsPanel`
  (`web/src/components/trends.tsx`). en/hi/mr with test Noto font: at viewport 320,
  375 and 390 CSS px, document `scrollWidth` = 411; at 414, 768 and 1280 it matched
  viewport in this populated fixture. Heights 844; not a device matrix.
- **Reproduction:** sign in with seeded synthetic populated patient; open records;
  select each locale; resize to 390×844; compare document client/scroll width and pan
  right. **Expected:** whole records layout fits; nav may separately scroll internally.
  **Actual:** client 390, scroll 411. `main` inner grid box is 358px wide at x=16,
  but its automatic single-column track is 395px and card edges reach x=411.
- **Evidence-supported root cause:** there are **two independently contributing
  intrinsic minimum-size sources**, not one culprit. (1) DocumentManager's native
  `<input type="file">` in the first form grid has no width constraint. Hiding that
  input in the live DOM reduced scroll width 411 → 406, not to 390. Setting its
  width/max-width to 100% and min-width to 0 yielded the same reduction. (2) With that
  input hidden, hiding either the trend logging form's `input.input.flex-1` number
  control or its sibling `input.input.w-24` unit control reduced 406 → 390; their
  `flex gap-2` row and nested automatic grid min-content sizing keep the track too
  wide. At narrower widths additional trend inner grids/recent-reading rows also
  overflow. These tests temporarily hid controls solely to isolate sizing; hiding them
  is **not** the proposed fix.
- **Scope of impact:** patient header's `nav.flex...overflow-x-auto` is internally
  scrollable (at 390: client 358, content 478–557 depending on locale), and is not
  the document-overflow source in these tests. Records intro/export and print-button
  card, document card, trend card/charts, timeline and medication/allergy cards are
  all widened because they share the outer track. Trend SVGs were responsive at the
  inflated track; no separate SVG cause established. Document file input and trend
  value/unit row are sources. FHIR/print controls were not an independent source in
  this fixture. Other data, long names and viewports may add causes.
- **Minimal proposed fix:** constrain file input to its available width; make the
  mobile records single track and relevant nested trend grid/flex children shrink
  (`minmax(0,1fr)` / `min-width:0` where needed); wrap the trend value/unit/date/action
  and recent-reading row as necessary instead of clipping content. Preserve the
  existing `md:grid-cols-2` desktop behavior, labels, native file accessibility and
  all data. Scope changes to patient records/document and patient interactive trend
  rendering; do not apply global overflow clipping or alter doctor output.
  Exploratory mobile-only CSS combining those ideas reduced page scroll to viewport at
  320/375/390/414 in all three locales; it was intentionally broad (including trend
  flex wrapping) and needs narrowing, visual review and functional tests before it can
  be called the smallest safe implementation. At 768/1280 document width remained
  unchanged, but desktop visual equivalence was **not** established by that measurement.
- **Required regression tests:** layout/assert bounding boxes and no page overflow at
  320/375/390/414 plus tablet/desktop; long synthetic filename, long custom reading,
  dates, validation and busy/status states; chart, file picker/upload/download/delete,
  value/unit editing and save/delete; Tab focus remains visible and reachable. Verify
  localized controls en/hi/mr and unchanged doctor trend rendering/desktop.
- **Browser verification after an authorized fix:** real keyboard/mouse/touch-like
  interaction, inspect 320–414 and desktop with all locales, ensure intended internal
  nav scrolling remains functional and no truncated clinical values; compare before/
  after screenshots and real device/browser coverage. **Owner authorization:** required
  before any product change.

## QA-1 — Extra blank print/PDF pages

- **Classification / severity / impact:** genuine print-layout product defect,
  moderate for the short synthetic record. Wastes paper and can cause uncertainty
  whether pages are missing; no clinical content loss was observed in this sample.
- **Route / components / locale / viewport:** `/patient/records`; `PatientPrintSummary`
  and shared `PrintSummary`, `web/src/app/globals.css` print rules. en/hi/mr,
  A4 headless Chromium PDF, 1280×900 viewport. Doctor print uses the shared stylesheet
  and summary component but this triage did **not** establish its own blank-page count.
- **Reproduction / result:** open populated synthetic records, choose locale, generate
  A4 PDF using print media and backgrounds. Expected only pages occupied by the
  summary. Original sample: en 4 pages; hi/mr 3 pages, text only on first. Hindi and
  Marathi page 1 visibly contain the clinically relevant sections; page 2 is grey/
  blank. [Hindi page 1](qa-evidence/print-hi-page-1.png),
  [Hindi page 2](qa-evidence/print-hi-page-2.png),
  [Marathi page 1](qa-evidence/print-mr-page-1.png),
  [Marathi page 2](qa-evidence/print-mr-page-2.png).
- **Root cause supported by experiment:** `@media print` sets `visibility:hidden` on
  all descendants while restoring summary visibility and positions the summary
  absolutely. Hidden screen layout remains in flow: for a Hindi sample, print-media
  hidden `main` height was ~2030px, body ~2264px, but summary ~749px. Keeping the
  *same* text and font, a temporary browser-only experiment moved summary into normal
  body flow and `display:none`d all other body children: A4 PDF changed from 3 pages
  (text counts 1329/0/0) to 1 (1329); innerText was identical. This directly supports
  retained non-summary layout as the extra-page mechanism. It is not a proposed DOM
  mutation or proof every print engine behaves identically.
- **Other pagination checks:** print summary has no fixed height and computed overflow
  `visible`; `body` has `min-height:100vh`. Patient summaries always carry `lang`, so
  `[lang]` overrides `.ps-section` from `break-inside:avoid` to `auto`, with heading
  `break-after:avoid` and list `overflow-wrap:anywhere`. No observed evidence makes
  Devanagari font metrics or these breaks the cause of *blank* pages: the same Noto
  and summary went from 3 to 1 when hidden layout was removed. As a limited long
  fixture check, 100 temporary synthetic markers added to a Marathi summary appeared
  in extractable text in all 3 pages both before and after isolation. This does not
  establish no visual clipping, widow/orphan issues, or reliable long-content printing.
- **Minimal proposed fix:** give the **patient** summary a dedicated print flow,
  remove non-summary patient screen content from print layout (not only visibility),
  and let summary paginate in normal flow rather than relying on an absolute overlay.
  Preserve every identity, allergy, condition, medication, reading, lab, encounter,
  note and footer line; do not limit content to suppress blank pages. Keep scoped
  break/wrap controls. Existing shared CSS also supports doctor summary: avoid silently
  changing doctor print/consent behavior; use a patient-scoped hook/structure, or obtain
  separate owner approval for shared changes. Investigate backgrounds and body minimum
  height too; do not assume a particular implementation until cross-browser checked.
- **Required regression tests:** real PDF page counts for short patient summaries in
  all locales; synthetic long lists/unbroken tokens across page boundaries with all
  clinical lines and footers preserved; page breaks, repeated/hidden sections and
  no clipping. Assert patient/doctor scope, record data and doctor summary/print
  behavior unchanged; test when no summary exists and print audit behavior.
- **Browser verification after an authorized fix:** A4 and Letter, normal native
  print preview and Save as PDF in representative Chromium and other supported
  browsers with screen inspection/page raster and extracted text, hi/mr and en,
  physical printing if available; supported-system fonts and long records. Headless
  experiment alone does not replace these. **Owner authorization:** required.

## QA-3A — Missing visible H1

- **Classification / severity / impact:** genuine heading-structure usability issue,
  axe moderate best-practice finding, **not** independently established WCAG failure.
  Heading navigation cannot find a page-level records title. `/patient/records`,
  desktop and 390px, en/hi/mr. `RecordsPage` has no screen H1; the shared print
  summary's H1 is `display:none` on screen. Axe `page-has-heading-one` reports the
  `html` node in all locales; it is not a false positive merely because a hidden H1
  exists. Reproduce by opening records and running axe; expected meaningful visible
  page title before the H2 sections, actual none.
- **Proposed minimal fix:** add one meaningful localized records H1 in the patient
  records route/client-localized introduction, before existing H2s, without making
  print-only title visible on screen or modifying doctor route. Reuse existing
  translation catalog and seek qualified translation review for any new text.
- **Regression tests / browser verification:** each locale has exactly one meaningful
  visible H1 and coherent H2 hierarchy in normal screen mode; print summary still has
  its appropriate H1 and original content; empty/loading/error states and desktop/
  mobile layout; axe rerun and actual screen-reader heading navigation after access to
  assistive technology. Verify doctor pages unaffected. **Owner authorization:** yes.

## QA-3B — Two content blocks outside landmarks

- **Classification / severity / impact:** genuine landmark-navigation improvement;
  axe moderate *best-practice* findings, not independently proven WCAG violations.
  en/hi/mr, all sampled widths, `/patient/records`. Root `layout.tsx` renders the
  demo banner (`DemoBannerContent`, `role=note`) and `LanguageSwitcher` as body-level
  siblings before the patient shell; neither is inside a landmark. The patient shell
  already has a semantic `header`, `nav`, `main` and `footer`. Axe `region` identifies
  `.bg-amber-50` and `.border-b.bg-white.px-4` separately. Reproduce with demo mode on
  and axe. Expected important notice and language control reachable via a meaningful
  landmark; actual neither belongs to one. `role=note` is appropriate content semantics
  but is **not** a landmark; not an axe false positive.
- **Proposed minimal fix:** place patient banner and language control together in an
  appropriately **named, localized region**, or restructure them into the patient
  shell's existing header without changing order, content, warnings or focus; choose
  one approach after checking semantics and hydration. Do not add a second top-level
  `banner` landmark or turn every fragment into a noisy landmark. Since components
  are shared at the root, scope any new landmark to patient routes without duplicating
  the banner/switcher or changing doctor-facing structure; demo-disabled mode must
  still handle switcher correctly. New accessible name needs human language review.
- **Regression tests / browser verification:** axe per locale with demo on and off,
  one coherent named region, existing note/link/select name/description/focus order,
  SSR/hydration and language persistence; check doctor/admin/public DOM remains as
  before. Inspect landmark navigation with real screen reader, not axe alone.
  **Owner authorization:** yes.

## QA-4 — Devanagari fallback / font coverage

- **Classification / severity / impact:** observed **test-environment limitation**
  and product portability risk, not proof of a universal production defect. Severity
  high *if* a supported device lacks any usable Devanagari font (unreadable interface),
  otherwise no observed rendering failure with fallback. `/patient/records` hi/mr on
  screen; patient print is also configured to depend on available fonts.
- **Reproduction / expected / actual:** in the stripped headless environment without
  a Devanagari system font, Hindi renders missing-glyph boxes (original
  [screenshot](qa-evidence/records-hi-no-fallback.png)); readable text is expected.
  Supplying Noto Sans Devanagari solely via isolated Fontconfig yields legible Hindi
  and Marathi screen and A4 PDF samples. PDF without a fallback was not separately
  tested. We cannot infer failure rates on actual patient devices from this host.
- **Root cause / loading distinction:** root `next/font/local` self-hosts Inter
  `web/src/app/fonts/InterVariable.woff2`; inspection of its cmap finds **zero**
  U+0900–U+097F codepoints, so it cannot render Devanagari and browser fallback is
  necessary. In the Noto-equipped run `document.fonts` reported `inter` loaded and
  Chrome CDP showed 7 Inter and 20 Noto glyphs on the Hindi document heading; there
  is no evidence the Inter webfont failed. Its generated local `inter Fallback` face
  reported error on this host where local Arial is absent; that is distinct from the
  successfully loaded Inter face. Screen CSS lists platform families rather than
  delivering a Devanagari face. Print `#print-summary[lang]` explicitly prefers
  `Noto Sans Devanagari` then system fonts, but no `@font-face` bundles Noto; the
  name does not itself guarantee font availability. Patient summary has `[lang]` for
  en as well as hi/mr. Print-only styling therefore also depends on font availability;
  it is not evidence of a distinct print font loading failure.
- **Proposed decision, not an automatic dependency:** first define supported platforms
  and verify their system fonts offline, screen and print. If the owner requires
  deterministic coverage even without system fonts, separately evaluate a self-hosted,
  subsetted Devanagari WOFF2 with `font-display`, Unicode coverage, local availability,
  privacy/no third-party requests, print readiness (`document.fonts.ready`) and
  fallbacks. Noto Sans Devanagari is one candidate, not an imposed dependency. The
  isolated variable **TTF** used in QA is 641,944 bytes (~627 KiB); current Inter WOFF2
  is ~344 KiB. Actual compressed/subset size, caching and device/network cost must be
  measured, not inferred from TTF. Google Fonts' Noto Sans Devanagari OFL file specifies
  SIL Open Font License 1.1: redistribution/bundling requires including copyright and
  license and respecting other terms, including reserved names if applicable. Review
  license and build/deployment artifact/CDN/Next font behavior before choosing. No
  large font package or asset has been added.
- **Regression tests / browser verification:** use known synthetic hi/mr text with
  conjuncts, matras, numbers and mixed English; low-font-coverage environment plus
  representative supported devices, font disabled/failure and offline; verify
  browser selected glyphs, contrast/wrapping, screen and real PDF output, page breaks,
  accessibility tree/actual speech and no external font requests. Compare font load,
  transferred bytes and build output, preserve clinical text. **Owner authorization:**
  required for any product font/config/dependency change; supported-device testing
  can be separately approved as QA.

## Decision and remaining limits

Recommend authorizing scoped QA-2, QA-1 and QA-3 corrections one coherent change at a
time, followed by the specified regressions, with QA-4's support/font policy decided
separately. No implementation is authorized by this proposal. Real screen-reader
announcements, native print preview, physical print, cross-browser/device QA,
long-record visual pagination and qualified translations remain not verified. Stop for
owner decision; do not begin A-3.3 or A-4.
