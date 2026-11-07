# DW-P0 decision resolution tracker

**All 48 original owner approvals remain PENDING. DW-P0-01 and DW-P0-02 remain OPEN / NOT ACCEPTED.** This is a planning view of `OWNER_DECISION_REGISTER.md` and `OWNER_APPROVAL_PACK.md`; it does not amend their questions, options, risks, recommendations, dependencies or blocker labels. No decision, clinical opinion, implementation, deferral, release or acceptance is approved by this tracker.

## Status and classification key

Each row has five **separate** status columns. **P** means PENDING, not approved/completed. **UA** in clinical means review applicability is **unassessed**, not that a clinical review is unnecessary; **P** means a clinical reviewer is identified in the approval pack and review is pending. Technical disposition is pending for every ID, including policy questions with engineering consequences. Implementation requirement is pending for every ID: it records that the precise work and whether it is required still need disposition, not that code is already authorized or necessarily needed. P0 dependency status is pending; the source blocker label follows it unchanged. Original owner/policy approval is PENDING for all 48, including proposed technical and clinical routing.

**Nature** is a routing aid, not another approval status:
- **Decision** — resolve the question; a decision alone does not establish that a feature must ship.
- **Core control/evidence** — the milestone requires an effective control or real evidence; implementation/test design is pending, not a new feature request. Actual implementation and verification remain outstanding.
- **Fail-closed option** — the decision may be resolved by an explicitly approved, implemented where necessary, and tested fail-closed behavior instead of building broader functionality. Merely proposing it is not an approval or a deferral.
- **Conditional change** — a schema/durable-state mechanism or migration may or may not be needed; technical proof and, if applicable, separate authorization are required. No migration is authorized.
- **Release gate** — a governance go/no-go criterion, not a feature. All release and acceptance decisions remain pending.

**Route** A = proposed owner/policy, B = proposed technical lead, C = proposed qualified clinical review, D = release governance; these routes do not change the original approval fields. **Deps** reproduces every source dependency in source order; numbers are all `DW-OD-` IDs. **Both** means both P0 findings. A P0 blocker is not automatically a requirement to implement a particular optional feature.

## Milestone constraints and P0 boundary candidates

- **OD-01:** the task specifies that an operation authorized before revocation may finish while holding authorization synchronization, and revocation waits; after revoke commits, later attempts cannot use stale authorization. Formal owner policy confirmation remains **PENDING**; the technical implementation is also pending.
- **OD-02:** the design-review target allows work authorized before expiry to finish while later operations are denied after expiry. Formal owner policy confirmation remains **PENDING**; this is the review target, not evidence of a prior approved owner decision.
- **OD-17–23 and OD-40:** candidates for a **separately reviewed P0 boundary decision** concerning independently purposed metadata/auditing and erasure receipt policy. All retain their source **Both** blocker labels and PENDING status. This is a request for review, not a proposed automatic downgrade, deferral, or permission to leave a leakage or erasure race unaddressed. Any boundary change would need explicit owner/security/privacy review, relevant clinical/legal review, preserved acceptance criteria, and a separately recorded decision.
- **OD-15:** selected-document functionality need not be conflated with the mandatory decision: a tested, explicitly approved denial for the unsupported scope is a possible resolution. **OD-16:** a refusal when required safety inputs are unavailable is a possible resolution, not approval to weaken safety checks. **OD-48:** denial on malformed scope is a possible resolution, not permission to widen. Each remains PENDING and its source blocker is unchanged.

## Per-decision tracker

| ID | Short topic | Route | Nature | Owner / policy approval | Technical disposition | Clinical review | Implementation requirement | P0 acceptance dependency | Source dependencies (DW-OD-) |
|---|---|---|---|---|---|---|---|---|---|

