# DW-P0 decision-resolution worksheet — authorization, clocks and evidence

**All entries PENDING. DW-P0-01 and DW-P0-02 remain OPEN / NOT ACCEPTED.** No shared-locking implementation, migration, deployment, release or acceptance is authorized by this worksheet. Original questions, options, dependencies and blocker labels below are preserved from the decision register. The alternatives include noncompliant choices for comparison; they are not equally acceptable. The existing task constraint requires authorized in-flight work to finish while revoke waits, with later requests denied after revoke commits. Delivered bytes or copies cannot be recalled.

The repository names roles, not actual individuals. The owner must designate named decision-makers/reviewers; the responsible roles and required review below are the **proposed routing from the approval pack**, not evidence that anyone has accepted the role or approved a decision. A policy choice requires owner/privacy/security approval as applicable; technical leads select and validate mechanisms with isolated evidence, not unilateral policy. Clinical review is separate and does not grant access. Source recommendations are unapproved and may need refinement against Proposal V1 and implementation evidence; no lock-order or deadlock-freedom claim is made.

## Implementation gate

Resolve the applicable authorization and expiry policy (01–03, 06, 08, 31–33) and emergency policy (44–45) with owner/privacy/security and clinical reviewers; jointly resolve associated technical evidence and feasibility (04–05, 07, 41–43). Preserve cross-dependencies, including other IDs outside this worksheet; source dependency cycles are coordinated review inputs, not a proven serial ordering. OD-41 asks about test-only barrier approval: tests still require separately authorized isolated infrastructure and no production/shared DB. A separately recorded owner authorization is required **after relevant policy and clinical decisions** before any shared synchronization implementation. Release and both P0 acceptance require additional decisions and evidence, not merely these 16 cards.

## DW-OD-01

**Original question:** When does a clinical operation become authorized relative to patient revocation?

**Original alternatives and technical consequences:** A: after post-lock verification; prior authorized work finishes and revoke waits for commit/rollback. B: attempt to interrupt in-flight work, requiring cancellation infrastructure and different guarantees.

**Original risks:** S: stale access if lock/recheck incomplete; P: data may be read until revoke commits; C: interruption may disrupt care; O: contention and timeouts under A.

**Unapproved source recommendation:** A, with consent `FOR SHARE`, transaction-bound use, and revoke conflict; B does not satisfy the requested milestone policy.

**Responsible role:** Owner / privacy-security policy lead.<br>
**Required reviewers:** Technical lead; privacy/security reviewer.<br>
**Original dependencies:** DW-OD-03, DW-OD-07, DW-OD-08.<br>
**Acceptance blocker:** DW-P0-01.<br>
**Approval:** PENDING — no named approver or date recorded.

## DW-OD-02

**Original question:** May an operation authorized before consent expiry finish after the expiry instant?

**Original alternatives and technical consequences:** A: yes, under its held authorization lock; B: cancel at expiry, requiring interruption and coordination that row locks cannot supply.

**Original risks:** S: post-expiry operations must not start; P: already prepared data may be delivered; C: interruption may lose a clinical write; O: A makes expiry admission-time, not completion-time.

**Unapproved source recommendation:** A, with fresh database-clock check after lock; B conflicts with the review target.

**Responsible role:** Owner / privacy policy lead.<br>
**Required reviewers:** Qualified clinician; technical lead.<br>
**Original dependencies:** DW-OD-01, DW-OD-31, DW-OD-32.<br>
**Acceptance blocker:** DW-P0-01.<br>
**Approval:** PENDING — no named approver or date recorded.

## DW-OD-03

**Original question:** What must the response, download, signed-link and print boundary be once revocation commits?

**Original alternatives and technical consequences:** A: buffer protected output before commit, separately reauthorize download, allow transmission and already-delivered copies after commit. B: try to block network transfer or recall copies, requiring a different protocol and still unable to recall disclosed data.

**Original risks:** S: unrechecked links can bypass revocation; P: cached/downloaded/printed data cannot be recalled; C: withholding output can disrupt care; O: buffering/streaming costs and limits.

**Unapproved source recommendation:** A; no protected response before successful commit and no lazy post-commit protected query.

**Responsible role:** Owner / privacy-security policy lead.<br>
**Required reviewers:** Technical lead; qualified clinician.<br>
**Original dependencies:** DW-OD-01, DW-OD-08, DW-OD-35, DW-OD-37.<br>
**Acceptance blocker:** Both.<br>
**Approval:** PENDING — no named approver or date recorded.

