# QA-4 Devanagari font — proposed implementation, NOT authorized

## Decision and scope

Owner has approved the requirement that Hindi and Marathi be readable without installed system Devanagari fonts; this is **not** approval to implement. Recommend evaluating a broad, self-hosted Noto Sans Devanagari WOFF2, not a catalog-only subset. A-3.2 is **NOT ACCEPTED**. No new font assets, application code, CSS, dependencies, or localization have been changed in this follow-up.

Current `web/src/app/layout.tsx` loads local Inter variable (352,240 bytes, SHA-256 `693b77d4f32ee9b8bfc995589b5fad5e99adf2832738661f5402f9978429a8e3`); FreeType found zero mappings in U+0900–097F. `web/src/app/globals.css` puts Inter first on screen and names system `Noto Sans Devanagari` for `#print-summary[lang]`, without shipping it. The print selector also applies to English summaries. Glyph fallback therefore depends on the machine today.

## Source and licence

Candidate authoritative source: [Google Fonts Noto Sans Devanagari metadata](https://github.com/google/fonts/blob/2bc5d431b584d89e646214bf6cfa75494e76ceea/ofl/notosansdevanagari/METADATA.pb), which identifies upstream commit `e123d230c160ebe949d731cc19017cdb354180d1` and release `NotoSansDevanagari-v2.007`; pin an exact source file and independently verify its provenance and SHA-256 before use. Metadata lists wght 100–900 and wdth 62.5–100 and hi/mr support. The [upstream OFL](https://github.com/google/fonts/blob/2bc5d431b584d89e646214bf6cfa75494e76ceea/ofl/notosansdevanagari/OFL.txt) credits Copyright 2022 The Noto Project Authors and SIL OFL 1.1; redistribution/modification/embedding permitted with copyright and full license included, no font sold alone, derivative remains OFL, reserved names respected. The displayed copyright header declares no reserved name; verify the license and any reserved names for the **exact** candidate. OFL applies to the font, not documents made with it. No legal sign-off claimed.

## Inventory and coverage policy

`node qa-evidence/qa4/glyph-inventory.cjs` extracts actual untranslated-as-stored hi/mr catalog values: 212 each, 58/57 U+0900–097F code points, union 62; 53/69 simple consonant-virama-consonant patterns. Categories are heuristics, not evidence of all runtime pathways: per language 32 validation/error, 15 medication/allergy/condition and 25 print-tagged entries. The patient category currently covers all 212 values because all three catalog namespaces are tagged; not a separate completeness assertion. JSON includes original strings, per-entry points, examples, and marks such as nukta, vowel signs, virama and anusvara.

`node qa-evidence/qa4/source-inventory.cjs` scans 185 non-test source files including `legal-i18n.ts` (both dynamic retention branches) and the language switcher; three have literal Devanagari and union is 63 code points (U+0972 beyond the hi/mr catalog union). It conservatively includes source comments and noncatalog text; it is not a parser or runtime text oracle. Neither inventory covers escaped/generated strings, Intl formatting, remote data, arbitrary patient-entered names, diagnoses, medication/allergy descriptions, numbers, diacritics, or future translations. The simple regex misses many multi-consonant and nonstandard conjuncts; no code-point listing guarantees shaping. Do not limit clinical user input to the inventory.

Baseline candidate coverage: U+0900–097F plus join controls U+200C/U+200D, dotted circle U+25CC, rupee U+20B9 and appropriate space/punctuation; also evaluate U+A8E0–A8FF, U+1CD0–1CFF and later Devanagari extensions against agreed orthographies and the source cmap. Some range positions may be unassigned or unsupported; join controls need shaping behavior, not necessarily ordinary cmap glyphs. Report each missing **required assigned** character explicitly; never infer support merely from requested ranges. Preserve variable axes as needed and GSUB/GPOS/GDEF, layout closure and language-specific shaping. Test composed/decomposed nukta, matras, reph, rakar, ZWJ/ZWNJ and conjuncts. This baseline does not guarantee arbitrary Unicode or every Devanagari orthography: agree supported languages and fallback/failure handling.

## Alternatives and measurements

| Candidate | Coverage and risk | Measured size/status |
|---|---|---|
| Full authoritative WOFF2 conversion | Broadest source coverage; simplest comparison, highest likely transfer; source itself may lack characters. | **Not generated or measured.** Historical local full TTF was 641,944 bytes, not WOFF2. |
| CityCare hi/mr catalog-only subset | Small potential size but cannot safely cover patient text, normalization or future content; not recommended for deployment. | **Not generated or measured.** |
| Broad Devanagari subset with shaping closure | Recommended candidate subject to source-cmap, size and visual validation; still cannot cover arbitrary scripts. | **Not generated or measured.** |

An unrelated public Fontsource v5.3.0 reference WOFF2 is 121,192 bytes (118.35 KiB), Git blob SHA-1 `33bd8312b0a31f3bbc0303d3d309f40a60054f85`; it is neither our build nor a verified comparison. There is no full-vs-subset size result or new subset rendering result. Fresh environment has no authoritative font, fontTools/Brotli, browser or PDF tooling; installation/dependencies are outside current authorization.

### Repeatable future measurement protocol (not run)

In an isolated, authorized environment with pinned, independently checked source and preapproved pinned fontTools + Brotli versions, place input and outputs in a private temporary directory, never in app source. Record source URL, upstream commit, input SHA-256, license and versions. Generate a UTF-8 catalog text fixture from `glyph-inventory.json` hi/mr values (including both locales; no patient data). Then, using `fonttools` already installed there:

```sh
# Full WOFF2 conversion, without deliberately subsetting glyphs
python3 - "$SOURCE_TTF" "$TMP/full.woff2" <<'PY'
from fontTools.ttLib import TTFont
import sys
font=TTFont(sys.argv[1]); font.flavor='woff2'; font.save(sys.argv[2])
PY
fonttools subset "$SOURCE_TTF" --text-file="$TMP/catalog.txt" --flavor=woff2 --layout-features='*' --output-file="$TMP/catalog.woff2"
fonttools subset "$SOURCE_TTF" --unicodes='U+0900-097F,U+1CD0-1CFF,U+A8E0-A8FF,U+2000-206F,U+20B9,U+25CC' --flavor=woff2 --layout-features='*' --output-file="$TMP/broad.woff2"
wc -c "$SOURCE_TTF" "$TMP/full.woff2" "$TMP/catalog.woff2" "$TMP/broad.woff2"
sha256sum "$SOURCE_TTF" "$TMP/full.woff2" "$TMP/catalog.woff2" "$TMP/broad.woff2"
```

`$SOURCE_TTF` and `$TMP` are operator-supplied paths; set them first and ensure they are outside the repo. Include space/Latin in the catalog fixture where present; broad file relies on Inter for Latin. FontTools defaults may silently ignore missing Unicode: compare `getBestCmap()` to the agreed required assigned list separately, distinguish controls/unassigned code points, inspect tables and axes, and fail on missing required coverage. Preserve default layout closure (do not use `--no-layout-closure`); verify retained GSUB/GPOS/GDEF and rendering, not just table presence. Record fontTools/Brotli versions, command, hashes, raw bytes and actual network transfer in the target build; repeat to assess reproducibility. See [fontTools subset documentation](https://fonttools.readthedocs.io/en/latest/subset/).

## Proposed change set — only after separate authorization

1. Add `web/src/app/fonts/NotoSansDevanagari-CityCare.woff2` and `web/src/app/fonts/NotoSansDevanagari-OFL.txt` with full applicable license and copyright; record immutable upstream version, exact input/output hashes, generation flags and tool versions in a font provenance document at `web/src/app/fonts/NotoSansDevanagari-PROVENANCE.md`. File names are proposals, not existing files. Prefer full source if broad subset cannot satisfy coverage/shaping.
2. Adjust `web/src/app/layout.tsx` and/or `web/src/app/globals.css` to register a local variable `@font-face`/`next/font/local`, with Inter first and Noto as Devanagari fallback; test English pages, glyph fallback for Hindi/Marathi content even when UI locale is English, language-switcher options, and mixed script. Consider `unicode-range` to avoid an English-only request but validate join controls/marks and actual network behavior. Avoid claiming route-only loading from a root declaration. Restrict selectors as appropriate to the patient UI and patient print summary; do not accidentally change doctor/admin/public or English print. Resolve existing print selector precedence. Verify font weight/axis configuration, font-style, source self-hosting, correct `lang` and print availability.
3. Decide `font-display` policy based on measured layout and clinical readability: `swap` may briefly show boxes; `block` can hide text; do not silently print a failed font. Explicitly test loaded, delayed, blocked and failed requests. Any print gate/error/retry UX requires design and accessibility review; `document.fonts.ready` alone does not prove a font successfully loaded or every character is covered. Do not hide or delete clinical content as a fallback. Establish explicit unsupported-script and unavailable-font behavior with the owner.
4. Same-origin immutable fingerprinted font asset, no third-party runtime requests; test CSP/headers and cache in the deployment. Cache is performance, not a confidentiality boundary. Never put patient data in a font URL or telemetry. No new service worker is proposed: previously loaded asset may work offline while retained in cache, but first-load offline or an evicted asset is **not guaranteed**. Offline patient-record availability/security is a separate product decision; do not cache health records as a side effect.
5. Proposed budget, subject to owner approval: broad WOFF2 raw <= 150 KiB (153,600 bytes), no strict cap until measured and coverage takes precedence; compare full and subset raw and actual cold/warm transferred bytes, requests, load time, CLS and build cost. If over budget, report options rather than silently reduce coverage. We do not know whether this target is achievable.

## Verification and acceptance gates

Use isolated synthetic records, not production/shared data or schema-changing full E2E. Test the agreed real browser/device matrix (at minimum owner-approved recent Chromium, Firefox and Safari/iOS plus Android), English/Hindi/Marathi, normal and zoomed/narrow screens, weights and long/mixed strings, fresh no-Devanagari host, system fallback, forced controlled full Noto and candidate subset. Browser font inspector/network should show actual font use and same-origin-only requests; include delay/failure and warmed/empty cache tests. Do not use a system font to mask subset misses. Capture before/after screens and A4 **and** Letter PDFs with critical synthetic markers, names, allergies, medications and clinical headings on every page. Manually review conjuncts, mark positions, clipping and pagination with qualified Hindi/Marathi reviewers; extraction/search/order is a separate check and cannot substitute for visual review. Native print preview and physical print are separate checks. Test keyboard, zoom, contrast and actual screen readers in the agreed matrix; do not imply one was tested if it wasn't. Run appropriate unit/type/lint/build and targeted non-schema-mutating integration tests. Check third-party requests, CSP, CSP failure, license distribution, hash/provenance and performance budgets.

Acceptance needs owner approval of scope/matrix/failure policy and budget, independently verified source/licence, required coverage and shaping, readable patient screens/print without system fonts, no critical content loss, accessibility and privacy regressions resolved, and documented evidence/sign-off. A-3.2 remains NOT ACCEPTED until then.

## Rollback and risks

If regressions arise after a separately approved deployment, revert only that deployment's font/CSS/print gating changes and redeploy the previously known version through the authorized release process; retain incident and provenance records, verify cache/version behavior. Rollback returns the known no-system-font tofu defect, so inform the owner and use an approved mitigation rather than claiming the requirement remains met. Risks include incomplete Unicode coverage, shaping differences across engines, flashes/print before load, layout shifts and pagination, cache eviction, offline failures, larger payload and license/provenance drift. No deploy or rollback has occurred.

## Owner decisions still needed

Separate authorization to implement; supported orthographies/scripts and browser/device/accessibility matrix; print and font-load failure handling; offline expectations; performance budget and whether broader/full font is preferred when budget conflicts with clinical coverage; and security-incident ownership and closure criteria.