| DW-OD-01 | Authorization vs revoke | A | Core control/evidence | P | P | P | P | P — DW-P0-01 | 03, 07, 08 |
| DW-OD-02 | Expiry after authorization | A | Core control/evidence | P | P | P | P | P — DW-P0-01 | 01, 31, 32 |
| DW-OD-03 | Response / link / download / print | A | Core control/evidence | P | P | P | P | P — Both | 01, 08, 35, 37 |
| DW-OD-04 | Wait and timeout policy | B | Decision | P | P | UA | P | P — DW-P0-01 | 01, 08, 40 |
| DW-OD-05 | Unknown commit outcome | B | Decision | P | P | P | P | P — DW-P0-01 | 04, 38, 41 |
| DW-OD-06 | Doctor verification / suspension | A | Decision | P | P | P | P | P — DW-P0-01 | 01, 07, 08 |
| DW-OD-07 | Cross-writer synchronization | B | Core control/evidence | P | P | UA | P | P — DW-P0-01 | 01, 06, 25, 26, 40, 43 |
| DW-OD-08 | Session and account deactivation | A | Decision | P | P | UA | P | P — DW-P0-01 | 06, 07, 04 |
| DW-OD-09 | Demographics / guardian / ABHA | A | Decision | P | P | P | P | P — DW-P0-02 | 11, 12, 13, 16 |
| DW-OD-10 | Safety facts by narrow scope | C | Decision | P | P | P | P | P — DW-P0-02 | 11, 12, 13, 16 |
| DW-OD-11 | SUMMARY_ONLY | C | Decision | P | P | P | P | P — DW-P0-02 | 09, 10, 15 |
| DW-OD-12 | LAST_N selection | C | Decision | P | P | P | P | P — DW-P0-02 | 10, 14, 15 |
| DW-OD-13 | SPECIFIC_CONDITION | C | Decision | P | P | P | P | P — DW-P0-02 | 10, 15, 27 |
| DW-OD-14 | Unlinked clinical rows | C | Decision | P | P | P | P | P — DW-P0-02 | 12, 15 |
| DW-OD-15 | SPECIFIC_DOCUMENTS | A | Fail-closed option | P | P | P | P | P — DW-P0-02 | 09, 13, 27, 43 |
| DW-OD-16 | Restricted-write safety | C | Fail-closed option | P | P | P | P | P — DW-P0-02 | 10, 11, 12, 13, 14 |
| DW-OD-17 | Appointment reasons after withdrawal | A | Decision | P | P | P | P | P — Both | 23, 24 |
| DW-OD-18 | Own consultation dates after withdrawal | A | Decision | P | P | P | P | P — Both | 23, 24 |
| DW-OD-19 | Activity after withdrawal | A | Decision | P | P | P | P | P — Both | 23, 35, 37 |
| DW-OD-20 | Notifications after withdrawal | A | Decision | P | P | P | P | P — Both | 23, 37 |
| DW-OD-21 | Connected identifiers after withdrawal | A | Decision | P | P | P | P | P — Both | 09, 17, 18, 19, 20, 24 |
| DW-OD-22 | Audit metadata reads | A | Decision | P | P | UA | P | P — Both | 17, 18, 19, 20, 21, 35, 37 |
| DW-OD-23 | Independent purpose / retention | A | Decision | P | P | P | P | P — Both | 17, 18, 19, 20, 21 |
| DW-OD-24 | Existence-oracle errors | B | Decision | P | P | P | P | P — Both | 17, 21, 34 |
| DW-OD-25 | Pending request cancellation | A | Decision | P | P | UA | P | P — Both | 27, 28, 29 |
| DW-OD-26 | Emergency supersession | A | Decision | P | P | P | P | P — Both | 25, 27, 44 |
| DW-OD-27 | Schema / migration need | B | Conditional change | P | P | UA | P | P — Both | 09, 15, 25, 26, 28, 29, 32 |
| DW-OD-28 | Denial timestamp | A | Decision | P | P | UA | P | P — Both | 25, 27, 29 |
| DW-OD-29 | Ambiguous legacy history | A | Decision | P | P | UA | P | P — Both | 25, 26, 28 |
| DW-OD-30 | Requested vs approved scope history | A | Decision | P | P | UA | P | P — DW-P0-02 | 27, 29, 37 |
| DW-OD-31 | Trusted clock / monitoring | B | Decision | P | P | UA | P | P — DW-P0-01 | 02, 32, 33, 40 |
| DW-OD-32 | Persist observed lapse | B | Conditional change | P | P | UA | P | P — DW-P0-01 | 02, 07, 27, 31 |
| DW-OD-33 | Unobserved clock rollback | A | Decision | P | P | UA | P | P — DW-P0-01 | 31, 32, 40 |
| DW-OD-34 | Record / print audit | A | Decision | P | P | P | P | P — Both | 01, 03, 36, 37 |
| DW-OD-35 | Link mint audit | A | Decision | P | P | UA | P | P — Both | 03, 36, 38, 39 |
| DW-OD-36 | Actual download audit | A | Decision | P | P | UA | P | P — Both | 03, 35, 38 |
| DW-OD-37 | Denial audit | A | Decision | P | P | UA | P | P — Both | 24, 38, 39 |
| DW-OD-38 | Permitted audit metadata | A | Decision | P | P | P | P | P — Both | 09, 10, 34, 35, 36, 37 |
| DW-OD-39 | Audit outage | A | Decision | P | P | P | P | P — Both | 34, 35, 36, 37, 38 |
| DW-OD-40 | Erasure audit receipt | A | Decision | P | P | UA | P | P — Both | 07, 39 |
| DW-OD-41 | PostgreSQL barriers | B | Core control/evidence | P | P | UA | P | P — Both | 07, 43 |
| DW-OD-42 | Test resources / timeouts | B | Core control/evidence | P | P | UA | P | P — Both | 04, 41, 43 |
| DW-OD-43 | Connection modes | B | Core control/evidence | P | P | UA | P | P — Both | 07, 41, 42 |
| DW-OD-44 | Emergency re-grant | A | Decision | P | P | P | P | P — Both | 06, 07, 26, 45 |
| DW-OD-45 | Break-glass workflow | A | Decision | P | P | P | P | P — Both | 06, 24, 26, 44 |
| DW-OD-46 | Release / rollback | D | Release gate | P | P | P | P | P — Both | 07, 27, 41, 42, 43 |
| DW-OD-47 | FULL_RECORD | A | Decision | P | P | P | P | P — DW-P0-02 | 09, 10, 15, 24 |
| DW-OD-48 | Malformed scopes | B | Fail-closed option | P | P | P | P | P — DW-P0-02 | 11, 12, 13, 15, 24 |