## DW-OD-04

**Original question:** What lock-wait, statement-timeout and user-facing failure limits are acceptable for protected operations and revocation?

**Original alternatives and technical consequences:** A: explicitly bounded waits and safe failure, chosen after isolated load tests; B: long/unbounded waits to favor completion, risking stalled requests and connection exhaustion.

**Original risks:** S: long-held locks increase denial-of-service exposure; P: premature success could mislead withdrawal; C: failed writes require explicit retry by user; O: timeouts reduce availability.

**Unapproved source recommendation:** A; owner to set numerical budgets after measurement, and never report a timed-out revoke as committed.

**Responsible role:** Technical lead.<br>
**Required reviewers:** Operations/SRE; security reviewer; product owner for user-facing failure.<br>
**Original dependencies:** DW-OD-01, DW-OD-08, DW-OD-40.<br>
**Acceptance blocker:** DW-P0-01.<br>
**Approval:** PENDING — no named approver or date recorded.

## DW-OD-05

**Original question:** How should the user be informed and the system reconcile a database connection loss during COMMIT?

**Original alternatives and technical consequences:** A: state outcome unknown, reconcile from durable evidence before retry. B: claim failure or automatically replay, risking a duplicate committed write.

**Original risks:** S: duplicate/replayed operations; P: misleading receipt or disclosure; C: duplicate clinical records; O: reconciliation may require support or idempotency work.

**Unapproved source recommendation:** A; do not claim rollback or automatically replay non-idempotent writes.

**Responsible role:** Technical lead.<br>
**Required reviewers:** Product owner; security reviewer; clinical safety reviewer.<br>
**Original dependencies:** DW-OD-04, DW-OD-38, DW-OD-41.<br>
**Acceptance blocker:** DW-P0-01.<br>
**Approval:** PENDING — no named approver or date recorded.

## DW-OD-06

**Original question:** Should doctor verification rejection and suspension serialize with all protected clinical operations, including document link and download?

**Original alternatives and technical consequences:** A: lock and recheck doctor status for every protected operation; admin status updates wait. B: retain point-in-time checks, leaving an in-flight suspension race and existing document gap.

**Original risks:** S: B permits stale verified status; P: unauthorized disclosure after suspension; C: delayed care during status update; O: A adds lock contention and requires reordered admin review.

**Unapproved source recommendation:** A, subject to a complete lock-order proof and no weakening of current role gates.

**Responsible role:** Owner / security policy lead.<br>
**Required reviewers:** Technical lead; qualified clinician.<br>
**Original dependencies:** DW-OD-01, DW-OD-07, DW-OD-08.<br>
**Acceptance blocker:** DW-P0-01.<br>
**Approval:** PENDING — no named approver or date recorded.

## DW-OD-07

**Original question:** What shared ordering and synchronization should cover consent creation, replacement, auto-revocation, bulk erasure and doctor status changes?

**Original alternatives and technical consequences:** A: approve a proven global lock graph, including stable missing-pair and bulk-erasure gates; B: lock only existing consent rows, which cannot serialize absence or new grants during bulk enumeration.

**Original risks:** S: incomplete protocol allows bypass; P: erasure can miss new access; C: deadlock/victim rollback may interrupt care; O: A requires all writers and FK/trigger analysis.

**Unapproved source recommendation:** A; select pair/gate mechanics only after proving all writers, sorted bulk ordering and ledger-last ordering.

**Responsible role:** Technical lead.<br>
**Required reviewers:** Database/security reviewer; owner for policy exceptions.<br>
**Original dependencies:** DW-OD-01, DW-OD-06, DW-OD-25, DW-OD-26, DW-OD-40, DW-OD-43.<br>
**Acceptance blocker:** DW-P0-01.<br>
**Approval:** PENDING — no named approver or date recorded.

## DW-OD-08

**Original question:** What guarantees should apply to session revocation and patient or doctor account deactivation beyond the consent lock?

**Original alternatives and technical consequences:** A: define and serialize selected account/session status checks; B: keep existing independent session checks and explicitly limit guarantee to consent.

**Original risks:** S: B may admit a previously validated session; P: deactivated identities may retain in-flight access; C: account closure can interrupt care; O: A expands lock graph and testing.

