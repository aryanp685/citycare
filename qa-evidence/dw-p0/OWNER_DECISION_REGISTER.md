# DW-P0 owner decision register

**Status: ALL APPROVALS PENDING. DW-P0-01 and DW-P0-02 remain OPEN / NOT ACCEPTED.**

Source of authority: `DESIGN_REVIEW.md`, especially §8, with detailed context in §§2–7. This is a decomposition of its decisions, not approval to implement. Each ID is independently decidable; related decisions are linked, not merged. Recommendations are advisory, not owner consent. “Both” means both DW-P0-01 and DW-P0-02; blockers describe conservative acceptance dependencies, not a claim that every implementation line depends on each decision. Alternate options that conflict with the stated in-flight semantics or acceptance requirements are included for technical comparison, not presented as compliant. No option authorizes a migration, deployment or modification by itself.

Risk shorthand: S = security; P = privacy; C = clinical; O = operational. Clinical recommendations require qualified clinical review; they are not medical advice. Time budgets, field matrices and actual migration need remain undecided. Dependencies list review inputs, not a mandatory approval sequence; some decisions must be resolved together.

## DW-OD-01 — When does a clinical operation become authorized relative to patient revocation?

- **Source:** design review §8.1.
- **Exact question:** When does a clinical operation become authorized relative to patient revocation?
- **Options and technical consequences:** A: after post-lock verification; prior authorized work finishes and revoke waits for commit/rollback. B: attempt to interrupt in-flight work, requiring cancellation infrastructure and different guarantees.
- **Risks:** S: stale access if lock/recheck incomplete; P: data may be read until revoke commits; C: interruption may disrupt care; O: contention and timeouts under A.
- **Recommendation (not approved):** A, with consent `FOR SHARE`, transaction-bound use, and revoke conflict; B does not satisfy the requested milestone policy.
- **Dependencies:** DW-OD-03, DW-OD-07, DW-OD-08.
- **Blocks:** DW-P0-01.
- **Owner approval:** PENDING — decision, approver, and date not provided.

## DW-OD-02 — May an operation authorized before consent expiry finish after the expiry instant?

- **Source:** design review §8.1.
- **Exact question:** May an operation authorized before consent expiry finish after the expiry instant?
- **Options and technical consequences:** A: yes, under its held authorization lock; B: cancel at expiry, requiring interruption and coordination that row locks cannot supply.
- **Risks:** S: post-expiry operations must not start; P: already prepared data may be delivered; C: interruption may lose a clinical write; O: A makes expiry admission-time, not completion-time.
- **Recommendation (not approved):** A, with fresh database-clock check after lock; B conflicts with the review target.
- **Dependencies:** DW-OD-01, DW-OD-31, DW-OD-32.
- **Blocks:** DW-P0-01.
- **Owner approval:** PENDING — decision, approver, and date not provided.

## DW-OD-03 — What must the response, download, signed-link and print boundary be once revocation commits?

- **Source:** design review §8.1.
- **Exact question:** What must the response, download, signed-link and print boundary be once revocation commits?
- **Options and technical consequences:** A: buffer protected output before commit, separately reauthorize download, allow transmission and already-delivered copies after commit. B: try to block network transfer or recall copies, requiring a different protocol and still unable to recall disclosed data.
- **Risks:** S: unrechecked links can bypass revocation; P: cached/downloaded/printed data cannot be recalled; C: withholding output can disrupt care; O: buffering/streaming costs and limits.
- **Recommendation (not approved):** A; no protected response before successful commit and no lazy post-commit protected query.
- **Dependencies:** DW-OD-01, DW-OD-08, DW-OD-35, DW-OD-37.
- **Blocks:** Both.
- **Owner approval:** PENDING — decision, approver, and date not provided.

## DW-OD-04 — What lock-wait, statement-timeout and user-facing failure limits are acceptable for protected operations and revocation?

- **Source:** design review §8.1.
- **Exact question:** What lock-wait, statement-timeout and user-facing failure limits are acceptable for protected operations and revocation?
- **Options and technical consequences:** A: explicitly bounded waits and safe failure, chosen after isolated load tests; B: long/unbounded waits to favor completion, risking stalled requests and connection exhaustion.
- **Risks:** S: long-held locks increase denial-of-service exposure; P: premature success could mislead withdrawal; C: failed writes require explicit retry by user; O: timeouts reduce availability.
- **Recommendation (not approved):** A; owner to set numerical budgets after measurement, and never report a timed-out revoke as committed.
- **Dependencies:** DW-OD-01, DW-OD-08, DW-OD-40.
- **Blocks:** DW-P0-01.
- **Owner approval:** PENDING — decision, approver, and date not provided.

## DW-OD-05 — How should the user be informed and the system reconcile a database connection loss during COMMIT?

- **Source:** design review §8.1.
- **Exact question:** How should the user be informed and the system reconcile a database connection loss during COMMIT?
- **Options and technical consequences:** A: state outcome unknown, reconcile from durable evidence before retry. B: claim failure or automatically replay, risking a duplicate committed write.
- **Risks:** S: duplicate/replayed operations; P: misleading receipt or disclosure; C: duplicate clinical records; O: reconciliation may require support or idempotency work.
- **Recommendation (not approved):** A; do not claim rollback or automatically replay non-idempotent writes.
- **Dependencies:** DW-OD-04, DW-OD-38, DW-OD-41.
- **Blocks:** DW-P0-01.
- **Owner approval:** PENDING — decision, approver, and date not provided.

