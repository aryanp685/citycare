# DW-P0 owner approval pack

**Status: NOT APPROVED. All 48 original approvals remain PENDING. DW-P0-01 and DW-P0-02 remain OPEN / NOT ACCEPTED.** This pack is a routing and evidence proposal, not an approval or implementation instruction. No owner decision is inferred from earlier conversation. `OWNER_DECISION_REGISTER.md` remains the unchanged source of the original question, options, risks, dependencies, recommendation and PENDING approval for each ID. Exact questions and dependencies are reproduced below, not replaced. Classification and proposed decision-makers are recommendations for review, not a change to authority or approval status.

**How to use:** A routes genuine product/privacy/security policy decisions to the owner. B routes engineering details to the technical lead for a proposed, reviewable resolution; security/privacy, product, clinical or owner reviewers are named when effects cross disciplines. C routes clinical judgments to a qualified clinical lead; that review does not itself authorize access to patient data, which remains an owner/privacy decision. D separately identifies release governance. The primary assignment does not merge decisions or remove any named reviewer. P0 blockers reproduce the source register conservatively; “Both” means both DW-P0-01 and DW-P0-02. “No” for deferral means the question or a safe explicitly approved disposition must be resolved before P0 acceptance, not that every optional feature must ship. No owner is asked to pick SQL lock modes, barrier internals or arbitrary timeout numbers. Any change to those acceptance boundaries must be explicitly approved, not inferred here.

## Explicit cross-cutting review and unresolved tensions

- **OD-01:** The milestone’s specified in-flight rule is authorized operation finishes while revoke waits, followed by denial after revoke commits. This is an existing task constraint, not evidence of owner approval of the 48 register decisions. Policy semantics need owner sign-off; the lock mode and exact ordering are technical matters under OD-07. No acceptance of an interrupt-and-recall alternative is implied.
- **OD-03:** A response constructed before commit can be transmitted after commit; a printed, cached or delivered copy cannot be recalled. Link mint is not download authority: download must reauthorize. RSC rendering/streaming must not perform lazy protected work after the protected transaction. User-facing semantics belong to policy; buffering mechanism belongs to engineering.
- **OD-07:** A lock on an existing row does not cover an absent pair, concurrent replacement or bulk erasure racing a new grant. The current request-only advisory key is not a universal gate. The technical lead must prove all-writer synchronization, deterministic selection and a complete lock graph including appointment, doctor, erasure, FK/trigger and ledger interactions; no chosen gate or schema is assumed sufficient.
- **OD-09–16, 47–48:** Clinical safety facts and the exact patient-approved scope are distinct approvals. Existing narrow scopes retain safety facts; LAST_N currently includes unlinked data; OD-14 recommends exclusion, a proposed behavior change, not an approved privacy fix. SPECIFIC_CONDITION’s DB predicate may evaluate nonmatching text even when such text is not returned; clarify the threat boundary. `documentIds` exists, but selected-document access is not implemented. Fail closed for malformed scopes without silently broadening. Clinical and owner/privacy review must be joint.
- **OD-25–30:** Cancellation, denial, revocation, natural expiry, emergency supersession and approval must remain truthful; existing fields/history have ambiguities. Source recommendations are not a decision to rewrite history. Determine schema need technically after policy; migration authorization is separate and no migration is approved here.
- **OD-31–33:** Fresh database wall time after lock avoids transaction-start `now()` staleness but is not monotonic. Durable observed lapse can prevent revival only after lapse is observed; unobserved clock rollback needs an explicit residual-risk/time-source decision. UTC assumptions and monitoring require evidence.
- **OD-34–39:** Source proposes atomic success auditing, distinct mint and download semantics, minimal payloads and safe denial handling. A denied request thrown within a transaction can roll back its own audit; audit-outage behavior, care availability and failure reporting remain pending. Do not conflate a link mint with an actual download or network delivery.
- **OD-41–43:** The technical lead designs test-only barriers and independent-connection evidence on disposable synthetic PostgreSQL, proves actual blocking and reverse order, and identifies supported transaction/pooler modes. Mocks or sequential tests alone are insufficient. Artifact/resource budgets need measurement; no shared DB tests are authorized.
- **OD-44–45:** Restricting re-grant can protect withdrawal but may delay emergency care; source recommendations are not approved. Existing UI relationship checks and direct emergency API behavior differ. Require privacy/security owner and qualified clinical review; do not remove or silently expand break-glass.
- **OD-46:** Release/rollback is separate governance. A rollback to previous code restores known risks; an application release must not deploy an incomplete cross-path protocol. Acceptance requires the requested gates and explicit owner decision; no release authorized here.
- **Dependency cycles / decision boundaries:** The source dependencies are preserved as written and include cycles (for example 09 ↔ 11; 41 ↔ 43; 34/35/36/38). They are related inputs for coordinated review, not a proven executable approval order. OD-04 references erasure receipt OD-40 and OD-31/33 also reference OD-40; OD-15 references connection-mode OD-43: the necessity of each edge is not established. Do not delete or reinterpret edges silently; technical lead should explain or correct them in a future reviewed update. Status/ownership routing here does not overwrite the original owner-approval fields.
- **Scope of acceptance:** The original register conservatively labels many metadata and erasure matters as blocking both P0s. This pack retains those labels even where a separate downstream feature could be deferred; it does not unilaterally downgrade a blocker. Separate-purpose metadata and erasure rights require explicit privacy/legal review. The 51-ID drawback crosswalk remains unchanged in `CITYCARE_MASTER_GAP_REGISTER.md`; A-3.2 remains NOT ACCEPTED.