## Source dependency cycles — unresolved

Treating each source dependency as a directed edge from decision to listed input, the graph has one nontrivial strongly connected component: **DW-OD-{01, 02, 03, 04, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 23, 24, 25, 26, 27, 28, 29, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45}**. Each of those nodes can reach every other through source edges; this does not mean every pair has a direct dependency. Examples of direct cycles include **09 ↔ 11**, **41 ↔ 43**, **25 ↔ 27**, and **35 ↔ 36**; a longer example is **01 → 03 → 35 → 36 → 03** (the last three form a cycle; 01 links into it). The other IDs are not members of a directed cycle under this source graph. All edges remain exactly as recorded in the table and source register; no prerequisite has been removed or treated as already met. These edges express related review inputs, not a proven serial order. Technical and policy reviewers should assess whether edges, including the approval pack's flagged OD-04/31/33 → OD-40 and OD-15 → OD-43, are necessary; revise only through a separate explicit review.

## Next evidence, not decisions

Technical lead: map all writer/row/ledger lock interactions and collect isolated synthetic PostgreSQL concurrency and scope-isolation evidence only after appropriate implementation/test authorization. Owner/privacy and qualified clinical reviewers: resolve the policy, data-scope and safety inputs separately. Release owner: apply OD-46 only after the required evidence exists. No existing historical QA is proof of these P0 gates. The original 51-ID drawback crosswalk remains unchanged in `CITYCARE_MASTER_GAP_REGISTER.md`.