## DW-OD-06 — Should doctor verification rejection and suspension serialize with all protected clinical operations, including document link and download?

- **Source:** design review §8.2.
- **Exact question:** Should doctor verification rejection and suspension serialize with all protected clinical operations, including document link and download?
- **Options and technical consequences:** A: lock and recheck doctor status for every protected operation; admin status updates wait. B: retain point-in-time checks, leaving an in-flight suspension race and existing document gap.
- **Risks:** S: B permits stale verified status; P: unauthorized disclosure after suspension; C: delayed care during status update; O: A adds lock contention and requires reordered admin review.
- **Recommendation (not approved):** A, subject to a complete lock-order proof and no weakening of current role gates.
- **Dependencies:** DW-OD-01, DW-OD-07, DW-OD-08.
- **Blocks:** DW-P0-01.
- **Owner approval:** PENDING — decision, approver, and date not provided.

## DW-OD-07 — What shared ordering and synchronization should cover consent creation, replacement, auto-revocation, bulk erasure and doctor status changes?

- **Source:** design review §8.2.
- **Exact question:** What shared ordering and synchronization should cover consent creation, replacement, auto-revocation, bulk erasure and doctor status changes?
- **Options and technical consequences:** A: approve a proven global lock graph, including stable missing-pair and bulk-erasure gates; B: lock only existing consent rows, which cannot serialize absence or new grants during bulk enumeration.
- **Risks:** S: incomplete protocol allows bypass; P: erasure can miss new access; C: deadlock/victim rollback may interrupt care; O: A requires all writers and FK/trigger analysis.
- **Recommendation (not approved):** A; select pair/gate mechanics only after proving all writers, sorted bulk ordering and ledger-last ordering.
- **Dependencies:** DW-OD-01, DW-OD-06, DW-OD-25, DW-OD-26, DW-OD-40, DW-OD-43.
- **Blocks:** DW-P0-01.
- **Owner approval:** PENDING — decision, approver, and date not provided.

## DW-OD-08 — What guarantees should apply to session revocation and patient or doctor account deactivation beyond the consent lock?

- **Source:** design review §8.2.
- **Exact question:** What guarantees should apply to session revocation and patient or doctor account deactivation beyond the consent lock?
- **Options and technical consequences:** A: define and serialize selected account/session status checks; B: keep existing independent session checks and explicitly limit guarantee to consent.
- **Risks:** S: B may admit a previously validated session; P: deactivated identities may retain in-flight access; C: account closure can interrupt care; O: A expands lock graph and testing.
- **Recommendation (not approved):** A for verified-doctor status; explicitly threat-model patient/session behavior and approve any narrower guarantee rather than imply it.
- **Dependencies:** DW-OD-06, DW-OD-07, DW-OD-04.
- **Blocks:** DW-P0-01.
- **Owner approval:** PENDING — decision, approver, and date not provided.

## DW-OD-09 — For each consent scope, which patient demographics, ABHA identifier and guardian details may a doctor view or print?

- **Source:** design review §8.3.
- **Exact question:** For each consent scope, which patient demographics, ABHA identifier and guardian details may a doctor view or print?
- **Options and technical consequences:** A: explicit field-level matrix for each scope and print; B: allow current unconditional print demographics, including ABHA, whenever any scope is live.
- **Risks:** S: overbroad fields create access surface; P: identifiers and guardian information may be disclosed; C: insufficient context can impair care; O: A requires UX and scope tests.
- **Recommendation (not approved):** A, minimum necessary with owner and clinical review; exact fields remain undecided.
- **Dependencies:** DW-OD-11, DW-OD-12, DW-OD-13, DW-OD-16.
- **Blocks:** DW-P0-02.
- **Owner approval:** PENDING — decision, approver, and date not provided.

## DW-OD-10 — Which allergy, condition and medication safety facts are authorized in each narrow scope?

- **Source:** design review §8.3.
- **Exact question:** Which allergy, condition and medication safety facts are authorized in each narrow scope?
- **Options and technical consequences:** A: explicitly approve each safety section per scope; B: include all as current filtering does without confirming consent meaning; C: exclude and refuse writes that need missing facts.
- **Risks:** S: unapproved safety facts may leak via rules; P: broad safety access may exceed patient expectations; C: missing facts can cause unsafe prescribing; O: C can delay consultation.
- **Recommendation (not approved):** A with clinical review; use C for any write whose essential inputs are not authorized.
- **Dependencies:** DW-OD-11, DW-OD-12, DW-OD-13, DW-OD-16.
- **Blocks:** DW-P0-02.
- **Owner approval:** PENDING — decision, approver, and date not provided.

## DW-OD-11 — What fields and rows should SUMMARY_ONLY authorize before retrieval and safety processing?

- **Source:** design review §8.3.
- **Exact question:** What fields and rows should SUMMARY_ONLY authorize before retrieval and safety processing?
- **Options and technical consequences:** A: retain currently filtered safety sections only if separately approved, with no episodic data; B: narrower or broader matrix explicitly agreed by owner and clinician.
- **Risks:** S: overbroad query results expose data; P: summaries can disclose hidden facts; C: too-narrow inputs may miss warnings; O: changes require regression tests.
- **Recommendation (not approved):** A only after 09 and 10 approvals; never silently widen.
- **Dependencies:** DW-OD-09, DW-OD-10, DW-OD-15.
- **Blocks:** DW-P0-02.
- **Owner approval:** PENDING — decision, approver, and date not provided.