## Decision cards


### A. Genuine owner / product / privacy / security policy decisions

#### DW-OD-01
- **Original question:** When does a clinical operation become authorized relative to patient revocation?
- **Proposed responsible decision-maker:** Owner / privacy-security policy lead.
- **Required reviewers:** Technical lead; privacy/security reviewer.
- **Mandatory blocker:** DW-P0-01.
- **Original dependencies:** DW-OD-03, DW-OD-07, DW-OD-08.
- **Evidence / information needed:** Patient-facing in-flight/revocation contract; DB lock and ordering evidence; timeout implications.
- **Can this decision be deferred without weakening P0 acceptance?** No. The milestone already requires authorized work to finish before revocation commits; an incompatible alternative cannot be accepted.
- **Original approval:** PENDING; proposed routing and any eventual technical/clinical resolution are also pending.

#### DW-OD-02
- **Original question:** May an operation authorized before consent expiry finish after the expiry instant?
- **Proposed responsible decision-maker:** Owner / privacy policy lead.
- **Required reviewers:** Qualified clinician; technical lead.
- **Mandatory blocker:** DW-P0-01.
- **Original dependencies:** DW-OD-01, DW-OD-31, DW-OD-32.
- **Evidence / information needed:** Expiry-boundary behavior and care/availability impact.
- **Can this decision be deferred without weakening P0 acceptance?** No. The review target allows already-authorized work to finish after expiry.
- **Original approval:** PENDING; proposed routing and any eventual technical/clinical resolution are also pending.

#### DW-OD-03
- **Original question:** What must the response, download, signed-link and print boundary be once revocation commits?
- **Proposed responsible decision-maker:** Owner / privacy-security policy lead.
- **Required reviewers:** Technical lead; qualified clinician.
- **Mandatory blocker:** Both.
- **Original dependencies:** DW-OD-01, DW-OD-08, DW-OD-35, DW-OD-37.
- **Evidence / information needed:** Download reauthorization, immutable buffered response, network/print/cache limits and storage implications.
- **Can this decision be deferred without weakening P0 acceptance?** No. Separate owner policy from technical buffering mechanism; no recall of delivered copies is possible.
- **Original approval:** PENDING; proposed routing and any eventual technical/clinical resolution are also pending.

#### DW-OD-06
- **Original question:** Should doctor verification rejection and suspension serialize with all protected clinical operations, including document link and download?
- **Proposed responsible decision-maker:** Owner / security policy lead.
- **Required reviewers:** Technical lead; qualified clinician.
- **Mandatory blocker:** DW-P0-01.
- **Original dependencies:** DW-OD-01, DW-OD-07, DW-OD-08.
- **Evidence / information needed:** Verification/suspension threat model and effect of waiting operations including documents.
- **Can this decision be deferred without weakening P0 acceptance?** No. Owner decides guarantee; technical lead chooses synchronization, not owner-selected SQL.
- **Original approval:** PENDING; proposed routing and any eventual technical/clinical resolution are also pending.

#### DW-OD-08
- **Original question:** What guarantees should apply to session revocation and patient or doctor account deactivation beyond the consent lock?
- **Proposed responsible decision-maker:** Owner / security policy lead.
- **Required reviewers:** Technical lead; privacy reviewer.
- **Mandatory blocker:** DW-P0-01.
- **Original dependencies:** DW-OD-06, DW-OD-07, DW-OD-04.
- **Evidence / information needed:** Session, patient and doctor deactivation threat model and scope of in-flight guarantees.
- **Can this decision be deferred without weakening P0 acceptance?** No. Do not assume session revocation is already synchronized.
- **Original approval:** PENDING; proposed routing and any eventual technical/clinical resolution are also pending.

#### DW-OD-09
- **Original question:** For each consent scope, which patient demographics, ABHA identifier and guardian details may a doctor view or print?
- **Proposed responsible decision-maker:** Owner / privacy-product lead.
- **Required reviewers:** Qualified clinician; technical lead.
- **Mandatory blocker:** DW-P0-02.
- **Original dependencies:** DW-OD-11, DW-OD-12, DW-OD-13, DW-OD-16.
- **Evidence / information needed:** Per-scope demographic, ABHA and guardian field matrix including print and patient notice.
- **Can this decision be deferred without weakening P0 acceptance?** No. Owner decides disclosure; clinical reviewer assesses minimum useful context.
- **Original approval:** PENDING; proposed routing and any eventual technical/clinical resolution are also pending.

#### DW-OD-15
- **Original question:** Should SPECIFIC_DOCUMENTS be implemented using existing documentIds, or continue to fail closed?
- **Proposed responsible decision-maker:** Owner / privacy-product lead.
- **Required reviewers:** Qualified clinician; technical lead.
- **Mandatory blocker:** DW-P0-02.
- **Original dependencies:** DW-OD-09, DW-OD-13, DW-OD-27, DW-OD-43.
- **Evidence / information needed:** Existing documentIds representation, feasibility and consequences of fail-closed behavior.
- **Can this decision be deferred without weakening P0 acceptance?** No. Decision on fail-closed handling is mandatory; selected-document feature implementation can be deferred only if that approach is explicitly approved and tested.
- **Original approval:** PENDING; proposed routing and any eventual technical/clinical resolution are also pending.

