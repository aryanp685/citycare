# QA-2 synthetic browser verification

All records, filenames and readings in these files are synthetic. `matrix.json` is the
final 18-combination run; `matrix-initial.json` retains the exploratory run that found
the 768px long-reading overflow, and includes one 1280px Hindi harness timeout. The
later `matrix-wrap-before-selection.json` reflects an intermediate fix, not the final
build. Screenshots `records-{locale}-{width}.png` are final, with a long selected
reading, a long filename uploaded, and an injected trend error; 1280 uses 900px height,
others 844px. `initial-overflow-en-768.png` shows the earlier 768px failure.

`long-text-bounds.json` checks the original 60-character synthetic reading name in
chart, recent list and visible full-selected-value hint. `nav-wheel.json` tests native
horizontal wheel scrolling; `matrix.json` records 35 real Tab steps per combination,
including the known navigation-focus and native-date caveats. `desktop-comparison.json`
records 1280px same-DOM geometry with the final wrap classes and with those classes
temporarily removed, with long QA rows hidden in both; the matching screenshot pairs
are controlled comparisons, not a separately deployed prior build. English/Hindi
image bytes were not identical on the last run even though measured boxes matched;
compare visually rather than treating those as pixel-perfect.
`doctor-trend.json` and screenshot exercise a synthetic consented doctor view; unit
tests additionally compare patient/doctor component markup.

The `.cjs` files are QA harnesses, not application dependencies. They use absolute
sandbox paths and a local synthetic database; the matrix uploads/deletes documents and
creates readings. Do not run them against production or shared data. Fault-injected
HTTP 500s test presentation, not an actual outage. Chromium used test-only Noto Sans
Devanagari plus isolated NSS/NSPR and insecure serverless flags, so it is not a browser
security-enforcement test. No native operating-system file picker, physical device or
actual screen reader was exercised.