## DW-OD-12 — For LAST_N_ENCOUNTERS, what N, ordering, tie-breaks, limits and linked-row rules should determine the shared record?

- **Source:** design review §8.3.
- **Exact question:** For LAST_N_ENCOUNTERS, what N, ordering, tie-breaks, limits and linked-row rules should determine the shared record?
- **Options and technical consequences:** A: explicitly specify bounded N, deterministic selection and linked rows; B: reproduce current slicing/limits without resolving ambiguous ties.
- **Risks:** S: ambiguous ordering may select an unintended encounter; P: extra clinical history can leak; C: omitted relevant history affects care; O: deterministic results require query changes.
- **Recommendation (not approved):** A, preserving intended source values and existing behavior where safely specified; owner approve precise limits.
- **Dependencies:** DW-OD-10, DW-OD-14, DW-OD-15.
- **Blocks:** DW-P0-02.
- **Owner approval:** PENDING — decision, approver, and date not provided.

## DW-OD-13 — For SPECIFIC_CONDITION, how may encounters be matched and which linked data are shared?

- **Source:** design review §8.3.
- **Exact question:** For SPECIFIC_CONDITION, how may encounters be matched and which linked data are shared?
- **Options and technical consequences:** A: match inside PostgreSQL and return only matched encounters and authorized linked rows; B: prohibit even database predicate evaluation of unrelated text, requiring a different approved data model; C: load all and filter in the app.
- **Risks:** S: C exposes unrelated rows to app; P: B gives strongest evaluation boundary but needs new model; C: incomplete matches can omit pertinent history; O: A still evaluates candidate fields inside DB.
- **Recommendation (not approved):** A only if owner explicitly permits DB predicate evaluation; fail closed on empty/malformed condition, never C.
- **Dependencies:** DW-OD-10, DW-OD-15, DW-OD-27.
- **Blocks:** DW-P0-02.
- **Owner approval:** PENDING — decision, approver, and date not provided.

## DW-OD-14 — Should unlinked labs, observations and nullable encounter-linked prescriptions be visible under LAST_N_ENCOUNTERS?

- **Source:** design review §8.3.
- **Exact question:** Should unlinked labs, observations and nullable encounter-linked prescriptions be visible under LAST_N_ENCOUNTERS?
- **Options and technical consequences:** A: retain current filter behavior for unlinked entries; B: exclude unlinked entries absent a specific authorization.
- **Risks:** S: unlinked rows can bypass an intended encounter window; P: unrelated results may be exposed; C: excluding results can omit relevant warnings; O: B changes current behavior.
- **Recommendation (not approved):** B until explicitly authorized by patient-facing scope and clinical review; do not silently reclassify.
- **Dependencies:** DW-OD-12, DW-OD-15.
- **Blocks:** DW-P0-02.
- **Owner approval:** PENDING — decision, approver, and date not provided.

## DW-OD-15 — Should SPECIFIC_DOCUMENTS be implemented using existing documentIds, or continue to fail closed?

- **Source:** design review §8.3.
- **Exact question:** Should SPECIFIC_DOCUMENTS be implemented using existing documentIds, or continue to fail closed?
- **Options and technical consequences:** A: keep unsupported/empty and deny document access; B: implement explicit selected-document semantics and validate selection on link and download.
- **Risks:** S: B adds per-file authorization attack surface; P: wrong file IDs disclose documents; C: withholding reports may impair care; O: B may need schema/retention review and new tests.
- **Recommendation (not approved):** A for smallest remediation unless owner separately approves B with full safeguards.
- **Dependencies:** DW-OD-09, DW-OD-13, DW-OD-27, DW-OD-43.
- **Blocks:** DW-P0-02.
- **Owner approval:** PENDING — decision, approver, and date not provided.

## DW-OD-16 — Must a restricted clinical write be refused when essential safety inputs are not authorized?

- **Source:** design review §8.3.
- **Exact question:** Must a restricted clinical write be refused when essential safety inputs are not authorized?
- **Options and technical consequences:** A: refuse with generic broader-access-needed message; B: query hidden facts to run safety rules; C: permit write with incomplete checks.
- **Risks:** S: B violates scope; C weakens safety assurance; P: B can leak hidden warning details; C: C risks missed conflicts; O: A can delay care.
- **Recommendation (not approved):** A, with clinician-defined essential inputs and no claim of comprehensive rule coverage.
- **Dependencies:** DW-OD-10, DW-OD-11, DW-OD-12, DW-OD-13, DW-OD-14.
- **Blocks:** DW-P0-02.
- **Owner approval:** PENDING — decision, approver, and date not provided.

## DW-OD-17 — After withdrawal, may doctors see appointment reasons independently of record consent?

- **Source:** design review §8.4.
- **Exact question:** After withdrawal, may doctors see appointment reasons independently of record consent?
- **Options and technical consequences:** A: hide reason unless explicitly authorized for an independent appointment purpose; B: retain existing own-appointment reason visibility.
- **Risks:** S: B can expose health information outside the boundary; P: reason may reveal sensitive facts; C: hiding may hinder scheduling/triage; O: A changes dashboard behavior.
- **Recommendation (not approved):** A, after owner defines any independent lawful purpose and tests access separately.
- **Dependencies:** DW-OD-23, DW-OD-24.
- **Blocks:** Both.
- **Owner approval:** PENDING — decision, approver, and date not provided.

## DW-OD-18 — After withdrawal, may doctors see dates of their own prior consultations?