#### DW-OD-17
- **Original question:** After withdrawal, may doctors see appointment reasons independently of record consent?
- **Proposed responsible decision-maker:** Owner / privacy-product lead.
- **Required reviewers:** Qualified clinician; security reviewer.
- **Mandatory blocker:** Both.
- **Original dependencies:** DW-OD-23, DW-OD-24.
- **Evidence / information needed:** Appointment-purpose basis, reason content and effect of withdrawal.
- **Can this decision be deferred without weakening P0 acceptance?** No. Determine a defensible independent purpose rather than assuming consent survives.
- **Original approval:** PENDING; proposed routing and any eventual technical/clinical resolution are also pending.

#### DW-OD-18
- **Original question:** After withdrawal, may doctors see dates of their own prior consultations?
- **Proposed responsible decision-maker:** Owner / privacy-product lead.
- **Required reviewers:** Qualified clinician; security reviewer.
- **Mandatory blocker:** Both.
- **Original dependencies:** DW-OD-23, DW-OD-24.
- **Evidence / information needed:** Nature and purpose of prior consultation date metadata and impact of withholding.
- **Can this decision be deferred without weakening P0 acceptance?** No. Distinguish own-authored visit metadata from clinical-record consent.
- **Original approval:** PENDING; proposed routing and any eventual technical/clinical resolution are also pending.

#### DW-OD-19
- **Original question:** After withdrawal, may doctors see their own activity history with patient names, action types and times?
- **Proposed responsible decision-maker:** Owner / privacy-product lead.
- **Required reviewers:** Security/audit reviewer; qualified clinician.
- **Mandatory blocker:** Both.
- **Original dependencies:** DW-OD-23, DW-OD-35, DW-OD-37.
- **Evidence / information needed:** Activity fields, patient relationship and accountability needs.
- **Can this decision be deferred without weakening P0 acceptance?** No. Audit history retention is distinct from doctor-facing display.
- **Original approval:** PENDING; proposed routing and any eventual technical/clinical resolution are also pending.

#### DW-OD-20
- **Original question:** After withdrawal, may doctors retain access to existing patient-related notifications?
- **Proposed responsible decision-maker:** Owner / privacy-product lead.
- **Required reviewers:** Qualified clinician; technical lead.
- **Mandatory blocker:** Both.
- **Original dependencies:** DW-OD-23, DW-OD-37.
- **Evidence / information needed:** Notification producers, historical content, retention and care-impact scenarios.
- **Can this decision be deferred without weakening P0 acceptance?** No. No assumption all historical notification text is nonclinical.
- **Original approval:** PENDING; proposed routing and any eventual technical/clinical resolution are also pending.

#### DW-OD-21
- **Original question:** After withdrawal, which connected-patient identifiers and guardian details may remain visible in dashboard, directory and workspace?
- **Proposed responsible decision-maker:** Owner / privacy-product lead.
- **Required reviewers:** Qualified clinician; security reviewer.
- **Mandatory blocker:** Both.
- **Original dependencies:** DW-OD-09, DW-OD-17, DW-OD-18, DW-OD-19, DW-OD-20, DW-OD-24.
- **Evidence / information needed:** Identifiers and guardian details per surface; relationship and enumeration threat model.
- **Can this decision be deferred without weakening P0 acceptance?** No. Cross-check independently authorized metadata and scope matrix.
- **Original approval:** PENDING; proposed routing and any eventual technical/clinical resolution are also pending.

#### DW-OD-22
- **Original question:** Should reads of independently authorized appointment, directory, activity or notification metadata be audited?
- **Proposed responsible decision-maker:** Owner / privacy-security policy lead.
- **Required reviewers:** Audit/security reviewer; technical lead.
- **Mandatory blocker:** Both.
- **Original dependencies:** DW-OD-17, DW-OD-18, DW-OD-19, DW-OD-20, DW-OD-21, DW-OD-35, DW-OD-37.
- **Evidence / information needed:** Metadata-read classifications, expected access volume, permitted audit payload and outage implications.
- **Can this decision be deferred without weakening P0 acceptance?** No. Decide audit requirement without imposing unnecessary clinical content in audit.
- **Original approval:** PENDING; proposed routing and any eventual technical/clinical resolution are also pending.

#### DW-OD-23
- **Original question:** What independent-purpose and retention policy authorizes metadata after clinical-consent withdrawal?
- **Proposed responsible decision-maker:** Owner / privacy-product lead.
- **Required reviewers:** Legal/privacy reviewer; qualified clinician.
- **Mandatory blocker:** Both.
- **Original dependencies:** DW-OD-17, DW-OD-18, DW-OD-19, DW-OD-20, DW-OD-21.
- **Evidence / information needed:** Purpose, lawful basis, fields and retention proposal for post-withdrawal metadata.
- **Can this decision be deferred without weakening P0 acceptance?** No. Do not infer a legal basis; counsel review may be needed.
- **Original approval:** PENDING; proposed routing and any eventual technical/clinical resolution are also pending.