**Unapproved source recommendation:** A for verified-doctor status; explicitly threat-model patient/session behavior and approve any narrower guarantee rather than imply it.

**Responsible role:** Owner / security policy lead.<br>
**Required reviewers:** Technical lead; privacy reviewer.<br>
**Original dependencies:** DW-OD-06, DW-OD-07, DW-OD-04.<br>
**Acceptance blocker:** DW-P0-01.<br>
**Approval:** PENDING — no named approver or date recorded.

## DW-OD-31

**Original question:** What trusted database time source and monitoring are required, especially if the clock moves backward?

**Original alternatives and technical consequences:** A: establish trusted clock and alert/fail-safe policy for anomalies; B: rely solely on `clock_timestamp()` without claiming monotonicity.

**Original risks:** S: time rollback can revive stored APPROVED state; P: renewed disclosure may violate expiry; C: fail-safe may block urgent care; O: monitoring and clock assumptions need operational ownership.

**Unapproved source recommendation:** A; check DB wall time after lock and document limits; no unsupported monotonicity claim.

**Responsible role:** Technical lead.<br>
**Required reviewers:** Operations/SRE; security reviewer; owner for residual-risk policy.<br>
**Original dependencies:** DW-OD-02, DW-OD-32, DW-OD-33, DW-OD-40.<br>
**Acceptance blocker:** DW-P0-01.<br>
**Approval:** PENDING — no named approver or date recorded.

## DW-OD-32

**Original question:** Should an observed lapse be durably recorded and audited to prevent later revival after clock rollback?

**Original alternatives and technical consequences:** A: atomically persist truthful EXPIRED under exclusive synchronization; B: derive expiry on each read only.

**Original risks:** S: B can revive a previously observed lapse on clock rollback; P: stale permission may expose data; C: blocked or revived care changes safety; O: A adds write contention and may need schema review.

**Unapproved source recommendation:** A if owner requires observed-expiry non-revival; it cannot guarantee behavior for an unobserved backward clock jump.

**Responsible role:** Technical lead.<br>
**Required reviewers:** Privacy/security reviewer; owner for lapse/history policy.<br>
**Original dependencies:** DW-OD-02, DW-OD-07, DW-OD-27, DW-OD-31.<br>
**Acceptance blocker:** DW-P0-01.<br>
**Approval:** PENDING — no named approver or date recorded.

## DW-OD-33

**Original question:** What guarantee is required for expiry if the clock jumps backward before any lapse was observed?

**Original alternatives and technical consequences:** A: accept a documented trusted-clock assumption with monitoring and fail-safe; B: require stronger time guarantees with a separately designed trusted/monotonic mechanism.

**Original risks:** S: A cannot rule out revival during an unobserved rollback; P: access may extend beyond intended time; C: fail-safe may delay care; O: B needs additional infrastructure/design and authorization.

**Unapproved source recommendation:** A only if owner accepts the explicit residual risk; otherwise design B before acceptance.

**Responsible role:** Owner / privacy-security policy lead.<br>
**Required reviewers:** Technical lead; operations/SRE.<br>
**Original dependencies:** DW-OD-31, DW-OD-32, DW-OD-40.<br>
**Acceptance blocker:** DW-P0-01.<br>
**Approval:** PENDING — no named approver or date recorded.

## DW-OD-41

**Original question:** Are isolated, test-only transaction barriers and independent PostgreSQL connections approved for concurrency evidence?

**Original alternatives and technical consequences:** A: synthetic disposable DB and test-only hooks not shipped/exposed in production; B: generic lock tests or mocks only.

**Original risks:** S: leaked hooks could create a bypass; P: fixtures/logs must contain no real patient data; C: unproven races compromise safety; O: A needs controlled infrastructure and instrumentation.

**Unapproved source recommendation:** A, asserting real endpoint ordering via DB-observed blocking; B is insufficient.

**Responsible role:** Technical lead.<br>
**Required reviewers:** Database/security reviewer; QA lead.<br>
**Original dependencies:** DW-OD-07, DW-OD-43.<br>
**Acceptance blocker:** Both.<br>
**Approval:** PENDING — no named approver or date recorded.

## DW-OD-42

**Original question:** What resource and timeout limits are acceptable for isolated concurrency, HTTP and browser verification?

**Original alternatives and technical consequences:** A: define bounded waits, concurrency and artifact limits from disposable-environment measurements; B: leave them unbounded.

