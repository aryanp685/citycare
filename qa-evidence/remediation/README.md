# A-3.2 remediation browser evidence

All screenshots/PDFs use synthetic seed data. `browser-smoke.json` contains DOM
measurements and axe violations from en/hi/mr; `workflows.json` contains executed
patient/doctor browser checks; `pdf-analysis.json` records page counts, selected
clinical tokens and synthetic long-summary markers. `keyboard-320-delayed.json` and
`nav-keyboard-clipping.png` document an additional navigation focus problem, not fixed
in this authorized scope. The doctor PDF pair compares normal output with the new
patient-only CSS rules removed in browser memory; their rendered page hashes match.

The `.cjs` files are the executed QA harnesses, not application dependencies. They use
absolute sandbox paths, require separate `puppeteer-core`, `@sparticuz/chromium`,
`@axe-core/puppeteer`, built NSPR/isolated NSS and a Noto Sans Devanagari font in
Fontconfig, plus a freshly seeded synthetic PostgreSQL database and production-mode app.
Do not point them at production: the workflow harness writes, deletes and confirms
synthetic records. The long-print and long-label experiments mutate the DOM in memory
only. They do not represent physical-print or actual screen-reader testing.