#### DW-OD-25
- **Original question:** How should cancellation of an unapproved pending request be represented and audited?
- **Proposed responsible decision-maker:** Owner / privacy-product lead.
- **Required reviewers:** Legal/privacy reviewer; technical lead.
- **Mandatory blocker:** Both.
- **Original dependencies:** DW-OD-27, DW-OD-28, DW-OD-29.
- **Evidence / information needed:** Pending cancellation workflow, event meanings, patient-facing history and alternatives.
- **Can this decision be deferred without weakening P0 acceptance?** No. Decision must distinguish cancellation from approval revocation and natural expiry.
- **Original approval:** PENDING; proposed routing and any eventual technical/clinical resolution are also pending.

#### DW-OD-26
- **Original question:** How should emergency access supersede a pending request without falsely labeling it expired?
- **Proposed responsible decision-maker:** Owner / privacy-product lead.
- **Required reviewers:** Qualified clinician; technical lead; security reviewer.
- **Mandatory blocker:** Both.
- **Original dependencies:** DW-OD-25, DW-OD-27, DW-OD-44.
- **Evidence / information needed:** Emergency supersession workflow, history and notifications.
- **Can this decision be deferred without weakening P0 acceptance?** No. Requires emergency policy and truthful state treatment; no assumption of patient approval.
- **Original approval:** PENDING; proposed routing and any eventual technical/clinical resolution are also pending.

#### DW-OD-28
- **Original question:** How should a denial timestamp be recorded without implying an approval was revoked?
- **Proposed responsible decision-maker:** Owner / privacy-product lead.
- **Required reviewers:** Legal/privacy reviewer; technical lead.
- **Mandatory blocker:** Both.
- **Original dependencies:** DW-OD-25, DW-OD-27, DW-OD-29.
- **Evidence / information needed:** Existing denied timestamp and field meaning, event alternatives and compatibility.
- **Can this decision be deferred without weakening P0 acceptance?** No. Preserve denial distinct from revocation without fabricating an approval.
- **Original approval:** PENDING; proposed routing and any eventual technical/clinical resolution are also pending.

#### DW-OD-29
- **Original question:** How should legacy REQUESTED rows marked REVOKED or EXPIRED be presented and preserved?
- **Proposed responsible decision-maker:** Owner / privacy-product lead.
- **Required reviewers:** Legal/privacy reviewer; technical lead.
- **Mandatory blocker:** Both.
- **Original dependencies:** DW-OD-25, DW-OD-26, DW-OD-28.
- **Evidence / information needed:** Inventory of ambiguous historical records and accurate presentation alternatives.
- **Can this decision be deferred without weakening P0 acceptance?** No. Do not rewrite logs or infer past approvals.
- **Original approval:** PENDING; proposed routing and any eventual technical/clinical resolution are also pending.

#### DW-OD-30
- **Original question:** How should requested scope and the different scope approved by the patient be preserved as distinct historical facts?
- **Proposed responsible decision-maker:** Owner / privacy-product lead.
- **Required reviewers:** Legal/privacy reviewer; technical lead.
- **Mandatory blocker:** DW-P0-02.
- **Original dependencies:** DW-OD-27, DW-OD-29, DW-OD-37.
- **Evidence / information needed:** Existing request and grant evidence, scope edits and reconstructability gaps.
- **Can this decision be deferred without weakening P0 acceptance?** No. Preserve distinction without fabricating historical data.
- **Original approval:** PENDING; proposed routing and any eventual technical/clinical resolution are also pending.

#### DW-OD-33
- **Original question:** What guarantee is required for expiry if the clock jumps backward before any lapse was observed?
- **Proposed responsible decision-maker:** Owner / privacy-security policy lead.
- **Required reviewers:** Technical lead; operations/SRE.
- **Mandatory blocker:** DW-P0-01.
- **Original dependencies:** DW-OD-31, DW-OD-32, DW-OD-40.
- **Evidence / information needed:** Unobserved backward clock-jump risk, monitoring coverage, feasible stronger time guarantees.
- **Can this decision be deferred without weakening P0 acceptance?** No. Persisting observed expiry cannot prove safety across an unobserved rollback.
- **Original approval:** PENDING; proposed routing and any eventual technical/clinical resolution are also pending.

#### DW-OD-34
- **Original question:** Must successful clinical record and print reads be audited atomically with authorization and result construction?
- **Proposed responsible decision-maker:** Owner / privacy-security policy lead.
- **Required reviewers:** Audit/security reviewer; technical lead.
- **Mandatory blocker:** Both.
- **Original dependencies:** DW-OD-01, DW-OD-03, DW-OD-36, DW-OD-37.
- **Evidence / information needed:** Record and print audit semantics, failure behavior, contention and care impact.
- **Can this decision be deferred without weakening P0 acceptance?** No. Atomicity implementation belongs to technical lead; no undocumented best-effort substitution.
- **Original approval:** PENDING; proposed routing and any eventual technical/clinical resolution are also pending.

#### DW-OD-35
- **Original question:** Must document-link minting be audited atomically and fail closed when its audit cannot commit?
- **Proposed responsible decision-maker:** Owner / privacy-security policy lead.
- **Required reviewers:** Audit/security reviewer; technical lead.
- **Mandatory blocker:** Both.
- **Original dependencies:** DW-OD-03, DW-OD-36, DW-OD-38, DW-OD-39.
- **Evidence / information needed:** Mint event meaning, ledger failure and signed-link authorization behavior.
- **Can this decision be deferred without weakening P0 acceptance?** No. Mint does not establish that a download occurred.
- **Original approval:** PENDING; proposed routing and any eventual technical/clinical resolution are also pending.