**Original risks:** S: unbounded tests can exhaust services; P: excessive logging risks data exposure; C: timeouts can hide failed safety scenarios; O: A may require provisioning and measured thresholds.

**Unapproved source recommendation:** A; owner supplies or approves budgets after measurement, without weakening acceptance tests.

**Responsible role:** Technical lead.<br>
**Required reviewers:** QA lead; operations/SRE.<br>
**Original dependencies:** DW-OD-04, DW-OD-41, DW-OD-43.<br>
**Acceptance blocker:** Both.<br>
**Approval:** PENDING — no named approver or date recorded.

## DW-OD-43

**Original question:** Which production-like connection and transaction modes must the isolated suite validate before release?

**Original alternatives and technical consequences:** A: test each intended deployment mode/pooler that can preserve a dedicated transaction and lock behavior; B: test one local mode and assume parity.

**Original risks:** S: B can hide pooler/transaction lock failures; P: partial enforcement exposes clinical data; C: failures may block care; O: A increases environment/test effort; do not access shared DB without permission.

**Unapproved source recommendation:** A using separately authorized isolated equivalents; record untested modes as blockers.

**Responsible role:** Technical lead.<br>
**Required reviewers:** Database/operations reviewer; QA lead.<br>
**Original dependencies:** DW-OD-07, DW-OD-41, DW-OD-42.<br>
**Acceptance blocker:** Both.<br>
**Approval:** PENDING — no named approver or date recorded.

## DW-OD-44

**Original question:** May emergency access be re-granted immediately after a patient revokes it, and under what safeguards?

**Original alternatives and technical consequences:** A: require explicit owner-defined break-glass controls and truthful audit/notification, tested against revoke; B: allow current new emergency grant without additional policy decision; C: prohibit re-grant until an approved exception process.

**Original risks:** S: B can undermine withdrawal; P: re-grant can expose full record; C: C can delay emergency care; O: restrictions need workable emergency process.

**Unapproved source recommendation:** C until an explicit clinically reviewed A is approved; do not silently remove emergency access for other cases.

**Responsible role:** Owner / privacy-security policy lead.<br>
**Required reviewers:** Qualified clinician; legal/privacy reviewer; technical lead.<br>
**Original dependencies:** DW-OD-06, DW-OD-07, DW-OD-26, DW-OD-45.<br>
**Acceptance blocker:** Both.<br>
**Approval:** PENDING — no named approver or date recorded.

## DW-OD-45

**Original question:** How should the break-glass workflow remain reachable and verifiable without becoming an authorization bypass?

**Original alternatives and technical consequences:** A: define relationship/discovery, patient identity, verification, quota, notification and review checks and test both UI and API; B: rely on current mismatched page relationship and direct API behavior.

**Original risks:** S: B may permit bypass or block intended entry; P: patient existence and full record are sensitive; C: inaccessible emergency care is hazardous; O: A requires cross-path tests and human governance.

**Unapproved source recommendation:** A, with independently approved emergency policy and no invented clinic model.

**Responsible role:** Owner / product-security policy lead.<br>
**Required reviewers:** Qualified clinician; privacy reviewer; technical lead.<br>
**Original dependencies:** DW-OD-06, DW-OD-24, DW-OD-26, DW-OD-44.<br>
**Acceptance blocker:** Both.<br>
**Approval:** PENDING — no named approver or date recorded.

## Separation of decisions and validation

- **Policy / clinical:** OD-01–03, 06, 08, 33, 44–45 determine guarantees, disclosure or care/availability tradeoffs; technical evidence informs but does not decide them. OD-02 is a review target, not an already approved policy. OD-44/45 require qualified clinical and privacy/security input.
- **Engineering evidence:** OD-04, 05, 07, 31, 32, 41–43 need technical disposition and measured isolated evidence; any accepted time-source risk, user-facing policy, durable state/migration, scope change or production-like environment still needs its respective owner/security and separate authorization. OD-04 source recommendation mentions owner numerical budgets; approval-pack routing instead recommends engineering measurements and cross-review, an unresolved routing distinction, not an approved numeric budget.
- **Stop condition:** Do not begin shared synchronization until applicable decisions and clinical reviews are resolved and the owner explicitly authorizes the next milestone. Neither a pass in sequential mocked tests nor this worksheet closes either finding.