- **Source:** design review §8.4.
- **Exact question:** After withdrawal, may doctors see dates of their own prior consultations?
- **Options and technical consequences:** A: hide last-consultation date unless independently authorized; B: retain existing own-encounter date in directory.
- **Risks:** S: metadata can reveal care relationship; P: dates may reveal visits and patterns; C: removal may hinder continuity; O: A changes directory expectations.
- **Recommendation (not approved):** A by default; approve independent-purpose exception explicitly if needed.
- **Dependencies:** DW-OD-23, DW-OD-24.
- **Blocks:** Both.
- **Owner approval:** PENDING — decision, approver, and date not provided.

## DW-OD-19 — After withdrawal, may doctors see their own activity history with patient names, action types and times?

- **Source:** design review §8.4.
- **Exact question:** After withdrawal, may doctors see their own activity history with patient names, action types and times?
- **Options and technical consequences:** A: minimize or hide patient-linked activity unless separately authorized; B: retain current own-actor activity and relationship metadata.
- **Risks:** S: activity can reveal past access; P: names, actions and timestamps are sensitive; C: clinicians may need accountable history; O: A may reduce audit usability.
- **Recommendation (not approved):** A with a separately reviewed minimal accountability view if necessary.
- **Dependencies:** DW-OD-23, DW-OD-35, DW-OD-37.
- **Blocks:** Both.
- **Owner approval:** PENDING — decision, approver, and date not provided.

## DW-OD-20 — After withdrawal, may doctors retain access to existing patient-related notifications?

- **Source:** design review §8.4.
- **Exact question:** After withdrawal, may doctors retain access to existing patient-related notifications?
- **Options and technical consequences:** A: classify and minimize/suppress patient-linked content on withdrawal; B: retain existing user-owned notification inbox.
- **Risks:** S: historical notifications can bypass scope; P: messages can contain clinical or identity details; C: suppression may hide care-relevant notices; O: A requires producer and retention review.
- **Recommendation (not approved):** A with explicit independent-purpose exceptions and tests.
- **Dependencies:** DW-OD-23, DW-OD-37.
- **Blocks:** Both.
- **Owner approval:** PENDING — decision, approver, and date not provided.

## DW-OD-21 — After withdrawal, which connected-patient identifiers and guardian details may remain visible in dashboard, directory and workspace?

- **Source:** design review §8.4.
- **Exact question:** After withdrawal, which connected-patient identifiers and guardian details may remain visible in dashboard, directory and workspace?
- **Options and technical consequences:** A: explicit per-surface minimum necessary fields and independent relationship basis; B: retain current any-appointment-or-historical-consent identifiers.
- **Risks:** S: B offers an enumeration surface; P: identity/guardian relationship may be exposed; C: hiding legitimate connections can hinder care; O: A changes search and navigation.
- **Recommendation (not approved):** A, default deny fields without an approved independent purpose.
- **Dependencies:** DW-OD-09, DW-OD-17, DW-OD-18, DW-OD-19, DW-OD-20, DW-OD-24.
- **Blocks:** Both.
- **Owner approval:** PENDING — decision, approver, and date not provided.

## DW-OD-22 — Should reads of independently authorized appointment, directory, activity or notification metadata be audited?

- **Source:** design review §8.4.
- **Exact question:** Should reads of independently authorized appointment, directory, activity or notification metadata be audited?
- **Options and technical consequences:** A: audit defined sensitive metadata reads with minimum metadata; B: no per-read audit, retaining current behavior.
- **Risks:** S: unlogged access reduces detection; P: audit payload itself can leak; C: excessive logging may obscure safety issues; O: auditing adds ledger load and availability dependency.
- **Recommendation (not approved):** A for owner-classified sensitive reads, with failure behavior explicitly decided.
- **Dependencies:** DW-OD-17, DW-OD-18, DW-OD-19, DW-OD-20, DW-OD-21, DW-OD-35, DW-OD-37.
- **Blocks:** Both.
- **Owner approval:** PENDING — decision, approver, and date not provided.

## DW-OD-23 — What independent-purpose and retention policy authorizes metadata after clinical-consent withdrawal?

- **Source:** design review §8.4.
- **Exact question:** What independent-purpose and retention policy authorizes metadata after clinical-consent withdrawal?
- **Options and technical consequences:** A: enumerate purposes, fields, retention and authorization separately; B: treat all historical relationship data as automatically available.
- **Risks:** S: implicit basis broadens access; P: long-lived metadata reveals relationships; C: removal may impair continuity; O: A requires governance and review.
- **Recommendation (not approved):** A, including clinical and privacy review; do not use clinical consent as a catch-all.
- **Dependencies:** DW-OD-17, DW-OD-18, DW-OD-19, DW-OD-20, DW-OD-21.
- **Blocks:** Both.
- **Owner approval:** PENDING — decision, approver, and date not provided.

## DW-OD-24 — How should error/status responses avoid patient or document existence oracles while preserving legitimate workflows?

- **Source:** design review §8.4.
- **Exact question:** How should error/status responses avoid patient or document existence oracles while preserving legitimate workflows?
- **Options and technical consequences:** A: uniform public response for nonexistent and unauthorized resources, with limited authorized diagnostics; B: differentiated 403/404 and detailed reasons.
- **Risks:** S: B enables resource enumeration; P: errors can disclose identity or scope; C: over-generic errors may impede urgent care; O: A needs UI and HTTP regression tests.
- **Recommendation (not approved):** A for untrusted callers, with non-sensitive diagnostics where properly authorized.
- **Dependencies:** DW-OD-17, DW-OD-21, DW-OD-34.
- **Blocks:** Both.
- **Owner approval:** PENDING — decision, approver, and date not provided.