#### DW-OD-36
- **Original question:** Must actual document downloads be independently audited, and should mint and download be separate event meanings?
- **Proposed responsible decision-maker:** Owner / privacy-security policy lead.
- **Required reviewers:** Audit/security reviewer; technical lead.
- **Mandatory blocker:** Both.
- **Original dependencies:** DW-OD-03, DW-OD-35, DW-OD-38.
- **Evidence / information needed:** Mint versus actual-download event definitions and delivery limitations.
- **Can this decision be deferred without weakening P0 acceptance?** No. Audit successful construction is not proof network bytes reached recipient.
- **Original approval:** PENDING; proposed routing and any eventual technical/clinical resolution are also pending.

#### DW-OD-37
- **Original question:** Must denied record, write and document attempts be recorded, and how should denial audit failure be handled?
- **Proposed responsible decision-maker:** Owner / privacy-security policy lead.
- **Required reviewers:** Audit/security reviewer; technical lead.
- **Mandatory blocker:** Both.
- **Original dependencies:** DW-OD-24, DW-OD-38, DW-OD-39.
- **Evidence / information needed:** Denial event meaning, safe error paths, rollback behavior and audit-failure response.
- **Can this decision be deferred without weakening P0 acceptance?** No. Design must avoid rolling back a denial audit when an exception is thrown.
- **Original approval:** PENDING; proposed routing and any eventual technical/clinical resolution are also pending.

#### DW-OD-38
- **Original question:** What minimal clinical-access, denial, mint and download audit metadata is permitted?
- **Proposed responsible decision-maker:** Owner / privacy-security policy lead.
- **Required reviewers:** Legal/privacy reviewer; technical lead.
- **Mandatory blocker:** Both.
- **Original dependencies:** DW-OD-09, DW-OD-10, DW-OD-34, DW-OD-35, DW-OD-36, DW-OD-37.
- **Evidence / information needed:** Minimum field list for each event; hidden-data canary and retention policy.
- **Can this decision be deferred without weakening P0 acceptance?** No. Audit metadata must not disclose out-of-scope facts.
- **Original approval:** PENDING; proposed routing and any eventual technical/clinical resolution are also pending.

#### DW-OD-39
- **Original question:** What should happen during an audit outage for protected successes and separately for denied attempts?
- **Proposed responsible decision-maker:** Owner / privacy-security policy lead.
- **Required reviewers:** Audit/security reviewer; qualified clinician; technical lead.
- **Mandatory blocker:** Both.
- **Original dependencies:** DW-OD-34, DW-OD-35, DW-OD-36, DW-OD-37, DW-OD-38.
- **Evidence / information needed:** Availability and patient safety effect of audit outages for success versus denial.
- **Can this decision be deferred without weakening P0 acceptance?** No. Make fail-closed and denial behavior explicit; do not silently weaken integrity.
- **Original approval:** PENDING; proposed routing and any eventual technical/clinical resolution are also pending.

#### DW-OD-40
- **Original question:** Should patient erasure continue even when its post-commit audit receipt fails, or become audit-atomic?
- **Proposed responsible decision-maker:** Owner / privacy-product lead.
- **Required reviewers:** Legal/privacy reviewer; technical lead.
- **Mandatory blocker:** Both.
- **Original dependencies:** DW-OD-07, DW-OD-39.
- **Evidence / information needed:** Existing erasure-first rationale, receipt-loss risk, retention/legal review and recovery.
- **Can this decision be deferred without weakening P0 acceptance?** No. Separately justified erasure policy cannot be silently changed; any erasure redesign is separate but current P0 interaction needs resolution.
- **Original approval:** PENDING; proposed routing and any eventual technical/clinical resolution are also pending.

#### DW-OD-44
- **Original question:** May emergency access be re-granted immediately after a patient revokes it, and under what safeguards?
- **Proposed responsible decision-maker:** Owner / privacy-security policy lead.
- **Required reviewers:** Qualified clinician; legal/privacy reviewer; technical lead.
- **Mandatory blocker:** Both.
- **Original dependencies:** DW-OD-06, DW-OD-07, DW-OD-26, DW-OD-45.
- **Evidence / information needed:** Emergency re-grant after withdrawal threat model, patient safety and available safeguards.
- **Can this decision be deferred without weakening P0 acceptance?** No. Owner must explicitly decide; recommendation to restrict re-grants is not approved and may delay care.
- **Original approval:** PENDING; proposed routing and any eventual technical/clinical resolution are also pending.

#### DW-OD-45
- **Original question:** How should the break-glass workflow remain reachable and verifiable without becoming an authorization bypass?
- **Proposed responsible decision-maker:** Owner / product-security policy lead.
- **Required reviewers:** Qualified clinician; privacy reviewer; technical lead.
- **Mandatory blocker:** Both.
- **Original dependencies:** DW-OD-06, DW-OD-24, DW-OD-26, DW-OD-44.
- **Evidence / information needed:** UI/API reachability, identity, relationship, quotas, notice and review; synthetic workflow proof.
- **Can this decision be deferred without weakening P0 acceptance?** No. Need a clinically usable emergency path without allowing a consent bypass.
- **Original approval:** PENDING; proposed routing and any eventual technical/clinical resolution are also pending.

#### DW-OD-47
- **Original question:** What sections, fields and document access does FULL_RECORD authorize, including any data excluded by another independently applicable rule?
- **Proposed responsible decision-maker:** Owner / privacy-product lead.
- **Required reviewers:** Qualified clinician; technical lead.
- **Mandatory blocker:** DW-P0-02.
- **Original dependencies:** DW-OD-09, DW-OD-10, DW-OD-15, DW-OD-24.
- **Evidence / information needed:** FULL_RECORD section/field/document inventory and independent restrictions.
- **Can this decision be deferred without weakening P0 acceptance?** No. The label does not automatically authorize every stored field.
- **Original approval:** PENDING; proposed routing and any eventual technical/clinical resolution are also pending.


### B. Engineering and architecture decisions — technical lead

#### DW-OD-04
- **Original question:** What lock-wait, statement-timeout and user-facing failure limits are acceptable for protected operations and revocation?
- **Proposed responsible decision-maker:** Technical lead.
- **Required reviewers:** Operations/SRE; security reviewer; product owner for user-facing failure.
- **Mandatory blocker:** DW-P0-01.
- **Original dependencies:** DW-OD-01, DW-OD-08, DW-OD-40.
- **Evidence / information needed:** Measured isolated lock waits, pool capacity, statement timeouts and UX trade-offs.
- **Can this decision be deferred without weakening P0 acceptance?** No. Do not ask owner for arbitrary numeric timeouts; escalate residual availability trade-offs after measurement.
- **Original approval:** PENDING; proposed routing and any eventual technical/clinical resolution are also pending.

#### DW-OD-05
- **Original question:** How should the user be informed and the system reconcile a database connection loss during COMMIT?
- **Proposed responsible decision-maker:** Technical lead.
- **Required reviewers:** Product owner; security reviewer; clinical safety reviewer.
- **Mandatory blocker:** DW-P0-01.
- **Original dependencies:** DW-OD-04, DW-OD-38, DW-OD-41.
- **Evidence / information needed:** Failure-injection plan for uncertain COMMIT, durable evidence, retry/idempotency capabilities and user messaging.
- **Can this decision be deferred without weakening P0 acceptance?** No. Technical lead specifies reconciliation; product owner reviews consequential user messaging.
- **Original approval:** PENDING; proposed routing and any eventual technical/clinical resolution are also pending.

#### DW-OD-07
- **Original question:** What shared ordering and synchronization should cover consent creation, replacement, auto-revocation, bulk erasure and doctor status changes?
- **Proposed responsible decision-maker:** Technical lead.
- **Required reviewers:** Database/security reviewer; owner for policy exceptions.
- **Mandatory blocker:** DW-P0-01.
- **Original dependencies:** DW-OD-01, DW-OD-06, DW-OD-25, DW-OD-26, DW-OD-40, DW-OD-43.
- **Evidence / information needed:** Full writer/FK/trigger lock graph, missing-row/new-grant and bulk-erasure races, independent-connection proof.
- **Can this decision be deferred without weakening P0 acceptance?** No. A lock graph and absence/replacement synchronization are mandatory; no proof exists yet.
- **Original approval:** PENDING; proposed routing and any eventual technical/clinical resolution are also pending.

#### DW-OD-24
- **Original question:** How should error/status responses avoid patient or document existence oracles while preserving legitimate workflows?
- **Proposed responsible decision-maker:** Technical lead.
- **Required reviewers:** Security/privacy reviewer; product owner; qualified clinician.
- **Mandatory blocker:** Both.
- **Original dependencies:** DW-OD-17, DW-OD-21, DW-OD-34.
- **Evidence / information needed:** Endpoint 403/404 behavior, enumeration threat model, emergency and usable diagnostics.
- **Can this decision be deferred without weakening P0 acceptance?** No. Product/security review user-visible consequences; engineering specifies precise statuses.
- **Original approval:** PENDING; proposed routing and any eventual technical/clinical resolution are also pending.

#### DW-OD-27
- **Original question:** Are new events, enum states, columns or a schema migration necessary for cancellation, supersession, decision times, scope revision, durable expiry or per-document grants?
- **Proposed responsible decision-maker:** Technical lead.
- **Required reviewers:** Database/security reviewer; privacy/legal reviewer; owner for separate migration authorization.
- **Mandatory blocker:** Both.
- **Original dependencies:** DW-OD-09, DW-OD-15, DW-OD-25, DW-OD-26, DW-OD-28, DW-OD-29, DW-OD-32.
- **Evidence / information needed:** Approved state semantics, existing schema sufficiency, compatibility, retention, constraints and rollback analysis.
- **Can this decision be deferred without weakening P0 acceptance?** No. Technical determination cannot authorize schema work: any required migration needs separate approval; migration itself is deferrable only if demonstrably unnecessary for accepted semantics.
- **Original approval:** PENDING; proposed routing and any eventual technical/clinical resolution are also pending.

#### DW-OD-31
- **Original question:** What trusted database time source and monitoring are required, especially if the clock moves backward?
- **Proposed responsible decision-maker:** Technical lead.
- **Required reviewers:** Operations/SRE; security reviewer; owner for residual-risk policy.
- **Mandatory blocker:** DW-P0-01.
- **Original dependencies:** DW-OD-02, DW-OD-32, DW-OD-33, DW-OD-40.
- **Evidence / information needed:** DB clock behavior, timezone assumptions, anomaly detection and deployment environment capabilities.
- **Can this decision be deferred without weakening P0 acceptance?** No. Technical lead proposes evidence-backed time/monitoring design; owner handles risk tolerance in OD-33.
- **Original approval:** PENDING; proposed routing and any eventual technical/clinical resolution are also pending.