## DW-OD-25 — How should cancellation of an unapproved pending request be represented and audited?

- **Source:** design review §8.5.
- **Exact question:** How should cancellation of an unapproved pending request be represented and audited?
- **Options and technical consequences:** A: truthful cancellation event/status or agreed representation distinct from natural expiry and approval revocation; B: keep labeling cancellation EXPIRED or REVOKED.
- **Risks:** S: misleading state impairs enforcement; P: misleading history obscures who consented; C: confusion can delay care; O: A may need compatibility or migration review.
- **Recommendation (not approved):** A; preserve legacy records without retroactively inventing events.
- **Dependencies:** DW-OD-27, DW-OD-28, DW-OD-29.
- **Blocks:** Both.
- **Owner approval:** PENDING — decision, approver, and date not provided.

## DW-OD-26 — How should emergency access supersede a pending request without falsely labeling it expired?

- **Source:** design review §8.5.
- **Exact question:** How should emergency access supersede a pending request without falsely labeling it expired?
- **Options and technical consequences:** A: truthful supersession event/state, preserving request and emergency identity; B: current EXPIRED labeling.
- **Risks:** S: B blurs emergency authority; P: inaccurate consent history; C: emergency delay affects care; O: A may require state/schema work.
- **Recommendation (not approved):** A, with emergency review and patient notification maintained.
- **Dependencies:** DW-OD-25, DW-OD-27, DW-OD-44.
- **Blocks:** Both.
- **Owner approval:** PENDING — decision, approver, and date not provided.

## DW-OD-27 — Are new events, enum states, columns or a schema migration necessary for cancellation, supersession, decision times, scope revision, durable expiry or per-document grants?

- **Source:** design review §8.5.
- **Exact question:** Are new events, enum states, columns or a schema migration necessary for cancellation, supersession, decision times, scope revision, durable expiry or per-document grants?
- **Options and technical consequences:** A: use existing model only where semantics remain truthful; B: propose smallest separately reviewed migration where it cannot represent the chosen behavior.
- **Risks:** S: workarounds may weaken enforcement; P: ambiguous data misrepresents decisions; C: unsafe scope revisions can affect safety; O: B entails compatibility, rollback and isolated migration tests.
- **Recommendation (not approved):** A where sufficient; if B is necessary document and seek separate authorization before any migration.
- **Dependencies:** DW-OD-09, DW-OD-15, DW-OD-25, DW-OD-26, DW-OD-28, DW-OD-29, DW-OD-32.
- **Blocks:** Both.
- **Owner approval:** PENDING — decision, approver, and date not provided.

## DW-OD-28 — How should a denial timestamp be recorded without implying an approval was revoked?

- **Source:** design review §8.5.
- **Exact question:** How should a denial timestamp be recorded without implying an approval was revoked?
- **Options and technical consequences:** A: use a distinct truthful denial event/time (existing audit if sufficient, otherwise separately approved model); B: retain current `revokedAt` convention with an explicit caveat.
- **Risks:** S: misleading fields can cause wrong state interpretation; P: denial may appear as prior permission; C: clinicians may misread access history; O: A needs consumers and data compatibility review.
- **Recommendation (not approved):** A; no invented approval or rewritten history.
- **Dependencies:** DW-OD-25, DW-OD-27, DW-OD-29.
- **Blocks:** Both.
- **Owner approval:** PENDING — decision, approver, and date not provided.

## DW-OD-29 — How should legacy REQUESTED rows marked REVOKED or EXPIRED be presented and preserved?

- **Source:** design review §8.5.
- **Exact question:** How should legacy REQUESTED rows marked REVOKED or EXPIRED be presented and preserved?
- **Options and technical consequences:** A: retain rows and ledger, show historical ambiguity and reason where supported; B: rewrite or infer prior decisions.
- **Risks:** S: B risks audit tampering; P: false history misstates patient intent; C: care teams may misinterpret access; O: A may require explanatory UI and support.
- **Recommendation (not approved):** A; do not rewrite evidence or assert an approval that did not occur.
- **Dependencies:** DW-OD-25, DW-OD-26, DW-OD-28.
- **Blocks:** Both.
- **Owner approval:** PENDING — decision, approver, and date not provided.

## DW-OD-30 — How should requested scope and the different scope approved by the patient be preserved as distinct historical facts?

- **Source:** design review §8.5.
- **Exact question:** How should requested scope and the different scope approved by the patient be preserved as distinct historical facts?
- **Options and technical consequences:** A: preserve request and approval through truthful audit evidence, with separately approved schema only if necessary; B: retain current row overwrite and accept incomplete reconstruction.
- **Risks:** S: B reduces ability to verify authority; P: requested versus granted data may be confused; C: misunderstood access can affect care; O: A requires history and compatibility tests.
- **Recommendation (not approved):** A without fabricating missing historical values.
- **Dependencies:** DW-OD-27, DW-OD-29, DW-OD-37.
- **Blocks:** DW-P0-02.
- **Owner approval:** PENDING — decision, approver, and date not provided.

## DW-OD-31 — What trusted database time source and monitoring are required, especially if the clock moves backward?