#### DW-OD-32
- **Original question:** Should an observed lapse be durably recorded and audited to prevent later revival after clock rollback?
- **Proposed responsible decision-maker:** Technical lead.
- **Required reviewers:** Privacy/security reviewer; owner for lapse/history policy.
- **Mandatory blocker:** DW-P0-01.
- **Original dependencies:** DW-OD-02, DW-OD-07, DW-OD-27, DW-OD-31.
- **Evidence / information needed:** Observed-lapse non-revival requirement, transaction/ledger consequences and schema sufficiency.
- **Can this decision be deferred without weakening P0 acceptance?** No. Mechanism follows policy; owner/privacy reviews durable lapse meaning and any migration separately.
- **Original approval:** PENDING; proposed routing and any eventual technical/clinical resolution are also pending.

#### DW-OD-41
- **Original question:** Are isolated, test-only transaction barriers and independent PostgreSQL connections approved for concurrency evidence?
- **Proposed responsible decision-maker:** Technical lead.
- **Required reviewers:** Database/security reviewer; QA lead.
- **Mandatory blocker:** Both.
- **Original dependencies:** DW-OD-07, DW-OD-43.
- **Evidence / information needed:** Independent DB connection/barrier design, observed blocking, isolation and nonproduction-hook proof.
- **Can this decision be deferred without weakening P0 acceptance?** No. Barrier implementation is an engineering choice; real isolated PostgreSQL race proof remains mandatory.
- **Original approval:** PENDING; proposed routing and any eventual technical/clinical resolution are also pending.

#### DW-OD-42
- **Original question:** What resource and timeout limits are acceptable for isolated concurrency, HTTP and browser verification?
- **Proposed responsible decision-maker:** Technical lead.
- **Required reviewers:** QA lead; operations/SRE.
- **Mandatory blocker:** Both.
- **Original dependencies:** DW-OD-04, DW-OD-41, DW-OD-43.
- **Evidence / information needed:** Disposable-environment measurements, bounded waits, concurrency and artifact budgets.
- **Can this decision be deferred without weakening P0 acceptance?** No. Technical lead sets evidence-based limits; no arbitrary owner-selected values or weakened tests.
- **Original approval:** PENDING; proposed routing and any eventual technical/clinical resolution are also pending.

#### DW-OD-43
- **Original question:** Which production-like connection and transaction modes must the isolated suite validate before release?
- **Proposed responsible decision-maker:** Technical lead.
- **Required reviewers:** Database/operations reviewer; QA lead.
- **Mandatory blocker:** Both.
- **Original dependencies:** DW-OD-07, DW-OD-41, DW-OD-42.
- **Evidence / information needed:** Supported deployment modes and pooler semantics, isolated equivalents and gap evidence.
- **Can this decision be deferred without weakening P0 acceptance?** No. Do not use shared or production DB; untested required modes remain a release blocker.
- **Original approval:** PENDING; proposed routing and any eventual technical/clinical resolution are also pending.

#### DW-OD-48
- **Original question:** How should unknown, malformed or incomplete scopes and invalid scope parameters be handled?
- **Proposed responsible decision-maker:** Technical lead.
- **Required reviewers:** Security/privacy reviewer; qualified clinician.
- **Mandatory blocker:** DW-P0-02.
- **Original dependencies:** DW-OD-11, DW-OD-12, DW-OD-13, DW-OD-15, DW-OD-24.
- **Evidence / information needed:** Malformed scope examples, validation rules, error semantics and legacy data behavior.
- **Can this decision be deferred without weakening P0 acceptance?** No. Engineering must fail closed without widening; owner reviews user-impacting policy exceptions.
- **Original approval:** PENDING; proposed routing and any eventual technical/clinical resolution are also pending.


### C. Clinical decisions — qualified clinical review

#### DW-OD-10
- **Original question:** Which allergy, condition and medication safety facts are authorized in each narrow scope?
- **Proposed responsible decision-maker:** Qualified clinical lead.
- **Required reviewers:** Owner/privacy lead; technical lead.
- **Mandatory blocker:** DW-P0-02.
- **Original dependencies:** DW-OD-11, DW-OD-12, DW-OD-13, DW-OD-16.
- **Evidence / information needed:** Clinical rationale for each safety fact, patient scope meaning and effects of absent information.
- **Can this decision be deferred without weakening P0 acceptance?** No. Clinical opinion cannot itself grant data access; owner/privacy must approve scope.
- **Original approval:** PENDING; proposed routing and any eventual technical/clinical resolution are also pending.

#### DW-OD-11
- **Original question:** What fields and rows should SUMMARY_ONLY authorize before retrieval and safety processing?
- **Proposed responsible decision-maker:** Qualified clinical lead.
- **Required reviewers:** Owner/privacy lead; technical lead.
- **Mandatory blocker:** DW-P0-02.
- **Original dependencies:** DW-OD-09, DW-OD-10, DW-OD-15.
- **Evidence / information needed:** Summary section and field matrix, safety inputs and synthetic negative test plan.
- **Can this decision be deferred without weakening P0 acceptance?** No. Owner/privacy must approve patient-facing scope; clinical lead assesses safe use.
- **Original approval:** PENDING; proposed routing and any eventual technical/clinical resolution are also pending.