- **Source:** design review §8.6.
- **Exact question:** What trusted database time source and monitoring are required, especially if the clock moves backward?
- **Options and technical consequences:** A: establish trusted clock and alert/fail-safe policy for anomalies; B: rely solely on `clock_timestamp()` without claiming monotonicity.
- **Risks:** S: time rollback can revive stored APPROVED state; P: renewed disclosure may violate expiry; C: fail-safe may block urgent care; O: monitoring and clock assumptions need operational ownership.
- **Recommendation (not approved):** A; check DB wall time after lock and document limits; no unsupported monotonicity claim.
- **Dependencies:** DW-OD-02, DW-OD-32, DW-OD-33, DW-OD-40.
- **Blocks:** DW-P0-01.
- **Owner approval:** PENDING — decision, approver, and date not provided.

## DW-OD-32 — Should an observed lapse be durably recorded and audited to prevent later revival after clock rollback?

- **Source:** design review §8.6.
- **Exact question:** Should an observed lapse be durably recorded and audited to prevent later revival after clock rollback?
- **Options and technical consequences:** A: atomically persist truthful EXPIRED under exclusive synchronization; B: derive expiry on each read only.
- **Risks:** S: B can revive a previously observed lapse on clock rollback; P: stale permission may expose data; C: blocked or revived care changes safety; O: A adds write contention and may need schema review.
- **Recommendation (not approved):** A if owner requires observed-expiry non-revival; it cannot guarantee behavior for an unobserved backward clock jump.
- **Dependencies:** DW-OD-02, DW-OD-07, DW-OD-27, DW-OD-31.
- **Blocks:** DW-P0-01.
- **Owner approval:** PENDING — decision, approver, and date not provided.

## DW-OD-33 — What guarantee is required for expiry if the clock jumps backward before any lapse was observed?

- **Source:** design review §8.6.
- **Exact question:** What guarantee is required for expiry if the clock jumps backward before any lapse was observed?
- **Options and technical consequences:** A: accept a documented trusted-clock assumption with monitoring and fail-safe; B: require stronger time guarantees with a separately designed trusted/monotonic mechanism.
- **Risks:** S: A cannot rule out revival during an unobserved rollback; P: access may extend beyond intended time; C: fail-safe may delay care; O: B needs additional infrastructure/design and authorization.
- **Recommendation (not approved):** A only if owner accepts the explicit residual risk; otherwise design B before acceptance.
- **Dependencies:** DW-OD-31, DW-OD-32, DW-OD-40.
- **Blocks:** DW-P0-01.
- **Owner approval:** PENDING — decision, approver, and date not provided.

## DW-OD-34 — Must successful clinical record and print reads be audited atomically with authorization and result construction?

- **Source:** design review §8.7.
- **Exact question:** Must successful clinical record and print reads be audited atomically with authorization and result construction?
- **Options and technical consequences:** A: mandatory audit in the same transaction; B: best effort or separate autocommit.
- **Risks:** S: B permits unaudited reads; P: missing patient transparency; C: blocked access under A can delay care; O: A makes ledger availability a dependency.
- **Recommendation (not approved):** A; do not send protected success if mandatory audit fails.
- **Dependencies:** DW-OD-01, DW-OD-03, DW-OD-36, DW-OD-37.
- **Blocks:** Both.
- **Owner approval:** PENDING — decision, approver, and date not provided.

## DW-OD-35 — Must document-link minting be audited atomically and fail closed when its audit cannot commit?

- **Source:** design review §8.7.
- **Exact question:** Must document-link minting be audited atomically and fail closed when its audit cannot commit?
- **Options and technical consequences:** A: transactional mandatory mint event; B: retain best-effort mint logging.
- **Risks:** S: B permits invisible issued links; P: audit omission reduces patient awareness; C: A can delay access to documents; O: A adds contention and error handling.
- **Recommendation (not approved):** A, with a truthful mint event rather than implying bytes were downloaded.
- **Dependencies:** DW-OD-03, DW-OD-36, DW-OD-38, DW-OD-39.
- **Blocks:** Both.
- **Owner approval:** PENDING — decision, approver, and date not provided.

## DW-OD-36 — Must actual document downloads be independently audited, and should mint and download be separate event meanings?

- **Source:** design review §8.7.
- **Exact question:** Must actual document downloads be independently audited, and should mint and download be separate event meanings?
- **Options and technical consequences:** A: separate mandatory mint and actual-download events in each authorization transaction; B: mint-only best-effort `DOWNLOAD_DOC`.
- **Risks:** S: B hides actual use and conflates attempts; P: inaccurate access history; C: audit outage may delay access to critical reports; O: A increases ledger volume.
- **Recommendation (not approved):** A; distinguish minted locator from actual data release without asserting network delivery.
- **Dependencies:** DW-OD-03, DW-OD-35, DW-OD-38.
- **Blocks:** Both.
- **Owner approval:** PENDING — decision, approver, and date not provided.

## DW-OD-37 — Must denied record, write and document attempts be recorded, and how should denial audit failure be handled?

- **Source:** design review §8.7.
- **Exact question:** Must denied record, write and document attempts be recorded, and how should denial audit failure be handled?
- **Options and technical consequences:** A: persist a minimal denial event independently or with a safe commit pattern; B: best effort denial logging with documented gap.
- **Risks:** S: B loses abuse evidence; P: logs may expose existence or scope; C: failing to return a denial during outage can hinder workflows; O: A needs commit-with-denial rather than throw-and-rollback.
- **Recommendation (not approved):** A with generic denial regardless of audit outcome and explicit safe operational alert if audit persistence fails.
- **Dependencies:** DW-OD-24, DW-OD-38, DW-OD-39.
- **Blocks:** Both.
- **Owner approval:** PENDING — decision, approver, and date not provided.

## DW-OD-38 — What minimal clinical-access, denial, mint and download audit metadata is permitted?

- **Source:** design review §8.7.
- **Exact question:** What minimal clinical-access, denial, mint and download audit metadata is permitted?
- **Options and technical consequences:** A: actor, action, patient/grant reference and scope/surface as needed, excluding hidden clinical facts; B: retain detailed drug/conflict/document metadata without further review.
- **Risks:** S: B increases log attack surface; P: payloads can leak restricted facts; C: over-minimization may reduce review context; O: A requires retention and incident-review balance.
- **Recommendation (not approved):** A, with explicit fields approved per event and tests against restricted canaries.
- **Dependencies:** DW-OD-09, DW-OD-10, DW-OD-34, DW-OD-35, DW-OD-36, DW-OD-37.
- **Blocks:** Both.
- **Owner approval:** PENDING — decision, approver, and date not provided.

## DW-OD-39 — What should happen during an audit outage for protected successes and separately for denied attempts?

- **Source:** design review §8.7.
- **Exact question:** What should happen during an audit outage for protected successes and separately for denied attempts?
- **Options and technical consequences:** A: fail closed for successful protected operations; return safe denial while recording/alerting an audit failure for denied attempts; B: allow best-effort success.
- **Risks:** S: B permits unauthorized or unaudited processing; P: unavailable evidence harms transparency; C: fail-closed may delay clinical access; O: monitoring and recovery runbooks are required.
- **Recommendation (not approved):** A; never convert an audit failure into a successful protected response.
- **Dependencies:** DW-OD-34, DW-OD-35, DW-OD-36, DW-OD-37, DW-OD-38.
- **Blocks:** Both.
- **Owner approval:** PENDING — decision, approver, and date not provided.

## DW-OD-40 — Should patient erasure continue even when its post-commit audit receipt fails, or become audit-atomic?

- **Source:** design review §8.7.
- **Exact question:** Should patient erasure continue even when its post-commit audit receipt fails, or become audit-atomic?
- **Options and technical consequences:** A: preserve current separately justified erasure-first policy with visible receipt failure; B: make erasure contingent on atomic audit, potentially blocking deletion.
- **Risks:** S: A can lose receipt evidence; P: B delays erasure rights; C: deletion may alter care records; O: either needs explicit monitoring and legal/owner review.
- **Recommendation (not approved):** A pending separate legal/owner review; do not silently change erasure policy as part of clinical read auditing.
- **Dependencies:** DW-OD-07, DW-OD-39.
- **Blocks:** Both.
- **Owner approval:** PENDING — decision, approver, and date not provided.

## DW-OD-41 — Are isolated, test-only transaction barriers and independent PostgreSQL connections approved for concurrency evidence?

- **Source:** design review §8.8.
- **Exact question:** Are isolated, test-only transaction barriers and independent PostgreSQL connections approved for concurrency evidence?
- **Options and technical consequences:** A: synthetic disposable DB and test-only hooks not shipped/exposed in production; B: generic lock tests or mocks only.
- **Risks:** S: leaked hooks could create a bypass; P: fixtures/logs must contain no real patient data; C: unproven races compromise safety; O: A needs controlled infrastructure and instrumentation.
- **Recommendation (not approved):** A, asserting real endpoint ordering via DB-observed blocking; B is insufficient.
- **Dependencies:** DW-OD-07, DW-OD-43.
- **Blocks:** Both.
- **Owner approval:** PENDING — decision, approver, and date not provided.

## DW-OD-42 — What resource and timeout limits are acceptable for isolated concurrency, HTTP and browser verification?

- **Source:** design review §8.8.
- **Exact question:** What resource and timeout limits are acceptable for isolated concurrency, HTTP and browser verification?
- **Options and technical consequences:** A: define bounded waits, concurrency and artifact limits from disposable-environment measurements; B: leave them unbounded.
- **Risks:** S: unbounded tests can exhaust services; P: excessive logging risks data exposure; C: timeouts can hide failed safety scenarios; O: A may require provisioning and measured thresholds.
- **Recommendation (not approved):** A; owner supplies or approves budgets after measurement, without weakening acceptance tests.
- **Dependencies:** DW-OD-04, DW-OD-41, DW-OD-43.
- **Blocks:** Both.
- **Owner approval:** PENDING — decision, approver, and date not provided.

## DW-OD-43 — Which production-like connection and transaction modes must the isolated suite validate before release?

- **Source:** design review §8.8.
- **Exact question:** Which production-like connection and transaction modes must the isolated suite validate before release?
- **Options and technical consequences:** A: test each intended deployment mode/pooler that can preserve a dedicated transaction and lock behavior; B: test one local mode and assume parity.
- **Risks:** S: B can hide pooler/transaction lock failures; P: partial enforcement exposes clinical data; C: failures may block care; O: A increases environment/test effort; do not access shared DB without permission.
- **Recommendation (not approved):** A using separately authorized isolated equivalents; record untested modes as blockers.
- **Dependencies:** DW-OD-07, DW-OD-41, DW-OD-42.
- **Blocks:** Both.
- **Owner approval:** PENDING — decision, approver, and date not provided.