#### DW-OD-12
- **Original question:** For LAST_N_ENCOUNTERS, what N, ordering, tie-breaks, limits and linked-row rules should determine the shared record?
- **Proposed responsible decision-maker:** Qualified clinical lead.
- **Required reviewers:** Owner/privacy lead; technical lead.
- **Mandatory blocker:** DW-P0-02.
- **Original dependencies:** DW-OD-10, DW-OD-14, DW-OD-15.
- **Evidence / information needed:** Clinical rationale for N and linked history; deterministic ordering, limits and existing behavior.
- **Can this decision be deferred without weakening P0 acceptance?** No. Technical lead determines tie-break implementation; owner approves scope and clinician reviews sufficiency.
- **Original approval:** PENDING; proposed routing and any eventual technical/clinical resolution are also pending.

#### DW-OD-13
- **Original question:** For SPECIFIC_CONDITION, how may encounters be matched and which linked data are shared?
- **Proposed responsible decision-maker:** Qualified clinical lead.
- **Required reviewers:** Owner/privacy lead; technical lead.
- **Mandatory blocker:** DW-P0-02.
- **Original dependencies:** DW-OD-10, DW-OD-15, DW-OD-27.
- **Evidence / information needed:** Condition matching semantics, false-match/miss cases, SQL predicate evaluation versus returned data.
- **Can this decision be deferred without weakening P0 acceptance?** No. Owner/privacy must decide if predicate evaluation of nonmatching text is permitted; no assumption of zero DB access.
- **Original approval:** PENDING; proposed routing and any eventual technical/clinical resolution are also pending.

#### DW-OD-14
- **Original question:** Should unlinked labs, observations and nullable encounter-linked prescriptions be visible under LAST_N_ENCOUNTERS?
- **Proposed responsible decision-maker:** Qualified clinical lead.
- **Required reviewers:** Owner/privacy lead; technical lead.
- **Mandatory blocker:** DW-P0-02.
- **Original dependencies:** DW-OD-12, DW-OD-15.
- **Evidence / information needed:** Present unlinked-row behavior and clinical impact of inclusion/exclusion.
- **Can this decision be deferred without weakening P0 acceptance?** No. Exclusion changes existing scope behavior; no recommendation is already approved.
- **Original approval:** PENDING; proposed routing and any eventual technical/clinical resolution are also pending.

#### DW-OD-16
- **Original question:** Must a restricted clinical write be refused when essential safety inputs are not authorized?
- **Proposed responsible decision-maker:** Qualified clinical lead.
- **Required reviewers:** Owner/privacy lead; technical lead.
- **Mandatory blocker:** DW-P0-02.
- **Original dependencies:** DW-OD-10, DW-OD-11, DW-OD-12, DW-OD-13, DW-OD-14.
- **Evidence / information needed:** Essential safety facts per write, rule limitations, and generic denial/approval workflow.
- **Can this decision be deferred without weakening P0 acceptance?** No. No silent scope widening; clinician defines safe prerequisites, owner/privacy approves resulting scope.
- **Original approval:** PENDING; proposed routing and any eventual technical/clinical resolution are also pending.


### D. Release governance — separately identified

#### DW-OD-46
- **Original question:** What release and rollback gate is required when the authorization protocol spans multiple routes and consent writers?
- **Proposed responsible decision-maker:** Release owner / product owner.
- **Required reviewers:** Technical lead; security/privacy reviewer; qualified clinician; QA lead.
- **Mandatory blocker:** Both.
- **Original dependencies:** DW-OD-07, DW-OD-27, DW-OD-41, DW-OD-42, DW-OD-43.
- **Evidence / information needed:** Complete test results, unresolved risk, atomic release plan and safe rollback/access restrictions.
- **Can this decision be deferred without weakening P0 acceptance?** No. No release, migration, deployment or acceptance authorized by this pack.
- **Original approval:** PENDING; proposed routing and any eventual technical/clinical resolution are also pending.


## Proposed approval sequence — NOT APPROVED

1. Technical lead and security/privacy reviewer produce an evidence-based lock/path and data-flow map, including the dependency-cycle explanation, time assumptions and options. Identify any migration need; do not implement or apply one.
2. Owner/privacy reviewers settle authorization, verification, metadata, history, expiry risk, audit and emergency **policy** using that evidence. In parallel, qualified clinicians assess scope matrices, essential safety facts, write refusal and emergency-care consequences. Resolve interdependent decisions together without merging their IDs.
3. Technical lead specifies synchronization, scope-query boundaries, audit failure handling, time monitoring, synthetic test design, production-like transaction compatibility and measured resource limits. Escalate consequential policy or residual-risk trade-offs, not low-level lock selection.
4. After decisions and separate implementation authorization, execute the full review-required isolated test and browser gates. Release owner reviews actual evidence, open risks and rollback restrictions, then makes a separate go/no-go decision. Any necessary migration, shared/production database operation, deployment, commit, push or PR requires its own authorization. Until all acceptance criteria pass and the owner explicitly accepts, both P0 findings remain OPEN / NOT ACCEPTED.

**Evidence status:** This pack is derived from existing documents; none of the proposed tests, clinical reviews, policy choices or release decisions was performed or approved by creating it.