## DW-OD-44 — May emergency access be re-granted immediately after a patient revokes it, and under what safeguards?

- **Source:** design review §8.8.
- **Exact question:** May emergency access be re-granted immediately after a patient revokes it, and under what safeguards?
- **Options and technical consequences:** A: require explicit owner-defined break-glass controls and truthful audit/notification, tested against revoke; B: allow current new emergency grant without additional policy decision; C: prohibit re-grant until an approved exception process.
- **Risks:** S: B can undermine withdrawal; P: re-grant can expose full record; C: C can delay emergency care; O: restrictions need workable emergency process.
- **Recommendation (not approved):** C until an explicit clinically reviewed A is approved; do not silently remove emergency access for other cases.
- **Dependencies:** DW-OD-06, DW-OD-07, DW-OD-26, DW-OD-45.
- **Blocks:** Both.
- **Owner approval:** PENDING — decision, approver, and date not provided.

## DW-OD-45 — How should the break-glass workflow remain reachable and verifiable without becoming an authorization bypass?

- **Source:** design review §8.8.
- **Exact question:** How should the break-glass workflow remain reachable and verifiable without becoming an authorization bypass?
- **Options and technical consequences:** A: define relationship/discovery, patient identity, verification, quota, notification and review checks and test both UI and API; B: rely on current mismatched page relationship and direct API behavior.
- **Risks:** S: B may permit bypass or block intended entry; P: patient existence and full record are sensitive; C: inaccessible emergency care is hazardous; O: A requires cross-path tests and human governance.
- **Recommendation (not approved):** A, with independently approved emergency policy and no invented clinic model.
- **Dependencies:** DW-OD-06, DW-OD-24, DW-OD-26, DW-OD-44.
- **Blocks:** Both.
- **Owner approval:** PENDING — decision, approver, and date not provided.

## DW-OD-46 — What release and rollback gate is required when the authorization protocol spans multiple routes and consent writers?

- **Source:** design review §8.8.
- **Exact question:** What release and rollback gate is required when the authorization protocol spans multiple routes and consent writers?
- **Options and technical consequences:** A: release atomically only after all acceptance tests; rollback restores known risks and requires access restriction and open findings. B: deploy partial changes or rollback without risk controls.
- **Risks:** S: B leaves bypasses and unsafe lock order; P: partial protections cause misleading privacy assurances; C: unsafe rollback can affect care; O: A can delay release and needs rollback coordination.
- **Recommendation (not approved):** A; no partial deployment, and schema rollback needs its own separately approved plan.
- **Dependencies:** DW-OD-07, DW-OD-27, DW-OD-41, DW-OD-42, DW-OD-43.
- **Blocks:** Both.
- **Owner approval:** PENDING — decision, approver, and date not provided.

## DW-OD-47 — What sections, fields and document access does FULL_RECORD authorize, including any data excluded by another independently applicable rule?

- **Source:** design review §8.3.
- **Exact question:** What sections, fields and document access does FULL_RECORD authorize, including any data excluded by another independently applicable rule?
- **Options and technical consequences:** A: define the full allowed field/section and document matrix explicitly, preserving patient ownership and role restrictions; B: assume FULL_RECORD means every table and metadata field without a specified boundary.
- **Risks:** S: B can grant access beyond intended resources; P: unrestricted fields may disclose identifiers or unrelated data; C: missing relevant sections can impair care; O: A requires explicit mapping and regression tests.
- **Recommendation (not approved):** A, specifying the exact clinical and demographic fields and maintaining independently required authorization.
- **Dependencies:** DW-OD-09, DW-OD-10, DW-OD-15, DW-OD-24.
- **Blocks:** DW-P0-02.
- **Owner approval:** PENDING — decision, approver, and date not provided.

## DW-OD-48 — How should unknown, malformed or incomplete scopes and invalid scope parameters be handled?

- **Source:** design review §8.3.
- **Exact question:** How should unknown, malformed or incomplete scopes and invalid scope parameters be handled?
- **Options and technical consequences:** A: fail closed without retrieving or processing protected sections and return a non-sensitive error; B: default to a broad or partially inferred scope.
- **Risks:** S: B can widen access inadvertently; P: malformed conditions may expose unrelated records; C: failure may defer consultation; O: A needs validation and compatibility handling for old rows.
- **Recommendation (not approved):** A, including absent condition names and invalid encounter counts; never infer broader permission.
- **Dependencies:** DW-OD-11, DW-OD-12, DW-OD-13, DW-OD-15, DW-OD-24.
- **Blocks:** DW-P0-02.
- **Owner approval:** PENDING — decision, approver, and date not provided.

## Source traceability

| Design review §8 item | Individually registered decisions |
|---|---|
| 1 — authorization, expiry, response, waits, ambiguous commit | DW-OD-01–05 |
| 2 — verification, ordering, erasure, session/deactivation | DW-OD-06–08 |
| 3 — scope matrix and safe writes | DW-OD-09–16, DW-OD-47–48 |
| 4 — post-withdrawal metadata, audit and errors | DW-OD-17–24 |
| 5 — consent state/history and migration | DW-OD-25–30 |
| 6 — time and non-revival | DW-OD-31–33 |
| 7 — audit semantics and erasure policy | DW-OD-34–40 |
| 8 — test instrumentation, resource/connection gates, emergency and release | DW-OD-41–46 |

The original 51-ID drawback crosswalk remains in `CITYCARE_MASTER_GAP_REGISTER.md`; this register neither changes nor supersedes it.
