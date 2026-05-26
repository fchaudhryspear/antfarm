# RFC: Antfarm v3.1 — Multi-Tenant Software Factory

**Status:** Draft v0.15 (FREEZE CANDIDATE — minor cross-reference cleanup only; defensible for red-team)
**Author:** Faisal Chaudhry (via Claude)
**Reviewers required:** Simon (backend/security/compliance), Atlas (infrastructure/multi-tenant ledger), Ross (review semantics/redaction), Leo (frontend/dashboard tenant filter), Day2 Ops (operator escalation tier — planned-but-pending per Q10)
**Target:** Antfarm v3.1 software factory across six operating companies
**Predecessor:** Antfarm v3.0 RFC v0.7 + `11 — Closure Notes`

**Changelog v0.14 → v0.15** (thirteenth review pass — 2 findings, both cleanup; no design changes):
- **MEDIUM §10.4 test 8 wording corrected**: v0.14 test 8 said "the sweep MUST never read or write to `factory_system_events`," but §10.4 implementation deliberately writes `retention_sweep_summary` and `retention_sweep_deletion` to that table. Internal contradiction. Resolution: rewrite test 8 to allow the intended writes while preserving the structural protection — the sweep may **append** sweep-evidence rows to `factory_system_events`, but must never read from, filter against, delete from, or retain against `factory_system_events`. Append-only access is the operational rule.
- **MEDIUM §6.3 stale audit table/column names corrected**: §6.3 schema-impact bullet said `factory_events.payload` and `compliance_audit_log.payload`. Two errors: (a) the verified schema column is `payload_json`, not `payload`; (b) `compliance_audit_log` is not a v3.1 table — the v3.1 audit table is `factory_tenant_audit_log` (§11). Corrected to `factory_events.payload_json` and `factory_tenant_audit_log.payload_json`. Both names now match the verified schema (§5.2) and the v3.1 new-table inventory (§11). Worth flagging operationally: this v3.0-era prose error survived all twelve previous review rounds — nobody re-read §6 against the verified schema once §5.2 went VERIFIED. Suggests a "re-read older sections against newly-verified facts" pass would be worth doing once before red-team.

**Changelog v0.13 → v0.14** (twelfth review pass — Option C cross-reference cleanup; no design changes):
- **HIGH §6 config_sync write target fixed**: §6.3.1.1 step 4 in the RTBF state machine logged `config_sync` events to `factory_events`. Under Option C (v0.13), `factory_events` has `factory_item_id NOT NULL` and cannot store config-sync rows (no factory_item parent). Corrected to write to `factory_system_events` — the exact bug class Option C was designed to eliminate.
- **MEDIUM retention_sweep_summary write target conflict resolved**: §10.4 said sweep summaries land in `factory_tenant_audit_log`; §11 listed `retention_sweep_summary` as a `factory_system_events` example row. v0.14 picks one: **sweep summaries land in `factory_system_events`** (they describe runtime/system meta, not tenant audit events). `factory_tenant_audit_log` retains the actual tenant/operator audit rows being swept. §10.4 implementation and configuration blocks updated accordingly.
- **MEDIUM schema artifact header self-consistency fix**: artifact header in v0.13 said hash `b486267a...` and 174 lines, which were both stale — actual file at v0.13 was hash `f2aab41f...` and 176 lines. v0.14 edits the header to drop the self-referential hash field (the RFC is canonical for the hash, not the header) and corrects line counts. Header edit changed the artifact MD5 again: v0.13 `f2aab41f99a7144b868729dfcd07b720` → v0.14 `5dac653ec7a187f0faa7605e10835753`. File stays 176 lines. All live RFC citations updated to the v0.14 hash; v0.13 hash remains in changelog history for traceability.
- **LOW §14 v0.8 → v0.13/v0.14 version reference**: §14 checklist Q2 entry said "v0.8 ships with 11 action types." Now reflects current RFC version.

**Changelog v0.12 → v0.13** (eleventh review pass — 4 findings, one schema-design contradiction):
- **§5.1.1 / §5.3 factory_events classification corrected (HIGH)**: factory_events has `factory_item_id TEXT NOT NULL` per the verified schema, which means it cannot store true system-level events. v0.12's classification of factory_events as `audit_global` was incompatible with its actual schema. Resolution: factory_events reclassified to `tenant_scoped` (what its schema actually does — events about factory work, always attached to a factory_item). A new `factory_system_events` table is added to §11 for genuine `audit_global` rows (runtime startup, config reload, retention sweep summary, system meta). The deny-by-default validator in §5.3 Step 4b now operates over factory_system_events for system-level events; factory_events stays in the tenant_scoped migration path.
- **Runtime dormancy claims backed by second artifact**: v0.12 cited row counts, max timestamps, log queries, and LaunchAgent state without an artifact backing those claims. New artifact `antfarm-runtime-evidence-2026-05-24.md` (MD5 `c15470411d4272e565fa8962cad4f2a7`, 216 lines) captures eight observations with commands and outputs. RFC now cites both artifacts: `antfarm-schema-snapshot-2026-05-24.sql` for schema, `antfarm-runtime-evidence-2026-05-24.md` for state.
- **"Seven factory_* tables" vs "net-new v3.1 tables" disambiguated**: §4 prereq #2 and §5.2 now say "seven v3.0-landed factory_* tables" (verified). §11 was 7 net-new in v0.12 and is now **8 net-new** in v0.13 (added `factory_system_events`). No longer collides — different counts, different tables, different purposes.
- **Schema artifact header line-count clarified**: artifact header now states "Raw sqlite3 .schema output: 167 lines of DDL; this file total (including header): 174 lines per wc -l" — addresses the 167 vs 174 discrepancy. Note: header edit changed the schema artifact MD5 from `b486267a0a3e7ade772a4587347a6b9d` to `f2aab41f99a7144b868729dfcd07b720` (file size 176 lines now). RFC citations updated to the new hash. *[Note: v0.14 edited the header again to drop the self-referential hash field; current hash is `5dac653ec7a187f0faa7605e10835753` per v0.14 changelog.]*

**Changelog v0.11 → v0.12** (live system verification pass — schema confirmed via artifact; runtime gap surfaced and gated):
- **§5.2 STUB → VERIFIED with concrete schema artifact**: schema was inspected against the live antfarm.db at `/Users/faisalshomemacmini/.openclaw/antfarm/antfarm.db` (size 14,946,304 bytes, mtime 2026-05-24 02:00). Schema output captured as `antfarm-schema-snapshot-2026-05-24.sql` (MD5 `b486267a0a3e7ade772a4587347a6b9d`, 174 lines). All seven `factory_*` tables present with the column definitions §5 / §11 assumed. v2 tables (`runs`, `steps`, `stories`, `medic_checks`, `agent_stats`, `session_heartbeats`, `cron_idle_ticks`) confirmed present with their existing structure. Verification is concrete (artifact + hash + path + timestamp), not a paraphrased trust claim.
- **§4 prereq #6 added — Antfarm execution runtime activation gate** (runtime-model-agnostic): "Antfarm execution runtime activation verified: gateway can dispatch a workflow, the runtime processes it, and the ledger records factory_items → factory_runs → factory_events evidence." LaunchAgent, gateway-managed process, external orchestrator, or any other process model all qualify as long as the evidence chain lands. Required because live DB inspection on 2026-05-24 confirmed `factory_*` tables at 0 rows and v2 tables with no writes since 2026-05-19 — the multi-tenant design otherwise assumes a runtime that does not currently exist in any verifiable form.
- **Phase C entry/exit explicitly gated on §4 prereq #6**: Phase C ("Flobase as prototype tenant") cannot begin until runtime activation evidence is in hand. Phase C exit additionally requires Flobase-tenant-scoped execution proven via the same evidence chain with `tenant_id` populated on all rows.
- **§13 Q11 added — dormancy acknowledgment**: explicit documentation that the antfarm execution runtime is currently dormant (verified 2026-05-24) and that activation work is operationally separate from v3.1 multi-tenant design. Activation tracked as a separate Linear issue in the v3.1 project, not as RFC scope.
- **§14 checklist additions**: §4 prereq #6 runtime activation, §5.2 schema verification artifact reference, §13 Q11 dormancy acknowledgment.
- **Status updated to FREEZE CANDIDATE**: v0.12 is the freeze candidate, not final freeze. Final freeze requires either (a) genuine v3.1 red-team pass with independent reviewer artifacts (the discipline originally intended for v3.0), or (b) explicit Faisal decision to repeat the v3.0 single-approver shortcut with documented acceptance of that narrowing as a deliberate choice rather than an accident.

**Changelog v0.10 → v0.11** (ninth review pass — 4 findings, two retention-policy clarifications):
- **§10.4 incident-response retention semantics fixed**: v0.10 said incident-response events "inherit parent-action retention," but incident-response events ARE the evidence/parent. For top-level `incident_response_taken` rows with `parent_action_id IS NULL`, "inherit parent" was undefined. Replaced with explicit policy: incident-response events are retained under their own evidence policy (indefinite at v3.1); when they reference a parent, retention is the LONGER of parent retention or incident-response retention.
- **§10.4 parent_action_id retention bypass closed**: v0.10's "inherits parent retention if `parent_action_id IS NOT NULL`" was an easy retention bypass — attach a routine action to an incident parent, escape the 90-day sweep. Tightened: child inheritance requires explicit `event_chain_type IN ('incident_workflow', 'rtbf_workflow', 'compliance_audit_chain')`. Plain causal references via `parent_action_id` are not sufficient to extend retention; the event chain must be one of the enumerated retention-preserving chains.
- **Typo §1 "deferss" → "defers"**.
- **§13 Q2 version stale**: said v0.9 in v0.10 doc. Now v0.11.

**Changelog v0.9 → v0.10** (eighth review pass — 4 findings, one runtime-impacting):
- **§10.4 retention filter precision (HIGH)**: v0.9 said "exclude incident-response events" in prose but the SQL filter `actor_role = 'day2_ops'` would match them anyway. As written, a 90-day-old `incident_response` event could be deleted right when Faisal might want to retroactively reverse it. Fix: filter now explicitly excludes `event_type IN ('incident_response_taken', 'incident_response_reversed')` from the sweep. Test case added requiring `incident_response` rows survive >90 days while `routine_fixes` rows get swept.
- **§14 checklist Day2 Ops language stale**: still said "integration contract" in two places after v0.9 renamed to "interface design." Updated both.
- **§1/§2 summary/motivation overclaim**: still said "Day2 Ops going live in 1-2 weeks" and "v3.1 closes the single-approver bottleneck." v0.9's actual posture is planned-but-pending with single-approver remaining default. Reworded to reflect honest state.
- **§13 Q9 phrasing**: said "90 days flat for all Day2 Ops actions" but §10.4 has incident-response exception. Rephrased to "routine Day2 Ops actions" with explicit exception note.

**Changelog v0.8 → v0.9** (seventh review pass — 5 findings, two of them runtime-impacting):
- **§7.4.1 finance RTBF authority row added (HIGH)**: authority table had `rtbf_requests × pii | founder` but no `rtbf_requests × finance` entry. Under §7.4 deny-by-default semantics this means every Credologi/Flobase RTBF would DENY at runtime. Added `rtbf_requests × finance | founder`. `pii` row kept for future use.
- **§4 / §10 / §12 Day2 Ops phasing contradiction resolved (HIGH)**: Q10 said Day2 Ops platform can be delayed, but §4 prereq #4 still hard-gated Phase A/B on the Day2 Ops integration contract. v0.9 changes §4 prereq #4 from "Day2 Ops integration contract defined" (hard gate) to "Day2 Ops integration *interface design* defined" (still hard gate — we need to know the contract shape) plus moves the actual integration *implementation* to Phase E entry criterion. Phase B ships with `day2_ops` slot resolving to Faisal; Day2 Ops onboarding becomes a Phase E gate before non-finance tenants get Day2 Ops authority. §10.3 renamed and rescoped accordingly.
- **§6.3.1.2 YAML example and §12 Phase E text — UV cleanup**: §6.3.1.2 still showed `utility_valet: compliance_class: pii` as the Option B example; replaced with placeholder `pii_class_placeholder` to reflect Q4 reclassification. §12 Phase E text "Utility Valet (PII class; tests right-to-be-forgotten)" updated to reflect default-class onboarding without PII testing.
- **§10.4 Day2 Ops audit retention as normative rule**: Q9 resolution lived in changelog/open-questions/checklist but had no body section. New §10.4 normative section makes 90-day retention the implemented rule; flags expansion to finance-grade retention as deferred v3.2+ work.
- **§7.4 version reference**: said "v0.5 lists the initial enumeration"; now v0.9.

**Changelog v0.7 → v0.8** (Faisal answered all 10 open questions; structural changes encoded):
- **Q4 resolved — Utility Valet reclassified `pii` → `default`**: UV tenant PII lives in Zoho, never enters the antfarm factory. UV's compliance class drops to `default`. The `pii_v1` redaction ruleset has no current tenant. New field `pii_data_location: zoho` recorded in UV's `tenant_compliance.yaml` entry as explicit documentation. If UV PII is ever ingested into the factory, reclassify at that point.
- **§6 / §6.3.1 scoping narrowed**: RTBF mechanics (envelope keys, subject registry, state machine, Option A/B persistence) now apply only to `finance` class tenants (Credologi, Flobase). `pii` class infrastructure remains in the schema for future use but has zero current consumers.
- **Q6 resolved — bus-factor mitigation as bounded incident-response**: GPT 5.5-as-approver proposal rejected (LLM cannot hold founder-class authority for finance audit defensibility). Replaced with bounded pre-authorization: after 5 hours of Faisal non-response, Day2 Ops gains `incident_response` authority limited to 5 specific recovery actions. New finance-class deploys still require Faisal regardless of timeout. Added §7.4.2 covering the timeout escalation rule and pre-authorized action list.
- **Q9 resolved — Day2 Ops retention 90 days flat**: 60 days extended to 90 days per Faisal. No compliance-class override at v3.1; finance-class actions retained for 90 days same as default. Flagged in RFC as a deliberate v3.1 simplification with planned expansion; finance audit retention typically requires 7 years and current setting will need to grow before regulator audit becomes a real exposure.
- **Q3 resolved — Syncthing**: vault sync mechanism decided. §4 prereq #5 now reads "Syncthing per vault with separate sync configuration; sensitive vault sync limited to authorized devices documented in `agents.md`."
- **Q5 resolved — no model deny list**: all models in `default_v1` registry permitted for all tenants at v3.1. `compliance_eligible_tenants` field retained in registry schema for future use.
- **Q7 resolved — FCRP stays `default`**: holding company with simple operations; no elevation to `finance` at v3.1.
- **Q8 resolved — cross-tenant ledger search enabled**: scope limited to factory metadata (workflow_runs, work_units, deployment events, gate decisions). Excludes context pack content, Obsidian sensitive vault content, finance-class artifacts. Already enabled via §9.2 dashboard "show all" toggle for founder authority.
- **Q10 resolved — v3.1 built before Day2 Ops**: Day2 Ops platform delayed if needed; v3.1 ships with Day2 Ops as planned-but-pending participant.
- **§7.4 action types extended**: added `incident_response` (bounded to pre-authorized list per §7.4.2) and `tenant_lifecycle` (founder-only: archive tenant, change compliance class, register new tenant). 9 action types → 11.
- **§14 checklist restructured**: grouped by topic, resolved questions moved out of "open" status with explicit resolution captured inline. Q2 (Day2 Ops action types) remains open pending Day2 Ops operator onboarding.

**Changelog v0.6 → v0.7** (sixth review pass — 5 findings, all real):
- **§6.3.1 RTBF state machine added**: v0.6 claimed "forward-secrecy property" while also requiring envelope-key backups, which contradicts itself. New §6.3.1.1 defines three explicit RTBF states: `rtbf_requested` (deletion logged, envelope key still live and backed up), `rtbf_reversible` (envelope key destroyed in KMS but backups retained for legal hold window), `rtbf_finalized` (envelope key + all backups destroyed; forward-secrecy property holds). Legal hold suspends transition to `rtbf_finalized`.
- **§6.3.1 subject_id_hash persistence addressed**: preserving `subject_id_hash` plus a live per-tenant lookup key means anyone with the natural subject ID can still confirm a deleted subject's presence after RTBF. New §6.3.1.2 defines two options: (A) accept this as deliberate audit metadata with explicit policy framing, or (B) rotate the per-tenant lookup pepper at `rtbf_finalized` time, severing existing hash-to-identity correlation. Default is (A) for finance/PII tenants pending regulatory review; UV may require (B).
- **§5.3 Step 4b legacy_unclassified blind-spot mitigation**: backfilling to `tenant_optional` lets historical rows permanently escape tenant enforcement. Added requirement: every migration MUST count `legacy_unclassified` rows per table and attach to migration evidence. If count exceeds threshold (default: 5% of total table rows, configurable per table), manual classification is required before Step 5 transition.
- **§13 Q2 version reference**: said "v0.5 enumerates 9" in a v0.6/v0.7 document. Now v0.7.
- **§5.3 rollback typo**: said "triggers added in 4.4" — there is no Step 4.4. Now correctly references 4b.

**Changelog v0.5 → v0.6** (fifth review pass — 3 findings, all real):
- **§5.3 Step 4b event_type column safety**: v0.5 said "add `event_type TEXT NOT NULL` if not already present" — same SQLite NOT NULL bug the RFC already fixed for tenant_id. Step 4b now requires either pre-existing `event_type` column OR runs its own expand/backfill/rebuild sequence for `event_type` before conditional tenant enforcement.
- **§5.3 rollback path extended to Step 4b**: rollback covered Steps 1-4 but not Step 4b's triggers, validator config, or `event_type` column additions. Added explicit rollback for Step 4b artifacts; historical audit rows preserved.
- **§14 decision checklist updated for §6.3.1**: subject registry, KMS choice, envelope-key backup policy, deletion-proof recording, and recovery-key authority added as distinct checklist items. v0.5 only asked sign-off on §6.3 write-time hashing.

**Changelog v0.4 → v0.5** (fourth review pass — 4 findings, all real):
- **§5.3 Step 5 scoped to tenant_scoped operations**: "reject any operation without explicit tenant_id" conflicted with §5.1.1 — global_config and derived_mirror don't carry tenant_id, and audit_global is conditional. Step 5 now explicitly scopes to tenant_scoped tables; audit_global is delegated to Step 4b's event-type rules.
- **Phase B table count corrected to 7**: §11 was updated to 7 (added `factory_subject_registry`) but Phase B still said "6 new tables." Now matches.
- **Decision checklist table count corrected to 7**: same stale count as Phase B. Now matches §11.
- **§5.2 schema names marked as legacy/unverified**: provisional names like `deployment_events`, `smoke_test_runs`, `dashboard_audit_events`, `merge_queue_entries` weren't aligned with the `factory_` prefix convention adopted in §11. v0.5 explicitly labels these as legacy v3.0-era names pending §4 prereq #2 verification; once verified, either rename or document the actual landed names.
- **§7.4 version reference corrected**: said "v0.3 lists the initial enumeration"; now says v0.5.

**Changelog v0.3 → v0.4** (third review pass — 10 findings, all real):
- **§3.1 boundary table fixed**: "tenant_id scoping on every row" was stale from v0.2 before §5.1.1 classification existed. Updated to "tenant scoping by table class per §5.1.1."
- **§5.1.1 / §11 tenant_compliance classification unified**: was listed under both `global_config` and `derived_mirror`. Now consistently classified as `derived_mirror` (since `tenant_compliance.yaml` is the sole write authority per §7.1, the table is a read-side projection).
- **Version footer corrected**: said v0.2 in v0.3. Now matches header.
- **§5.3 audit_global migration rules added**: classification introduced nullable/event-dependent `tenant_id` for `audit_global` tables but migration didn't specify enforcement. New Step 4b adds event-type-based validation via application validator + trigger.
- **"Before v0.3 can freeze" stale language fixed**: replaced with "Before this RFC can freeze" or "before freeze" throughout.
- **§6.3.1 subject registry threat model added**: envelope-key design exposed a new question — how are subject identifiers themselves stored? Defined per-tenant subject registry with keyed-hash identifiers, envelope-key backup policy, and deletion-proof recording.
- **§6.2 Telegram deletion line corrected**: "destroy messages naming the subject" was an operational guarantee we can't make for external chat retention. Replaced with "never send raw PII in notifications by policy; existing messages best-effort deletion + audit."
- **Phase D renamed**: was "v3.2 production gate slice" (misleading — sounds like v3.2 work inside v3.1). Now "Minimal Production Gate Recording." v3.2 remains the full integration track separately.
- **§13 Q2 stale count fixed**: said "v0.2 enumerates 8 action types" — v0.3/v0.4 enumerate 9 including `promotion_review`. Updated.
- **§5.2 / §11 table naming consistency**: standardized to `factory_` prefix throughout (matching PR #11 schema as best inferred); names still provisional until §4 prereq #2 verifies against actual schema. Marked as provisional in both sections.

**Changelog v0.2 → v0.3** (second review pass — 10 findings, all real):
- **§10.3 stale Phase D trigger removed**: was v0.1 leftover that contradicted v0.2's phase reorder. Renamed to "Day2 Ops activation gate" and folded into Phase B.
- **§5.1/§5.2 table classification added**: replaces "every row gets tenant_id." New §5.1.1 classifies tables as `tenant_scoped`, `global_config`, `derived_mirror`, or `audit_global` with explicit rules per class.
- **§6.3 RTBF key design corrected**: per-tenant salt destruction broke audit correlation for the whole tenant. Replaced with per-subject envelope keys: destroy subject-specific key on RTBF, preserve tenant-level audit verifiability.
- **§7.4 promotion_review action type added**: was referenced in §8.5 but missing from enumeration, would have caused deny-by-default failures on every promotion. Now explicit.
- **§3 / §12.1 non-goal language reconciled**: v3.1 includes manual/stub event recording only; full integrations are v3.2. Both sections now say this consistently.
- **§7.1 config write authority decided**: `tenant_compliance.yaml` in Antfarm config repo is sole write authority. `tenants.yaml` carries only `compliance_class` as a duplicate, validated at startup; mismatch fails startup. `tenant_compliance` table is derived mirror only.
- **§9.1 dashboard response behavior unified**: out-of-scope reads return 404 (not empty + audit) for consistency. Cross-tenant *mutations* still return 403 + audit. Audit event existence is part of the test contract, not optional.
- **§12 "schema migration RFC" wording fixed**: changed to "implementation migration packet" — v3.1 design is *this* RFC, not a self-referential nested doc.
- **§7.4 timeout fallback authority bound**: fallback can only escalate to equal/higher authority, never substitute lower. Prevents finance/PII actions silently routing to lower-authority approvers after timeout.
- **Section count corrected**: 14 main sections plus §3.1 and §5.1.1, §12.1, §6.2/§6.3. Lint pass before each freeze.

**Changelog v0.1 → v0.2** (first review pass — 10 findings, all real):
- **Phase D → Phase A/B reordering**: Day2 Ops goes live in 1-2 weeks; was wrongly scheduled 10-12 weeks out. Day2 Ops identity, approval contract, fallback, and audit logging now land alongside schema/dashboard MVP, not after.
- **§5.2 actual schema inventory called out as stub**: v0.1 listed table names from RFC concepts (`workflow_runs`, `work_units`, etc.). Actual landed Antfarm schema from PR #11 uses `factory_items`, `factory_runs`, `factory_agent_runs`, etc. §5.2 now flags this as a hard prerequisite — RFC cannot freeze until inventory is verified against PR #11.
- **§5.3 SQLite migration sequencing**: replaced naive "add NOT NULL FK" with expand/backfill/enforce/rollback pattern. SQLite does not safely support naive constraint additions on existing tables.
- **§6.2 RTBF expanded to data-classification matrix**: v0.1 only covered context pack sources. PII can exist in artifacts, Obsidian notes, audit payloads, source refs, dashboard events, prompts, logs. New matrix covers all surfaces.
- **§7 tenant_compliance.yaml home anchored**: must live in Antfarm-controlled config (source of truth for runtime policy). Obsidian mirrors or explains; never owns approval state. Closes §13 Q1 by decree.
- **§7 deny-by-default policy evaluation**: v0.1's YAML examples were partial. v0.2 defines explicit policy evaluation algorithm; unknown actions deny.
- **§8 separate vault roots, not folders**: `obsidian/shared/` and `obsidian/sensitive/` as folders under one vault leak through global search and plugins. Now requires physically separate vault roots with separate sync mechanisms.
- **§9 tenant isolation at API/query layer**: dashboard tenant filter cannot rely on UI routing alone. Auth tokens scoped per tenant; API rejects cross-tenant queries; tests must prove a Day2 Ops token cannot query or mutate unauthorized tenants.
- **§12 v3.1/v3.2 boundary clarified**: v3.0 closure framed deploy/smoke/monitor as v3.1 continuation. v0.1 contradicted that without explanation. v0.2 adds explicit boundary table and a minimal v3.1 Day2-compatible production-gate integration slice.
- **§14 red-team discipline language corrected**: v3.0 collapsed red-team into agent-artifacts + Faisal approval. v3.1 explicitly requires independent reviewer artifacts. "Discipline intended for v3.0," not "discipline used."

---

## 1. Summary

Extend the v3.0 software factory from single-tenant runtime truth to a multi-tenant factory operating across six operating companies (Utility Valet, Spearhead, Flobase, Credologi, FCRP Capital, Starship Residential), with structural compliance separation for finance-class tenants (Credologi, Flobase) and an operator dashboard with tenant filter as a day-one feature. Day2 Ops is designed in as a second approver tier with a planned-but-pending activation — v3.1 ships with Faisal as sole approver and a `day2_ops` slot in `tenant_compliance.yaml` that resolves to Faisal until the §10.3 activation gate is met. If Day2 Ops platform goes live during the v3.1 implementation window, activation can happen during Phase B/C; if not, it defers to Phase E or later without blocking v3.1.

This RFC does not change the §3.1 architecture boundary established in v3.0. Antfarm v3 remains the factory kernel and execution ledger. Hermes remains the operator/control plane. Obsidian Dual Brain remains the synthesis mirror. v3.1 extends the schema; it does not redefine the layers.

## 2. Motivation

v3.0 closed with five known limitations that block real multi-company use:

1. **Single-tenant schema.** Every workflow_run/work_unit/artifact assumes one operating context. Running Flobase work alongside Credologi work in the same antfarm instance would today produce a corrupted ledger.
2. **No compliance class.** Finance (Credologi, Flobase) and PII (Utility Valet) operations should not flow through the same redaction ruleset, approval matrix, or retention policy as default-class work. Currently they would.
3. **No dashboard.** Per closure notes, §20 operator dashboard was deferred. Without it, six-company use means six separate Telegram channels and manual antfarm queries.
4. **Single-vault Obsidian.** v3.0 §22.9 designed the mirror for one knowledge surface. Compliance-scoped tenants need structural data separation, not behavioral filtering.
5. **Single-approver bottleneck.** Faisal is the only approver. The schema has no place for a second approver tier today, even though Day2 Ops is on roadmap as an external platform that will eventually integrate.

v3.1 closes items 1-4 fully and addresses item 5 partially: the schema gains a `day2_ops` slot in `tenant_compliance.yaml` and a bounded `incident_response` authority class (§7.4.2), but Day2 Ops as a live second approver remains planned-but-pending until §10.3 activation gate is met. The single-approver bottleneck is mitigated structurally (slot exists, design is ready) but not yet operationally resolved.

## 3. Non-Goals

v3.1 is explicit about what it does **not** cover, even though related work may be ongoing:

- **Full deploy/smoke/monitor integrations** per v3.0 §21 remain v3.2 scope. v3.1 includes manual/stub event recording only — schemas verified, manual entries supported, no real adapter implementations. The v3.1/v3.2 boundary is explicit in §12.1.
- **Reusable skills marketplace.** xHawk markets this. Internal use does not require a marketplace.
- **Slack/Teams intake adapters.** Telegram works. Adding Slack/Teams is feature-pull, not need-pull. Only revisit if a specific tenant requires it.
- **Cross-tenant federated search.** Single-vault search is appealing but the compliance cost is higher than the benefit. Deferred until evidence shows real cross-tenant synthesis value.
- **Onboarding all six tenants in v3.1.** Flobase is the prototype tenant. Other tenants onboard in Phase E, incrementally, gated by their own software cadence.
- **Day2 Ops platform itself.** v3.1 integrates with Day2 Ops as an approver; it does not build Day2 Ops.

## 3.1 System Ownership Boundaries (extended from v3.0)

| Layer | Owns | Does not own |
|-------|------|--------------|
| Antfarm v3.1 | All v3.0 entities + tenant scoping by table class per §5.1.1, `tenant_compliance.yaml` (sole write authority), `tenant_audit_log` table, `tenant_approver_assignments` | Tenant onboarding workflow, vault sync mechanism |
| Hermes | All v3.0 operator/control responsibilities + tenant-scoped intake routing, tenant-aware Telegram channels, dashboard auth | Tenant-internal business logic |
| Obsidian Dual Brain | All v3.0 mirror responsibilities, split across two vaults: `shared/` and `sensitive/` | Cross-vault federated search (deferred), runtime state |
| Dashboard (new) | Tenant-filtered read access to Antfarm, audit-logged operator actions via orchestrator commands | Source-of-truth state, direct DB writes |
| Day2 Ops (external integration) | Routine operator approvals per compliance class | Strategic product decisions (Faisal retains) |

## 4. Hard Prerequisites

v3.1 implementation does not start until these close:

1. **All v3.0 closure-notes action items** from `11 — Closure Notes` resolved: gateway cap propagation verified, 12-decision audit itemized, document numbering reconciled.
2. **VERIFIED 2026-05-24: PR #11 schema inventory confirmed against live antfarm.db.** Schema captured as `antfarm-schema-snapshot-2026-05-24.sql` (MD5 `5dac653ec7a187f0faa7605e10835753`, 176 lines: 167 lines of raw DDL plus 8 lines of header metadata). Source: `sqlite3 /Users/faisalshomemacmini/.openclaw/antfarm/antfarm.db ".schema"` executed 2026-05-24. Live DB file size at capture: 14,946,304 bytes; mtime 2026-05-24 02:00 UTC. **All seven v3.0-landed `factory_*` tables present** with the column definitions §5 / §11 assume: `factory_items`, `factory_runs`, `factory_agent_runs`, `factory_context_packs`, `factory_artifacts`, `factory_gates`, `factory_events`. (Note: these are distinct from the *eight net-new* v3.1 tables described in §11; the seven verified here are v3.0 schema, the eight in §11 are v3.1 additions.) Foreign-key bridges to v2 tables (`factory_runs.antfarm_run_id REFERENCES runs(id) ON DELETE SET NULL`, `factory_agent_runs.antfarm_step_id REFERENCES steps(id) ON DELETE SET NULL`) confirmed present as designed for the v2→v3 transition. Migration plan in §5.3 applies to these verified table names. Schema artifact accompanies this RFC.
3. **`tenant_compliance.yaml` schema agreed** — what fields, what compliance classes, what eligibility rules. This RFC's §7 proposes the schema; red-team must approve. **File location: Antfarm-controlled config repo** (not Obsidian — see §7).
4. **Day2 Ops integration interface design defined** — what does Day2 Ops expose for approval routing? API? Telegram bot? Linear comments? **The interface design** is the hard gate: §10 must specify the contract shape so v3.1 can be built against it. **The implementation** of the integration is not a Phase B blocker — Phase B ships with `day2_ops` slot resolving to Faisal if Day2 Ops platform is not yet live. See §10.3 for activation gate (now Phase E, not Phase B).
5. **Obsidian vault sync mechanism: Syncthing** (resolved per Q3). Two physically separate vault roots (see §8); separate Syncthing folder configuration per vault. The sensitive vault's Syncthing device allowlist is documented in `agents.md` and is itself a `founder`-class change — adding a device to the sensitive vault sync is a security_changes action per §7.4.
6. **Antfarm execution runtime activation verified** — gateway can dispatch a workflow, the runtime processes it, and the ledger records a `factory_items` → `factory_runs` → `factory_events` evidence chain. **This is runtime-model-agnostic**: a LaunchAgent, a gateway-managed subprocess, an external orchestrator, or any other process model qualifies as long as the evidence chain lands in the live antfarm.db. **Why this is a prerequisite**: live system inspection on 2026-05-24 confirmed all seven v3.0-landed `factory_*` tables are at zero rows; v2 `runs`/`steps`/`stories` tables had no writes since 2026-05-19T13:45:09.764Z; macOS unified logging showed no antfarm log activity in 7 days; only LaunchAgent is `ai.openclaw.antfarm-zombie-cleanup` (a cleanup job, not a runtime service); gateway PID 39084 holds no antfarm.db file handles. All eight observations documented with commands and outputs in `antfarm-runtime-evidence-2026-05-24.md` (MD5 `c15470411d4272e565fa8962cad4f2a7`, 216 lines). v3.1's multi-tenant design assumes a working execution layer that does not currently exist in any verifiable form. Phase C of v3.1 (Flobase prototype) is explicitly gated on this prerequisite — see §12 Phase C entry criterion. See §13 Q11 for the broader dormancy acknowledgment and the Linear tracking issue ADP-404.

These are not optional. v3.1 design RFC freezes only when all six are addressed. As of v0.12: prerequisites #2 and #5 are resolved with evidence; prerequisites #1, #3, #4, and #6 remain open and tracked.

## 5. Multi-Tenant Schema Changes

### 5.1 Tenant identifier

Tables fall into four classes. Only `tenant_scoped` tables carry `tenant_id`. Other classes follow different rules per §5.1.1.

```yaml
# tenants.yaml — registry only; compliance_class duplicated from
# tenant_compliance.yaml for fast lookup, validated equal at startup
tenants:
  - id: utility_valet
    display_name: Utility Valet
    compliance_class: default        # tenant PII lives in Zoho, not in factory
    pii_data_location: zoho          # documentation; if UV PII is ever ingested, reclassify to pii
    governing_law: TX
  - id: spearhead
    display_name: Spearhead
    compliance_class: default
    governing_law: TX
  - id: flobase
    display_name: Flobase
    compliance_class: finance
    governing_law: NY
  - id: credologi
    display_name: Credologi
    compliance_class: finance
    governing_law: NY
  - id: fcrp_capital
    display_name: FCRP Capital
    compliance_class: default    # under review per §13 Q7
    governing_law: NY
  - id: starship_residential
    display_name: Starship Residential
    compliance_class: default
    governing_law: TX
```

**Validation rule:** at antfarm startup, `tenants.yaml.compliance_class` for each tenant MUST equal `tenant_compliance.yaml[tenant_id].compliance_class`. Mismatch fails startup loudly. `tenant_compliance.yaml` is the sole write authority per §7.1; `tenants.yaml` carries the duplicate only for fast registry lookups.

**Schema rules:**

- `tenant_id` is **required** on every `tenant_scoped` table row (see §5.1.1). No defaults. No nulls.
- Adding a tenant requires both a `tenants.yaml` entry and an approval matrix entry in `tenant_compliance.yaml` (§7). Schema validation fails if either is missing.
- Removing a tenant is not supported. Tenants get a `status: archived` flag if discontinued, but their historical records remain.

### 5.1.1 Table classification

Not every table needs `tenant_id`. Forcing it where it doesn't belong creates fake tenancy that obscures real cross-tenant operations. Classification:

| Class | Definition | Examples | tenant_id behavior |
|-------|------------|----------|---------------------|
| `tenant_scoped` | Execution data tied to one tenant's work | `factory_runs`, `factory_agent_runs`, `factory_context_packs`, `factory_artifacts`, `factory_gates`, `factory_items`, `factory_deployment_events`, `rtbf_requests` | **Required NOT NULL** with FK to `tenants(id)` after Step 4 migration |
| `global_config` | Shared registries that intentionally span tenants | `model_registry`, `gateway_load_test_runs`, `tenants` | **No `tenant_id` column.** Cross-tenant by design. |
| `derived_mirror` | Read-optimized projection of authoritative state | `tenant_compliance` (mirror of YAML), routing caches | **No `tenant_id` column** even though rows describe tenants (the *primary key* identifies the tenant; `tenant_id` would be redundant or misleading). |
| `audit_global` | System-level audit not tied to one tenant's execution | `factory_system_events` (new v3.1 table — see §11), gateway request logs | **`tenant_id` nullable.** Required when the event is tenant-attributable; null when system-level (startup, config reload). Validator enforces presence by event type. (Note: `factory_events` is NOT audit_global — see §5.2 classification table; factory_events is tenant_scoped because its NOT NULL FK to factory_items forces tenant scoping by transitivity.) |

**Classification rule:** every table in the antfarm schema MUST be classified into exactly one of these four classes. Classification is recorded in `schema_classification.yaml` alongside the migration plan. New tables added in v3.1+ MUST declare a class in their migration.

**Why this matters:** without classification, the migration plan in §5.3 cannot be applied correctly. Forcing `tenant_id NOT NULL` on `model_registry` would be a bug (the registry is intentionally shared). Forcing it on `gateway_load_test_runs` would prevent recording a gateway test that isn't tenant-attributable. §5.2 schema inventory MUST classify each table before migration begins.

### 5.2 Schema inventory (VERIFIED 2026-05-24 against live antfarm.db)

**STATUS: VERIFIED.** Schema captured from the live antfarm.db on 2026-05-24 and preserved as the citable artifact `antfarm-schema-snapshot-2026-05-24.sql` (MD5 `5dac653ec7a187f0faa7605e10835753`, 176 lines: 167 lines of raw DDL output plus 8 lines of header metadata). Runtime-state observations (factory_* row counts, v2 max timestamps, log queries, LaunchAgent inventory, gateway file handles) captured separately as `antfarm-runtime-evidence-2026-05-24.md` (MD5 `c15470411d4272e565fa8962cad4f2a7`, 216 lines).

**Source of verification:**

- Live database: `/Users/faisalshomemacmini/.openclaw/antfarm/antfarm.db`
- File size at capture: 14,946,304 bytes
- File mtime at capture: 2026-05-24 02:00 UTC
- Capture command: `sqlite3 /Users/faisalshomemacmini/.openclaw/antfarm/antfarm.db ".schema"`
- Reconciliation merge: PR #11 `9911221f79c3321123aa83831ce74cb21f0985d2` (per v3.0 closure notes)

**Actual tables present in live antfarm.db (14 total):**

The seven v3.0-landed `factory_*` tables (the v3 execution ledger — schema present but currently at 0 rows per the runtime evidence artifact; activation tracked under §4 prereq #6 and §13 Q11):

- `factory_items` — work intake binding to execution
- `factory_runs` — workflow-level execution; FK `antfarm_run_id REFERENCES runs(id) ON DELETE SET NULL` bridges to v2
- `factory_agent_runs` — per-agent execution within a run; FK `antfarm_step_id REFERENCES steps(id) ON DELETE SET NULL` bridges to v2
- `factory_context_packs` — context pack manifests with `manifest_json` payload
- `factory_artifacts` — typed artifact records with `path_or_url` and `checksum`
- `factory_gates` — quality gate results with `evidence_url`
- `factory_events` — audit log with `event_type`, `actor`, `payload_json`

v2 tables (historical/legacy — last writes 2026-05-19T13:45:09.764Z for `runs`/`steps`):

- `runs` — v2 execution ledger (367 rows at capture)
- `steps` — v2 per-step execution data (3,227 rows at capture)
- `stories` — v2 story/work-item tracking (101 rows at capture)
- `medic_checks` — system health checks (500 rows at capture; no writes since 2026-05-19)
- `agent_stats` — per-agent metrics (67 rows at capture)
- `session_heartbeats` — gateway session liveness (14 rows at capture; no writes since 2026-05-19)
- `cron_idle_ticks` — scheduler idle tracking (34 rows at capture; 6 updates since 2026-05-19 from scheduler liveness pings)

**Tables NOT present in current live antfarm.db** (referenced in earlier RFC drafts but never landed in PR #11 — treat as future scaffolding, not current schema):

- `factory_deployment_events`, `factory_smoke_test_runs`, `factory_monitoring_observations`, `factory_rollback_plans` (production tracking — v3.2 scope per §12.1)
- `factory_dashboard_audit_events` (dashboard tier — v3.2 scope per §12.1)
- `factory_merge_queue_entries`, `factory_merge_evictions`, `factory_human_gate_events`, `factory_workplan_budgets` (merge queue and gate concepts not yet schema-resident)
- `model_registry`, `gateway_load_test_runs` (referenced by v3.0 RFC as global_config — not present in antfarm.db; may exist as YAML config or in a different store)

The v3.1 new tables defined in §11 (`factory_tenants`, `factory_tenant_compliance`, `factory_tenant_audit_log`, `factory_vault_routes`, `factory_rtbf_requests`, `factory_subject_registry`, `factory_dashboard_sessions`, `factory_system_events`) are all net-new additions in the v3.1 migration — eight tables total, none of which collide with the verified existing v3.0 schema.

**Schema classification per §5.1.1 (applied to verified tables):**

| Table | Class | Rationale |
|-------|-------|-----------|
| `factory_items` | `tenant_scoped` | Work intake per tenant; v3.1 adds `tenant_id NOT NULL` |
| `factory_runs` | `tenant_scoped` | Execution per tenant; v3.1 adds `tenant_id NOT NULL` |
| `factory_agent_runs` | `tenant_scoped` | Per-agent work per tenant; v3.1 adds `tenant_id NOT NULL` |
| `factory_context_packs` | `tenant_scoped` | Tenant context isolation per §8 vault routing |
| `factory_artifacts` | `tenant_scoped` | Tenant outputs |
| `factory_gates` | `tenant_scoped` | Tenant approval/gate decisions |
| `factory_events` | `tenant_scoped` | Events about factory work, always attached to a factory_item via NOT NULL FK. Per verified schema this row CANNOT store true system-level events. v3.1 adds `tenant_id` derived from the parent factory_item. (Earlier drafts misclassified this as `audit_global` — see §11 for `factory_system_events`, the new audit_global home for runtime/system events.) |
| `runs`, `steps`, `stories` | `tenant_scoped` (historical) | Currently dormant; if reactivated v3.1-side they get `tenant_id` per §5.3 |
| `medic_checks`, `session_heartbeats`, `cron_idle_ticks` | `audit_global` | System health; per-event-type tenant attribution |
| `agent_stats` | `global_config` | Cross-tenant agent metrics; no `tenant_id` |

Tables `factory_*` carrying FK references to `runs(id)` and `steps(id)` use `ON DELETE SET NULL` so v2 row removal (if ever performed) does not cascade-destroy v3 records. This was an intentional design choice in PR #11 and is preserved by v3.1.

**Schema rules (these apply against the verified schema):**

- `tenant_id` is **required** on every `tenant_scoped` row after §5.3 Step 4 migration tightens enforcement. No defaults. No nulls.
- Adding a tenant requires both a `tenants.yaml` entry and an approval matrix entry in `tenant_compliance.yaml` (§7). Schema validation fails if either is missing.
- Removing a tenant is not supported. Tenants get a `status: archived` flag if discontinued, but their historical records remain.
- The `audit_global` class on `factory_system_events` (new in v3.1, see §11) carries event-type-based requirement per §5.3 Step 4b; see §5.3 for the event_type enumeration. `factory_events` follows the standard `tenant_scoped` migration path.

### 5.3 SQLite migration sequencing (expand → backfill → enforce → tighten)

v0.1 said "add `tenant_id TEXT NOT NULL` with FK." SQLite does not safely support that on existing tables without a table rebuild. v0.2 uses the expand/backfill/enforce/tighten pattern that is actually safe:

**Step 1: Expand (nullable)**

For each table requiring tenant scoping, add `tenant_id TEXT` as a nullable column:

```sql
ALTER TABLE factory_runs ADD COLUMN tenant_id TEXT;
ALTER TABLE factory_agent_runs ADD COLUMN tenant_id TEXT;
-- etc.
```

No constraint yet. Existing rows are NULL. New rows can insert without `tenant_id` until Step 4. Application code starts writing `tenant_id` immediately, but the schema doesn't enforce it yet.

**Step 2: Backfill**

For every existing row with `tenant_id IS NULL`, populate with the synthetic legacy tenant:

```sql
INSERT INTO tenants (id, display_name, compliance_class, status)
  VALUES ('v3_0_legacy', 'Pre-multi-tenant work', 'default', 'archived');

UPDATE factory_runs SET tenant_id = 'v3_0_legacy' WHERE tenant_id IS NULL;
UPDATE factory_agent_runs SET tenant_id = 'v3_0_legacy' WHERE tenant_id IS NULL;
-- etc.
```

Backfill must be atomic per-table (single transaction). Failure aborts and rolls back to Step 1 state.

**Step 3: Validate**

Before tightening, prove the backfill is complete:

```sql
SELECT COUNT(*) FROM factory_runs WHERE tenant_id IS NULL;  -- must be 0
SELECT COUNT(*) FROM factory_agent_runs WHERE tenant_id IS NULL;  -- must be 0
-- per table
```

Application-level test suite runs end-to-end against the backfilled DB to confirm no code path produces NULL `tenant_id`.

**Step 4: Enforce via CHECK constraint and FK**

SQLite ALTER TABLE cannot add NOT NULL or FK directly. The supported pattern is table rebuild:

```sql
BEGIN TRANSACTION;
CREATE TABLE factory_runs_new (
  -- all columns, including:
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  -- CHECK (tenant_id IS NOT NULL) is redundant with NOT NULL but worth keeping for clarity
);
INSERT INTO factory_runs_new SELECT ... FROM factory_runs;
DROP TABLE factory_runs;
ALTER TABLE factory_runs_new RENAME TO factory_runs;
-- recreate indexes
COMMIT;
```

Per-table. Each rebuild is its own transaction. Failure aborts and leaves the old table intact.

**Step 4b: Enforce audit_global tables (separate rule set)**

`audit_global` tables (per §5.1.1 classification) have nullable `tenant_id`. Enforcement is event-type-based, not column-NOT-NULL. The rules:

1. Add `tenant_id TEXT` as nullable (Step 1 above already did this).

2. **`event_type` column requirement.** Conditional tenant enforcement requires an `event_type` column on every `audit_global` table. Two paths depending on PR #11 state:

   - **Path A — column already exists:** verify per-table via §4 prereq #2 schema inventory. Proceed to step 3.
   - **Path B — column does not exist:** run a mini expand/backfill/rebuild sequence specific to `event_type`, mirroring Step 1-4 for `tenant_id`:
     - **4b.i Expand:** `ALTER TABLE factory_system_events ADD COLUMN event_type TEXT;` (nullable). Note: this applies to the *new* `factory_system_events` table (§11), the canonical audit_global home. `factory_events` is NOT an audit_global target — see §5.2 classification table.
     - **4b.ii Backfill:** classify existing rows. Options: (a) derive from existing payload fields if a discriminator exists, (b) backfill to `'legacy_unclassified'` event type if no discriminator. Choice is per-table and recorded in the migration artifact. For `factory_system_events` (net-new in v3.1), there is no historical data and 4b.ii is a no-op.
     - **4b.iii Validate:** confirm all historical rows have non-null `event_type`. Add `'legacy_unclassified'` to `event_type_tenant_requirement.yaml` as `tenant_optional` (legacy rows may or may not have had tenant context).
     - **4b.iv Rebuild for NOT NULL:** table rebuild per Step 4 pattern, but only to add NOT NULL to `event_type`. `tenant_id` remains nullable.
   - Path B failure aborts at the failing sub-step; old table preserved.

3. Maintain an `event_type_tenant_requirement.yaml` that classifies each event type as:
   - `tenant_required` — `tenant_id` MUST be present; null fails write
   - `tenant_optional` — `tenant_id` MAY be present; either is valid
   - `system_only` — `tenant_id` MUST be null; presence fails write
   - (`legacy_unclassified` from 4b.ii defaults to `tenant_optional` to preserve historical row validity)

4. Enforcement options (pick one per table during Step 4b):
   - **Application validator** (preferred for new tables): every write goes through a validator that consults `event_type_tenant_requirement.yaml`. Reject on mismatch.
   - **SQLite trigger** (backward-compatible): `CREATE TRIGGER factory_system_events_tenant_check BEFORE INSERT ... SELECT CASE WHEN ... THEN RAISE(ABORT, 'tenant_id required for this event_type') END`.

5. Test cases (mandatory for Step 4b acceptance):
   - Inserting a `tenant_required` event with null `tenant_id` MUST fail.
   - Inserting a `system_only` event with non-null `tenant_id` MUST fail.
   - Inserting a `tenant_optional` event either way MUST succeed.
   - Event types not in `event_type_tenant_requirement.yaml` MUST fail by default (deny-by-default applies here too).
   - Historical rows backfilled to `legacy_unclassified` MUST remain readable and never trigger validation failures retroactively.

6. **`legacy_unclassified` blind-spot mitigation (mandatory):**
   - For each `audit_global` table processed by Path B, the migration MUST count rows backfilled to `legacy_unclassified` and attach the count plus row sample to migration evidence.
   - If `legacy_unclassified` count exceeds **5% of total table rows** (default; per-table override allowed in `migration_thresholds.yaml`), Step 5 transition is BLOCKED until manual classification is performed.
   - Manual classification: an operator (founder-class for `audit_global` per §7.4.1) reviews legacy rows, either:
     - Reclassifies them to a known event type (preferred where the payload contains enough information)
     - Confirms they remain `legacy_unclassified` with explicit policy acceptance recorded in `factory_tenant_audit_log` (`event_type: legacy_unclassified_accepted`)
   - Below threshold: migration may proceed but the count remains in evidence for future audit. Counts MUST be visible on the operator dashboard once §9 ships, so the blind-spot doesn't become invisible operationally.
   - `legacy_unclassified` is intentionally a one-time backfill class. New rows after Step 4b CANNOT be written with `event_type = 'legacy_unclassified'` — the validator rejects this value for fresh inserts.

**Why this is separate from Step 4:** Step 4 rebuilds `tenant_scoped` tables to add NOT NULL FK on `tenant_id`. `audit_global` tables cannot use NOT NULL on `tenant_id` because that field's requirement is conditional on event type. Step 4b lands the conditional enforcement, including any `event_type` column work needed to support it, while preserving historical rows.

**Step 5: Tighten (application-level)**

After schema enforcement, application code is updated according to each table's class per §5.1.1:

- **For `tenant_scoped` table operations:**
  - Reject any operation without an explicit `tenant_id` (caller must provide; no defaults)
  - Reject any operation where the caller's authorization scope does not include the target `tenant_id` (deny-by-default per §7)
- **For `audit_global` table operations:** enforcement follows Step 4b rules (event-type-based requirement matrix). The application validator consults `event_type_tenant_requirement.yaml`; `tenant_id` is required, optional, or forbidden per event type. Authorization scope still applies when `tenant_id` is present.
- **For `global_config` table operations:** no `tenant_id` enforcement (these tables intentionally span tenants). Authorization for writes is governed by §7.4 action types (`model_registry_update`, etc.), not by tenant scoping.
- **For `derived_mirror` table operations:** writes only permitted from the sync process (e.g., the startup sync that populates `factory_tenant_compliance` from `tenant_compliance.yaml`). Direct application writes are rejected. Reads are tenant-filtered by the primary key, not by a separate `tenant_id` column.

**Rollback path**

Each step is independently reversible:

- Step 5 → Step 4/4b: revert application code to pre-Step-5 (table-class-aware enforcement disabled). Schema unchanged.
- Step 4b → Step 4 (or pre-4b):
  - Drop any SQLite triggers added in Step 4b: `DROP TRIGGER IF EXISTS factory_system_events_tenant_check;` (per audit_global table; default is `factory_system_events` per §11).
  - Disable the application validator (revert to pre-4b behavior).
  - Mark `event_type_tenant_requirement.yaml` as inactive (preserve file for forensic reference; do not delete).
  - If Path B was taken (`event_type` column added by 4b.i-iv): reverse via table rebuild removing `event_type`, or if SQLite 3.35+ available, `ALTER TABLE factory_system_events DROP COLUMN event_type;` (or the equivalent for any other audit_global table). For `factory_system_events` specifically — a new v3.1 table per §11 — rollback of the column add is equivalent to dropping the table entirely if it has zero rows. Historical rows backfilled to `legacy_unclassified` (if Path B was needed against an existing table) retain that value until column removal.
  - **Historical audit rows remain valid throughout rollback.** No data loss; only enforcement layer is reverted.
- Step 4 → Step 3: rename `factory_runs` back to `factory_runs_old`; rebuild original table without `tenant_id`. Slow but possible.
- Step 3 → Step 2: no DDL change; just retry validation after fixing whatever caused NULLs.
- Step 2 → Step 1: `UPDATE factory_runs SET tenant_id = NULL WHERE tenant_id = 'v3_0_legacy';`
- Step 1 → pre-migration: `ALTER TABLE factory_runs DROP COLUMN tenant_id;` (SQLite 3.35+).

**Critical rule:** No step transitions until the previous step's evidence (counts, test results, application logs) is captured as a migration artifact. Same checkpoint discipline as v3.0 §5.1. Step 4b artifacts (trigger definitions, validator config, `event_type_tenant_requirement.yaml`) are versioned alongside the migration scripts so rollback has explicit DDL/code references to revert.

## 6. Tenant Compliance Class

Three classes:

| Class | Tenants | Redaction | Retention | Approval profile | Model eligibility |
|-------|---------|-----------|-----------|------------------|-------------------|
| `finance` | Credologi, Flobase | `finance_v1` | 7 years | All production-touching requires Faisal; Day2 Ops bounded `incident_response` after 5-hour timeout per §7.4.2; new finance deploys always Faisal | All models in `default_v1` registry permitted at v3.1; restriction reserved for future use (per Q5 resolution) |
| `pii` | (no current tenant — UV reclassified per Q4 resolution; class retained in schema for future use) | `pii_v1` (defined but unused at v3.1) | 3 years (or per regulation) | (no current consumer) | (no current consumer) |
| `default` | Utility Valet, Spearhead, FCRP Capital, Starship Residential | `default_v1` | 1 year | Day2 Ops can approve routine fixes; Faisal for schema/security changes | All models permitted |

`compliance_class` is immutable per tenant once assigned. Changing it requires a separate audit-logged decision and a re-classification migration.

### 6.1 Redaction rulesets

- **`default_v1`**: secrets pattern match (API keys, tokens), no PII rules beyond best-effort
- **`pii_v1`**: secrets + names, addresses, phone numbers, email addresses, lease terms, payment information, government identifiers
- **`finance_v1`**: secrets + account numbers, routing numbers, transaction IDs, credit identifiers, customer financial data

Rulesets are versioned. A new ruleset version creates new context packs going forward; existing packs remain valid per their generation-time ruleset (§22.3 v3.0 immutability rule).

### 6.2 Right-to-be-forgotten policy — full surface coverage

v0.1 only covered context pack source content. PII can exist across many more surfaces. v0.2 covers all of them.

**Data classification matrix (where PII can land, what RTBF does):**

| Surface | What lives here | RTBF action |
|---------|-----------------|-------------|
| Context pack manifests | Provenance, source_refs (hashed), redactions_applied | **Preserve.** Provenance integrity required for audit. Source refs are hashes, not content. |
| Context pack sources | Actual file content the agent saw | **Destroy file content.** Replace with `tenant_deletion_redacted: true` marker. |
| Factory artifacts (research, plan, changes, eval reports) | Agent-produced output that may include PII | **Redact content.** Manifest preserved with `rtbf_redacted: true`. Content fields nulled. |
| Factory events / audit log | Operator actions, gate decisions, approvals | **Preserve.** Audit integrity required. PII in payloads must be hashed, not literal — enforced at write time per §6.3 below. |
| Compliance audit log | Finance/PII-class elevated decisions | **Preserve.** Compliance requirement. Hashing rule per §6.3. |
| Obsidian shared vault notes | Cross-company synthesis | **Should not contain raw tenant PII** by §8 redaction discipline. If discovered, escalate to Faisal — this is a redaction-discipline failure, not normal RTBF. |
| Obsidian sensitive vault notes | Per-tenant content | **Destroy specific pages** matching the deletion subject. Preserve aggregate retrospectives that anonymized at the time of writing. |
| Dashboard audit events | Operator actions touching the tenant | **Preserve.** PII in payload must already be hashed per §6.3. |
| Prompts sent to models | Pre-context-pack input | **Not stored** by default. If logged, same redaction as artifacts. |
| Model response logs | Raw model output | **Destroy** content; preserve metadata (timestamps, model_id, token counts). |
| Telegram / Hermes notification history | Operator-facing messages | **Policy: never send raw PII in notifications.** Notifications must reference subjects by hashed/opaque IDs only. For pre-policy or non-compliant messages: best-effort deletion via Telegram API + audit record of the deletion attempt (success or failure). External chat retention is outside our control; the only reliable guarantee is the upstream "no raw PII in notifications" policy. |

**Critical rule:** RTBF is not a single delete operation. It is a workflow that touches multiple surfaces, each with its own rule. The `rtbf_requests` table tracks which surfaces have been processed; the request is not closed until all applicable surfaces are confirmed.

### 6.3 Write-time hashing for audit surfaces (per-subject envelope keys)

Audit logs cannot be destroyed, so they must not contain destroyable content. v0.2 proposed a per-tenant salt, but destroying that salt on RTBF would break audit correlation for the entire tenant — not just the deletion subject. v0.3 uses per-subject envelope keys instead.

**Key hierarchy:**

```
Tenant master key (per tenant; long-lived, never destroyed)
  └─ wraps Subject envelope keys (per deletion-subject; created on first PII reference)
        └─ used as salt for hashing that subject's PII fields
```

**Write-time rule:**

- Audit log payloads referencing tenant PII store **hashes**, not literal values.
- Each PII field is hashed using its subject's envelope key (e.g., `HMAC(envelope_key_for_subject_X, field_value)`).
- Subject identification: the audit writer determines which deletion-subject a field belongs to (typically a user ID, lease ID, or customer ID) and looks up or creates the envelope key.
- Schema impact: `factory_events.payload_json` (verified v3.0 schema, see §5.2) and `factory_tenant_audit_log.payload_json` (v3.1 new table, see §11) are subject to a write-time validator that rejects literal PII patterns. The validator runs against the same redaction ruleset as the tenant's compliance class. (Note: the v3.1 new table is named `factory_tenant_audit_log`, not `compliance_audit_log`. The `compliance_audit_log` name appeared in pre-v0.15 drafts as v3.0-era prose carryover and is not a v3.1 table — see §11 for the actual v3.1 audit table.)

**RTBF rule:**

- On RTBF for subject X: destroy `envelope_key_for_subject_X`.
- All hashes derived from that key in audit logs become irrecoverable (cannot be reverse-correlated to the subject).
- Tenant master key remains intact; other subjects' envelope keys remain intact.
- Tenant-level audit verifiability (counts, aggregates, non-subject fields) is preserved.

**Why this works better than v0.2's per-tenant salt:**

- v0.2's design: RTBF closes → tenant salt destroyed → entire tenant's audit log becomes uncorrelatable. Compliance loses a year of cross-event analysis to honor one deletion.
- v0.3's design: RTBF closes → only the deletion subject's envelope key is destroyed → tenant audit correlation remains intact for non-affected subjects.

**Open question:** does this satisfy applicable finance regulations for Credologi and Flobase audit retention? Red-team must validate. The envelope-key approach is standard practice in regulatory contexts but should be confirmed against the specific regulations applicable to NY-jurisdiction finance entities. (Q4 in §13 originally asked this for UV PII; UV's PII lives in Zoho per the resolved Q4, so the question now refocuses on finance-class regulation.)

### 6.3.1 Subject registry threat model

The envelope-key design depends on a subject registry — a mapping from subject identifiers (e.g., "tenant 4837 of Utility Valet") to envelope key IDs. This registry is itself a sensitive surface and needs its own threat model.

**Subject registry schema:**

```
factory_subject_registry (per tenant)
  subject_id_hash      TEXT PRIMARY KEY    -- keyed hash of the natural subject ID
  envelope_key_id      TEXT NOT NULL       -- opaque reference to envelope key in KMS
  created_at           TIMESTAMP
  rtbf_state           TEXT NOT NULL       -- see §6.3.1.1; defaults to 'active'
  rtbf_requested_at    TIMESTAMP NULLABLE
  rtbf_reversible_at   TIMESTAMP NULLABLE  -- when envelope key was destroyed in KMS
  rtbf_finalized_at    TIMESTAMP NULLABLE  -- when backups were destroyed
  legal_hold           BOOLEAN NOT NULL DEFAULT FALSE
  deletion_proof_id    TEXT NULLABLE       -- reference to deletion-proof audit record
```

**Rules:**

1. **Subject identifier storage.** The natural subject ID (tenant ID, customer ID, lease ID, etc.) is **never stored in plaintext** in the registry. Only a keyed hash, computed using a per-tenant "lookup pepper" stored in KMS. This means the registry alone is not enough to enumerate subjects — an attacker needs the lookup pepper too. See §6.3.1.2 for what happens to the pepper at RTBF finalization.

2. **Envelope key storage.** Envelope keys live in a key management system (KMS) — not in the antfarm SQLite database directly. The registry stores only opaque key IDs. The KMS choice is itself a §4 prerequisite (likely AWS KMS per the placement rule of 24x7 services on AWS) and must be decided before Phase A closes.

3. **Envelope key backup.** Envelope keys are backed up before destruction *only* during the `rtbf_reversible` window (see §6.3.1.1). The backup is encrypted with a separate "recovery key" held in offline storage. This is **not** a permanent backup — it exists for a bounded reversibility window only. Backups are destroyed at `rtbf_finalized` time.

   Recovery key access requires Faisal + one additional founder-class approver (currently undefined — flagged as bus-factor in §13 Q6).

4. **Deletion proof.** When an envelope key is destroyed:
   - The destruction operation produces a signed "deletion proof" record (timestamp, KMS confirmation, operator identity)
   - The proof is stored in `factory_tenant_audit_log` with `event_type: rtbf_state_transition`
   - The proof itself contains **only the subject_id_hash**, not the natural subject ID
   - A second `rtbf_finalized` event is emitted when backups are destroyed

### 6.3.1.1 RTBF state machine

RTBF is not a single operation — it is a state machine with three states plus a `legal_hold` flag. v0.6 conflated "envelope key destroyed" with "RTBF complete," which contradicted the requirement that backups exist for reversibility. v0.7 makes the states explicit:

```
                                       ┌──── legal_hold = TRUE ────┐
                                       │  blocks finalization      │
                                       ▼                            │
[active] ──rtbf_request──> [rtbf_requested] ──destroy_kms_key──> [rtbf_reversible] ──destroy_backups──> [rtbf_finalized]
                                                                       │                                       │
                                                                       └─── recovery_key_restore ───────────> [active]
                                                                            (only within reversible window;    (with audit event)
                                                                             becomes impossible after          
                                                                             rtbf_finalized)
```

**State definitions:**

| State | Meaning | Reversible? | Audit visibility |
|-------|---------|-------------|------------------|
| `active` | Normal operation; envelope key live in KMS | N/A | subject correlatable via envelope key |
| `rtbf_requested` | Deletion has been logged; envelope key still live; cleanup not yet started | Yes — by canceling the request | subject still correlatable |
| `rtbf_reversible` | Envelope key destroyed in KMS, but encrypted backup exists | Yes — by recovery-key restore (Faisal + 2nd founder-class approver) | subject hashes in audit logs become uncorrelatable to envelope key, but recovery is possible |
| `rtbf_finalized` | Envelope key + all backups destroyed | **No — forward-secrecy property holds** | subject hashes are permanently opaque |

**Legal hold:**

- `legal_hold` is a flag set on a subject when applicable law/litigation requires retention.
- While `legal_hold = TRUE`, the subject's record cannot transition past `rtbf_reversible`. The transition to `rtbf_finalized` is blocked.
- Lifting legal hold requires founder-class approval and is itself audit-logged.
- The RTBF request remains valid; finalization is paused, not canceled.

**Forward-secrecy claim:**

The forward-secrecy property holds **only at `rtbf_finalized`**, not at `rtbf_reversible`. Earlier wording that implied forward-secrecy from envelope-key destruction alone was wrong — backups exist precisely because that destruction is recoverable.

**Default reversibility window:**

- `rtbf_requested` → `rtbf_reversible`: immediate (within the same operation; an envelope-key destruction either succeeds or fails).
- `rtbf_reversible` → `rtbf_finalized`: 30 days default, configurable per compliance class. PII class may have shorter windows; finance class may have longer (7-year audit retention may interact).
- The window length per tenant is part of `tenant_compliance.yaml` (a new field `rtbf_reversible_window_days`).

### 6.3.1.2 subject_id_hash persistence at RTBF finalization

A `subject_id_hash` + a live per-tenant lookup pepper means anyone with the natural subject ID and the pepper can still confirm a deleted subject's presence after RTBF. That is metadata-level confirmation of "yes, this subject existed and was deleted." Depending on jurisdiction and compliance class, that may or may not be acceptable.

v0.7 defines two options. Default per tenant compliance class:

**Option A — accept as audit metadata (default for finance class):**

- `subject_id_hash` persists in `factory_subject_registry` and audit logs after `rtbf_finalized`.
- Per-tenant lookup pepper is not rotated.
- An attacker (or auditor) with both the natural subject ID *and* the lookup pepper can confirm the subject's deletion event existed.
- This is explicitly framed as "deletion is recorded, subject identity is not recoverable from the registry alone." Finance regulations (7-year audit trail) often require this level of evidence.

**Option B — tombstone rotation with pepper destruction (default for pii class):**

- At `rtbf_finalized`, the per-tenant lookup pepper is rotated. The old pepper is destroyed.
- Any retained `subject_id_hash` values become uncorrelatable to natural subject IDs because no party (including operators) can reproduce the hash.
- Audit log entries referencing the finalized subject are reduced to opaque hashes with no recovery path.
- This is the "true forgetting" path — the subject's existence is recorded only as an anonymous deletion event.
- Trade-off: rotating the pepper invalidates lookup for *all* subjects in that tenant, not just the deleted one. New peppers go forward; old peppers are recoverable only from offline backups (subject to the same backup destruction at finalization). This is acceptable because the lookup pepper is rarely needed for active operations — it's a privacy-preserving index, not a primary key.

**Configuration:**

```yaml
# tenant_compliance.yaml (per tenant)
flobase:
  compliance_class: finance
  rtbf_subject_persistence: option_a    # finance class default
  rtbf_reversible_window_days: 90       # longer for finance audit overlap
credologi:
  compliance_class: finance
  rtbf_subject_persistence: option_a    # finance class default
  rtbf_reversible_window_days: 90

# Example for future PII tenant (no current consumer per Q4 resolution —
# UV PII is in Zoho, not in the factory). If a PII tenant is ever onboarded:
future_pii_tenant:                       # placeholder; replace with real tenant id
  compliance_class: pii
  rtbf_subject_persistence: option_b    # pii class default — strict forgetting
  rtbf_reversible_window_days: 14       # shorter window
```

**Red-team must validate** Option A is appropriate for the two current `finance`-class tenants (Flobase, Credologi) against applicable finance regulations. Option B for the placeholder PII tenant is reserved for future use; if UV PII is later ingested into the factory, Option B becomes the relevant default and red-team must validate against applicable PII regulations at that time (currently §13 Q4 is resolved by UV's PII living in Zoho, not in factory).

**Threat scenarios after these revisions:**

- **Registry leak (state `active` or `rtbf_requested`)**: attacker obtains `factory_subject_registry`. Cannot enumerate subjects without the lookup pepper. Cannot derive envelope keys.
- **Audit log leak (state `rtbf_reversible`)**: hashes are uncorrelatable to envelope keys (which are destroyed), but recovery key + backups could restore. Defense: recovery key access controls (offline storage + 2-approver requirement).
- **Audit log leak (state `rtbf_finalized`, Option A)**: hashes are permanently uncorrelatable to envelope keys. Subject identity confirmation still possible to anyone with natural subject ID + live lookup pepper.
- **Audit log leak (state `rtbf_finalized`, Option B)**: hashes are permanently uncorrelatable to envelope keys *and* to natural subject IDs (pepper rotated). Full forward-secrecy property holds.
- **Operator error**: wrong subject's RTBF triggered. Recoverable via recovery key until `rtbf_finalized`. After finalization, irrecoverable — this is the intended trade-off.
- **Legal hold scenario**: `legal_hold = TRUE` blocks finalization. RTBF stays at `rtbf_reversible` indefinitely. Subject remains deletable on legal hold lift.

**What this does NOT address:**

- Active surveillance during the audit window — if an attacker captures hashes plus the envelope key while both exist (state `active`), RTBF cannot retroactively redact what was captured. Defense is access control on envelope keys (KMS-enforced), not RTBF itself.
- PII that bypassed the redaction pipeline at write time — if raw PII landed in an audit log because the validator missed it, RTBF can mark it for destruction but cannot guarantee no copy exists in offline backups, external logs, etc. Defense is the write-time validator (§6.3), not RTBF.

## 7. Approval Matrix

### 7.1 Location and ownership

**`tenant_compliance.yaml` is the sole write authority for runtime approval policy.** It lives in the Antfarm config repository. Per the §3.1 boundary, runtime state lives in Antfarm.

Changes go through normal source control review (PR to antfarm-config repo) and become effective at antfarm restart. No hot-reload — policy changes are intentional, audited, and tied to deployments.

**Other surfaces that reference compliance information are read-only mirrors:**

- `tenants.yaml` duplicates `compliance_class` per tenant **for fast registry lookup only**. Startup validation enforces equality with `tenant_compliance.yaml`; mismatch fails startup loudly.
- `tenant_compliance` table is a `derived_mirror` per §5.1.1 — populated from `tenant_compliance.yaml` at startup, read by runtime queries. Direct writes to the table are forbidden (enforced by a write trigger that allows updates only from the migration/sync process).
- Obsidian `factory-shared/governance/` may mirror or explain the policy for human reading. Never owns or modifies it.

**Drift prevention:** at every antfarm startup, the sync process:

1. Reads `tenant_compliance.yaml` as source of truth.
2. Validates `tenants.yaml` carries matching `compliance_class` per tenant. Mismatch fails startup.
3. Refreshes `tenant_compliance` table from YAML.
4. Logs the sync to `factory_system_events` with a `config_sync` event type. (Not `factory_events` — config_sync has no factory_item parent; routing to `factory_events` would fail the NOT NULL FK constraint. See §5.2 / §11 for the factory_events vs factory_system_events split.)

If any of (1)-(3) fail, antfarm refuses to start. No partial-sync state.

**Closes §13 Q1 by decree.** Not an open question.

### 7.2 Schema

```yaml
# tenant_compliance.yaml (one entry per tenant)
flobase:
  compliance_class: finance
  approvers:
    production_touching:
      - faisal             # founder authority — required
    schema_changes:
      - faisal             # required
    security_changes:
      - faisal             # required
      - simon              # secondary — can approve with faisal_notified flag
    routine_fixes:
      - day2_ops           # primary once provisioned
      - faisal             # fallback
    audit_log_access:
      - faisal
      - day2_ops           # read-only
  approval_timeout_hours: 4         # falls back to next approver in list
  fallback_chain: [faisal]          # if all primary approvers unavailable
```

Same shape per tenant. Six entries in the file at v3.1 startup.

### 7.3 Day2 Ops slot

The `day2_ops` slot is in the schema at v3.1 startup. Day2 Ops goes live in 1-2 weeks (per Phase A/B timing — see §12 reorder). The slot resolves as follows:

- **Pre-Day2-Ops-live:** every `day2_ops` entry effectively resolves to the fallback (Faisal). Approval requests still route through Hermes but land in Faisal's inbox.
- **Post-Day2-Ops-live:** the slot resolves to the registered Day2 Ops identity per §10. Approval requests route to Day2 Ops; Faisal is the fallback.

No schema change at handoff time. Configuration change only.

### 7.4 Policy evaluation algorithm (deny-by-default)

Every operator action against the factory invokes policy evaluation:

```
function authorize(action_type, tenant_id, actor):
  1. Lookup tenant_compliance[tenant_id]. If missing, DENY.
  2. Lookup approvers[action_type]. If action_type not in matrix, DENY.
     (Unknown actions are never default-allowed.)
  3. Resolve approvers list (day2_ops → real identity if active, else fallback).
  4. If actor in resolved approvers list, ALLOW; create audit event.
  5. Otherwise, queue approval request to the first listed approver.
     Wait approval_timeout_hours. If no response, route to next per §7.4.1.
     If fallback_chain exhausted with no approval, DENY and escalate.
  6. Every DENY produces an audit event with reason.
```

**Action types must be enumerated.** Unknown action types deny — there is no default-allow path. v0.9 lists the initial enumeration:

- `production_touching` — any work unit with `production_touching: true`
- `schema_changes` — any work unit modifying database schema
- `security_changes` — any work unit modifying auth, secrets, access control
- `tenant_data_access` — any context pack reading PII-class tenant data
- `rtbf_requests` — right-to-be-forgotten processing
- `routine_fixes` — work units below all elevation thresholds (the default for most work)
- `audit_log_access` — reading the compliance audit log
- `model_registry_update` — adding/modifying entries in `model_registry.yaml`
- `promotion_review` — reviewing a sensitive-vault page for promotion to shared (referenced by §8.5)
- `incident_response` — bounded operator authority post-Faisal-timeout per §7.4.2 (limited to pre-authorized action list; not a general-purpose action)
- `tenant_lifecycle` — archive a tenant, reclassify a tenant's compliance class, or register a new tenant (founder-only; cannot be granted to operator class)

New action types require an RFC revision and a `tenant_compliance.yaml` update before they can be used.

### 7.4.1 Timeout fallback authority binding

Approvers list ordering matters. Fallback after timeout MUST NOT silently substitute a lower-authority approver for a higher-authority required approval. The rule:

- Each action type carries a `minimum_authority_class` per tenant compliance class:

| Action × Tenant Class | Minimum authority required |
|-----------------------|----------------------------|
| `production_touching` × finance | `founder` (Faisal) |
| `production_touching` × pii | `founder` |
| `production_touching` × default | `operator` (Day2 Ops or Faisal) |
| `schema_changes` × * | `founder` |
| `security_changes` × * | `founder` |
| `tenant_data_access` × pii | `founder` |
| `rtbf_requests` × finance | `founder` |
| `rtbf_requests` × pii | `founder` (no current consumer; retained for future use per §6 / Q4 resolution) |
| `routine_fixes` × * | `operator` |
| `audit_log_access` × * | `operator` (read-only) |
| `model_registry_update` × * | `founder` |
| `promotion_review` × finance | `founder` |
| `promotion_review` × pii | `founder` |
| `promotion_review` × default | `operator` |
| `incident_response` × * | `operator` (Day2 Ops post-timeout only, bounded to §7.4.2 pre-authorized list) |
| `tenant_lifecycle` × * | `founder` (cannot timeout-fallback) |

- The approvers list is evaluated in order. If the next approver's authority class is below `minimum_authority_class`, **fallback skips them** and routes to the next equal-or-higher authority. If no equal-or-higher remains, DENY and escalate as urgent.
- Faisal is `founder` class. Day2 Ops is `operator` class. Simon is `operator` class. Future named approvers must declare their authority class in `tenant_compliance.yaml`.

**Why this matters:** without this binding, a 4-hour timeout on a finance-class production touch could silently route to Day2 Ops if Day2 Ops happened to be next in the list. Authority class binding prevents that silent downgrade.

### 7.4.2 Bounded incident-response after founder timeout (resolves Q6)

The bus-factor problem is real: Faisal is the only `founder`-class approver. If Faisal is unavailable, finance-class production-touching, schema_changes, and security_changes all block indefinitely per §7.4.1. For a 24x7 system (currently only the real-time datalake; other systems can tolerate downtime), unbounded blocking is unacceptable.

**The Q6 resolution: bounded pre-authorization, not approver substitution.**

Day2 Ops does NOT become a `founder`-class approver after timeout. Day2 Ops gains a new, narrow authority class — `incident_response` — that is pre-authorized by Faisal in this RFC for exactly the actions listed below. Any action not on the list still DENIES.

**Timeout activation rule:**

- An approval request to a `founder`-class action remains pending for the standard `approval_timeout_hours` (default 4 hours per tenant).
- After Faisal's individual timeout passes (configured at 5 hours per Q6 resolution), and only if the requested action is on the pre-authorized list, Day2 Ops may approve under `incident_response` authority.
- The audit log entry MUST record: original action type, requested approver (Faisal), timeout reason, Day2 Ops actor, pre-authorization reference (action list entry that permitted this).
- New `founder`-class actions not on the pre-authorized list continue to DENY regardless of timeout duration.

**Pre-authorized actions Day2 Ops can take after 5-hour Faisal timeout:**

```yaml
# tenant_compliance.yaml
incident_response_preauthorized:
  # All actions below are operator-class executable after 5-hour Faisal timeout.
  # New deploys, schema changes, and security changes are NOT on this list —
  # they remain founder-class-only regardless of timeout.

  - id: rollback_failed_deploy
    description: Roll back any deploy that fails smoke tests
    scope: any_tenant_any_compliance_class
    requires_evidence: smoke_test_failure_record

  - id: restart_hung_worker
    description: Restart a hung worker process
    scope: any_tenant
    requires_evidence: worker_health_check_failure

  - id: pause_workflow_run
    description: Pause an active workflow run pending operator review
    scope: any_tenant
    requires_evidence: operator_judgment        # discretion-allowed; reasoning recorded

  - id: disable_failing_work_unit
    description: Disable a specific work unit producing repeated errors
    scope: any_tenant
    requires_evidence: error_threshold_record    # e.g., 3+ consecutive failures

  - id: restore_antfarm_snapshot
    description: Restore from a known-good snapshot of antfarm SQLite
    scope: any_tenant
    requires_evidence: corruption_evidence       # or operator_judgment with explicit acceptance
```

**What is explicitly NOT pre-authorized (founder-only regardless of timeout):**

- Any new deploy (including emergency hotfixes) for finance-class tenants
- Any schema migration or schema change
- Any security-related change (auth, secrets, access control)
- Any tenant-lifecycle change (archive, compliance class reclassification, new tenant registration)
- Any modification to `model_registry.yaml`
- Any modification to `tenant_compliance.yaml` itself (including this pre-authorization list)
- Right-to-be-forgotten processing for finance-class subjects (founder must approve regardless)

**Auditability requirements:**

- Every `incident_response` action emits a `factory_tenant_audit_log` event with `event_type: incident_response_taken` and the pre-authorization reference
- Faisal receives a high-priority notification of every `incident_response` action within minutes of execution
- Faisal can retroactively reverse an `incident_response` action; the reversal is itself audit-logged

**Authority class register:**

- Faisal: `founder` class (full scope)
- Day2 Ops: `operator` class (routine ops) + `incident_response` class (bounded post-timeout, per pre-authorized list above)
- Simon: `operator` class
- Future named approvers must declare authority class in `tenant_compliance.yaml`

**Adding actions to the pre-authorized list:**

Adding a new action to the pre-authorized list is itself a `founder`-class decision (a modification to `tenant_compliance.yaml`). It cannot be added via the timeout mechanism. The current 5-item list is the bootstrap; expansion requires explicit Faisal approval through normal RFC/PR review.

### 7.5 Bus-factor: open status

§7.4.2 resolves Q6 for time-critical recovery actions, but the broader bus-factor problem remains operationally unresolved:

- A medical emergency or multi-day unavailability still blocks all founder-only actions outside the pre-authorized incident-response list
- New finance deploys, schema changes, and security work stall indefinitely

This is acceptable per Faisal's Q6 resolution ("Only real-time datalake is a 24x7 system. It can handle some downtime."). Worth flagging that as the portfolio grows beyond the real-time datalake, the bus-factor exposure grows with it. A second founder-class human approver remains the right long-term solution; v3.1 explicitly does not solve this.

## 8. Two-Vault Obsidian Split (separate vault roots, not folders)

**Critical correction from v0.1:** `obsidian/shared/` and `obsidian/sensitive/` as folders under a single Obsidian vault would leak through:

- Obsidian's global search (cross-vault search exists; cross-folder is the default)
- Plugins with vault-wide access
- Sync mechanisms operating at vault level
- Workspace state persisting across folders

The correction: **two physically separate Obsidian vault roots, each with its own sync configuration, plugin set, and access controls.**

### 8.1 Vault structure

```
~/Documents/Obsidian/                  # parent directory (not a vault)
├── factory-shared/                    # Obsidian Vault #1 (independent)
│   ├── .obsidian/                     # vault-specific config
│   ├── agents.md
│   ├── standing-rules.md
│   ├── rfcs/
│   ├── retrospectives/                # only intentionally cross-company
│   ├── generic-patterns/
│   └── governance/                    # mirror of tenant_compliance.yaml for human reading
└── factory-sensitive/                 # Obsidian Vault #2 (independent)
    ├── .obsidian/                     # separate config
    ├── credologi/
    ├── flobase/
    └── utility-valet/
```

These are **two independent vaults**, not folders within one vault. Obsidian opens them as separate windows. Each has its own `.obsidian/` config directory.

### 8.2 Sync mechanism (separate per vault)

Each vault has its own sync configuration:

- `factory-shared` syncs to one target (e.g., Git remote `factory-shared-vault`)
- `factory-sensitive` syncs to a different target with stricter access (e.g., Git remote `factory-sensitive-vault` with restricted permissions)

Choice of sync mechanism is §4 prereq #5 (still open). Whatever is chosen must support two independent configurations.

### 8.3 Vault routing rule

When the context pack generator (v3.0 §22) builds a pack for a work unit, the vault router determines eligible vaults:

```python
def eligible_vaults(work_unit):
    tenant_id = work_unit.tenant_id
    vaults = [SHARED_VAULT_PATH]
    if tenant_id in SENSITIVE_TENANTS:
        vaults.append(f"{SENSITIVE_VAULT_PATH}/{tenant_id}")
    return vaults
```

Where `SHARED_VAULT_PATH` and `SENSITIVE_VAULT_PATH` are configured at antfarm startup. `SENSITIVE_TENANTS` is derived from `tenant_compliance.yaml` (any tenant whose compliance class is `finance` or `pii`).

A Spearhead work unit reads from `factory-shared` only. A Flobase work unit reads from `factory-shared` + `factory-sensitive/flobase`. A Credologi work unit reads from `factory-shared` + `factory-sensitive/credologi`.

**Hard rule:** a work unit's vault eligibility is computed at pack generation time and stored in `factory_context_packs.eligible_vaults`. Changing tenant assignment of a work unit invalidates its packs (which is the right outcome — the new tenant needs its own context).

**No fallback:** if the sensitive vault is unavailable (sync failure, mount missing), pack generation for sensitive-class tenants fails loudly. No silent degradation to "shared only."

### 8.4 Cross-vault link discipline

Pages in `factory-shared` reference pages in `factory-sensitive/<tenant>/` only as text descriptions, not working Obsidian links. Working links across vaults are not portable and create plugin confusion. Cross-vault navigation requires opening the second vault explicitly (manual operator action).

### 8.5 Promotion from sensitive to shared

When an agent working on a sensitive tenant produces synthesis worth promoting to `factory-shared`, the promotion is an explicit workflow step:

1. Author flags the page with `promotion_candidate: true` frontmatter.
2. Redaction pass runs against the page using the tenant's compliance ruleset.
3. Redaction output is reviewed by Faisal (or Day2 Ops per the §7 matrix once Phase A/B activates the slot for `promotion_review`).
4. Approved page lands in `factory-shared` with `provenance_source: <tenant>/<path>` and the original is preserved in `factory-sensitive`.

Promotion is one-directional. Pages in `factory-shared` are never moved into `factory-sensitive` — if they need tenant-scoping, they are *copied* with explicit tenant tagging.

### 8.6 Plugin policy

Obsidian plugins can read vault contents, often with network access. The plugin policy:

- `factory-shared` allows community plugins per a maintained allowlist
- `factory-sensitive` allows **only** plugins explicitly approved per compliance class — default is no plugins beyond Obsidian core

This is enforced operationally (Faisal maintains the allowlist), not technically (Obsidian has no plugin allowlist enforcement). Worth flagging that the structural separation is necessary precisely because the technical enforcement is weak.

## 9. Dashboard with Tenant Filter (enforced at API layer, not UI routing)

v3.0 §20 designed the operator dashboard with required views and operator actions. v3.1 makes tenant filter a **structural** feature enforced at the API/query/auth layer. UI routing is a convenience; it is not the security boundary.

### 9.1 Tenant isolation at the API layer

The dashboard is a thin client over Antfarm's read API and Hermes's command surface. Tenant isolation is enforced server-side:

**Auth token scoping:**

- Every dashboard session token carries an explicit list of authorized tenants
- Faisal's token scopes to all tenants
- Day2 Ops tokens scope per compliance class authority (see §7)
- Token includes scope claims signed at issuance time; cannot be modified client-side

**Read API:**

- Every Antfarm read query MUST include a `tenant_id` filter (or explicit `tenants: [...]` list).
- Queries without tenant scope are rejected at the API layer.
- Queries with tenant scope outside the caller's authorization scope return **HTTP 404** (not empty results or 403) for consistency with URL routing, AND emit an audit event flagging the attempted cross-tenant access. 404 prevents information leakage about which tenants exist; the audit event ensures detection.

**Command API (Hermes orchestrator commands):**

- Every command includes `target_tenant_id`.
- Hermes validates `target_tenant_id` against the caller's auth scope before forwarding to Antfarm.
- Mismatch produces **HTTP 403 DENY** (mutations are more sensitive than reads — caller is explicitly told they cannot perform this action) AND emits an audit event. 403 vs. 404 distinction: reads pretend the resource doesn't exist (privacy); mutations explicitly refuse (clarity).

**Response code summary:**

| Surface | Out-of-scope behavior | Audit event |
|---------|----------------------|-------------|
| Read endpoint with unauthorized tenant in path | 404 | Required |
| Read endpoint with unauthorized tenant in query parameter | 404 | Required |
| Mutation endpoint with unauthorized target_tenant_id | 403 | Required |
| Endpoint without tenant scope at all (where required) | 400 | Required |

**Test requirements:**

- Tenant isolation test suite must include adversarial cases:
  - Day2 Ops token attempting to read Faisal-only tenant data — must return 404 + emit audit event (test asserts both)
  - Day2 Ops token attempting to mutate a tenant outside scope — must return 403 + emit audit event (test asserts both)
  - Crafted requests with mismatched URL tenant vs. body tenant — must return 403 + emit audit event
  - URL manipulation (e.g., `/t/credologi/runs/<run-id>` where run actually belongs to flobase) — must return 404 + emit audit event

**The audit event assertion is mandatory.** A test that confirms only the HTTP response code without verifying the audit log entry does not pass the test contract. Without these tests passing, dashboard does not ship to even Phase B.

### 9.2 Required tenant filter behavior (UI layer)

The UI layer reflects what the API allows, not what the user might want:

- **Top-level navigation:** tenant selector populated from the caller's auth scope. Cannot show tenants the caller isn't authorized for.
- **Default view:** "all authorized tenants" landing page showing aggregated queue counts per tenant the caller can see.
- **Tenant-scoped views:** clicking a tenant filters every subsequent view to that tenant via API parameter, not just UI state.
- **Cross-tenant view:** explicit "show all" toggle uses the auth scope's full tenant set. Day2 Ops sees only their authorized tenants; Faisal sees everything.
- **URL routing:** every view URL includes `/t/<tenant_id>/...`. URL is convenience; the API still validates the token's scope. A URL containing an unauthorized `tenant_id` returns 404.
- **Operator action scoping:** approve/retry/pause actions can only target work in the currently-selected tenant; the dashboard's API call includes `target_tenant_id` matching the URL.

### 9.3 Auth model

Single-operator (Faisal) at Phase B initial. Multi-operator (Faisal + Day2 Ops) is targeted for Phase A/B (per revised timing — Day2 Ops must be integrated from the start, not deferred to Phase D).

Authentication via Hermes operator session (already exists per v3.0 §3.1). Hermes issues the dashboard session token with scope claims derived from `tenant_compliance.yaml`.

Dashboard authorization checks (server-side):

- Faisal: all tenants, all actions
- Day2 Ops: tenants per compliance class authority (see §7)
- Future read-only roles: deferred to v3.2

### 9.4 Schema-stable gate (carried from v3.0 §20.4)

Dashboard implementation work starts only after:

1. v3.1 entity names frozen (no rename PRs)
2. Multi-tenant migrations pass against actual antfarm SQLite
3. Validators pass on all current workflow runs under tenant scoping
4. Fixture workflows populate the ledger end-to-end per tenant
5. No open schema-drift findings
6. Dashboard queries do not require private/transient executor state
7. **Tenant isolation test suite passes per §9.1**

These are the v3.0 six criteria plus the new isolation test requirement.

## 10. Day2 Ops Integration

Day2 Ops goes live in 1–2 weeks. v3.1 integrates with Day2 Ops as an approver tier and as a recipient of routine operations routing.

### 10.1 What Day2 Ops needs from v3.1

- A way to be a registered approver for tenants per the §7 matrix
- A way to receive approval requests (channel TBD per §4 prerequisite)
- A way to grant/deny approvals (and have those decisions audit-logged)
- Read access to dashboards for tenants in scope

### 10.2 What v3.1 needs from Day2 Ops

- A stable identity in `tenant_compliance.yaml` (e.g., a single `day2_ops` user, or per-tenant Day2 Ops instances)
- An approval acknowledgment contract (acknowledged within X hours, fallback to Faisal if not)
- A clear domain scope (what Day2 Ops can approve vs. what gets escalated to Faisal)

### 10.3 Day2 Ops activation gate (independent of phase order)

The `day2_ops` slot activates when ALL of the following are true:

1. Day2 Ops platform is live and reachable
2. Integration implementation per §10.1/§10.2 is deployed (not just designed)
3. At least one tenant has its `day2_ops` approver slot populated with a real Day2 Ops identity
4. Audit log records at least one successful Day2 Ops approval against a test workflow
5. Tenant isolation tests per §9.1 pass for the Day2 Ops auth token
6. Day2 Ops audit retention rule per §10.4 is configured and operational

Until all six are true, the slot resolves to Faisal (fallback) for every tenant. Once all six are true, the slot resolves to the registered Day2 Ops identity for tenants where it is populated.

**Phasing posture (v0.9 resolution):** This is NOT a Phase B exit criterion. Phase B can ship without Day2 Ops live. The activation gate may be met in:
- Phase B (if Day2 Ops platform launches during the 6-week Phase B window — opportunistic activation)
- Phase C (if Day2 Ops launches during the 4-week Flobase prototype window)
- Phase E (the latest acceptable point — non-finance tenants beyond the initial three may benefit from Day2 Ops authority, so the activation gate is the latest meaningful point)

If Day2 Ops platform is not live by Phase E, the v3.1 onboarding work continues with Faisal as sole approver for all tenants. Day2 Ops onboarding becomes a separate later activity, not a v3.1 blocker.

**Why this changed from v0.8:** v0.8 said "Phase A/B not Phase D" — fixing v0.1's wrong deferral. v0.8 overshot in the other direction by making Day2 Ops a Phase B *exit* requirement, which contradicted Q10 ("Day2 Ops can be delayed"). v0.9 corrects to "interface design hard-gated in Phase A; implementation activation can land anywhere from Phase B onward; not a phase exit blocker."

### 10.4 Day2 Ops audit retention (normative)

**Normative rule (Q9 resolution):** Routine Day2 Ops actions recorded in `factory_tenant_audit_log` are retained for **90 days** from the action timestamp, regardless of the tenant's compliance class.

**Retention classes:**

| Retention class | Applies to | v3.1 retention |
|-----------------|------------|----------------|
| `routine_operator` | Day2 Ops `routine_fixes`, `audit_log_access` reads, `promotion_review`, other operator-class actions NOT in an enumerated retention-preserving chain | 90 days |
| `incident_response_evidence` | `incident_response_taken`, `incident_response_reversed` events and any rows in an `incident_workflow` event chain | **Indefinite at v3.1** (Faisal may reverse retroactively; no time bound) |
| `rtbf_evidence` | `rtbf_requests` lifecycle rows and any rows in an `rtbf_workflow` event chain | Indefinite at v3.1 (RTBF state machine per §6.3.1.1 governs separately) |
| `compliance_audit_evidence` | Rows in `compliance_audit_chain` event chains (finance-class operations) | Indefinite at v3.1; v3.2+ extends to 7-year explicit retention |
| `founder_action` | Any row where `actor_role = 'faisal'` regardless of event type | Indefinite at v3.1 |
| `system_meta` | `retention_sweep_summary`, `retention_sweep_deletion`, and other sweep-meta events. **Under v0.14: these rows live in `factory_system_events`, NOT in `factory_tenant_audit_log`.** | Indefinite (the sweep operates only on `factory_tenant_audit_log`, never reads or writes to `factory_system_events`, so there is no path by which it could delete its own evidence) |

**Incident-response retention semantics (correcting v0.10 ambiguity):**

Incident-response events are themselves evidence, not children of evidence. A top-level `incident_response_taken` row with `parent_action_id IS NULL` is correctly retained because its retention class is `incident_response_evidence`, not because it "inherits a parent." When an `incident_response_*` event DOES reference a parent action (e.g., a rollback that references the failed deploy that triggered it), retention is the **longer of**:

- The parent action's retention (whatever class it falls into)
- The `incident_response_evidence` retention (indefinite at v3.1)

So an incident-response event always survives at least its own retention class. The parent reference can only extend retention, never shorten it.

**Implementation:**

- A daily retention sweep runs against `factory_tenant_audit_log` and identifies rows matching ALL of the following:
  - `actor_class = 'operator'`
  - `actor_role = 'day2_ops'`
  - `timestamp < now() - 90 days`
  - **`event_type NOT IN ('incident_response_taken', 'incident_response_reversed')`** (excluded event types — mandatory, configured via `day2_ops_audit_excluded_event_types`)
  - **`event_chain_type IS NULL OR event_chain_type NOT IN ('incident_workflow', 'rtbf_workflow', 'compliance_audit_chain')`** (rows in an enumerated retention-preserving chain are excluded from the sweep regardless of their own event_type)
  - **NO heuristic on `parent_action_id` alone.** A non-null `parent_action_id` is NOT sufficient to extend retention. The previous v0.10 rule "rows with non-null `parent_action_id` inherit parent retention" was an exploitable bypass — any routine action could escape the sweep by attaching itself to an arbitrary incident parent. v0.11 closes this by requiring the row to be a typed member of an enumerated retention-preserving chain, not merely related to one.

- Matching rows are deleted (not archived) in v3.1. A delete-event is logged to **`factory_system_events`** (not `factory_tenant_audit_log`) with `event_type: retention_sweep_deletion`, capturing aggregate counts per tenant but not individual deleted-row content. Routing to `factory_system_events` is correct because the deletion event is system-meta, not a tenant-attributable audit row — it describes what the sweep did, not what a tenant did.

- The sweep emits a daily summary to **`factory_system_events`** (not `factory_tenant_audit_log`) with `event_type: retention_sweep_summary`, including count of rows considered, count excluded by event_type filter, count excluded by event_chain_type filter, count deleted, and per-tenant breakdown. The summary lands in `factory_system_events` for the same reason: it is meta about sweep behavior, not a per-tenant audit row. **Because both events land in `factory_system_events` (not `factory_tenant_audit_log`), the sweep cannot accidentally delete its own evidence — there is no self-reference protection needed in the sweep filter.** This is a structural improvement over v0.13's "exclude these event_types from your own sweep" approach.

**Schema requirement for chain-typed retention:**

The `factory_tenant_audit_log` table requires an `event_chain_type TEXT NULLABLE` column. Values constrained to:

- `incident_workflow` — rows causally part of an incident response (deploy failure → rollback decision → rollback execution → post-rollback verification). Membership requires writer to explicitly set the chain_type at insert time.
- `rtbf_workflow` — rows part of an RTBF state transition (per §6.3.1.1).
- `compliance_audit_chain` — rows part of a finance-class operation requiring extended retention (v3.2+ scope; tagged in v3.1 but retention enforcement deferred).
- `NULL` — default; row is a standalone action under its own retention class.

Adding new chain types requires a `security_changes` action per §7.4 (founder-class only).

**Mandatory test cases (Phase B exit requirement):**

1. A `routine_fixes` Day2 Ops action older than 90 days with `event_chain_type IS NULL` MUST be swept.
2. An `incident_response_taken` Day2 Ops action older than 90 days MUST survive the sweep (excluded event_type).
3. An `incident_response_reversed` Day2 Ops action older than 90 days MUST survive the sweep (excluded event_type).
4. A `routine_fixes` Day2 Ops action older than 90 days with `event_chain_type = 'incident_workflow'` MUST survive (chain membership).
5. A `routine_fixes` Day2 Ops action older than 90 days with non-null `parent_action_id` but `event_chain_type IS NULL` **MUST be swept** (parent reference alone does not preserve retention — this test explicitly validates the v0.10 → v0.11 bypass fix).
6. A `routine_fixes` Day2 Ops action older than 90 days with `event_chain_type = 'rtbf_workflow'` MUST survive.
7. Faisal-issued audit rows of any event_type older than 90 days MUST survive (sweep filter excludes them via `actor_role`).
8. **The sweep MUST treat `factory_system_events` as append-only sweep-evidence storage.** Specifically: (a) the sweep MAY append `retention_sweep_summary` and `retention_sweep_deletion` rows to `factory_system_events`; (b) the sweep MUST NOT read from `factory_system_events`; (c) the sweep MUST NOT include `factory_system_events` in any filter, selection, or row-set considered for deletion; (d) the sweep MUST NOT delete from `factory_system_events`; (e) the sweep's retention-window check MUST NOT apply to `factory_system_events`. Verifies the v0.13 → v0.14 routing fix — sweep evidence lands in a table the sweep cannot touch (other than append), so by construction the sweep cannot delete its own evidence. (Replaces v0.13's "retention_sweep_summary row in factory_tenant_audit_log MUST survive" test, which is moot under v0.14 because sweep summaries never appear in that table. v0.15 corrects v0.14's overly-absolute wording, which forbade the writes the implementation deliberately performs.)

Without ALL eight tests passing, the sweep does not ship to production. Test 5 is the load-bearing test for the v0.11 bypass fix; test 8 is the load-bearing test for the v0.14 routing fix.

**Scope:**

- Applies to: Day2 Ops `routine_fixes`, `audit_log_access` reads, `promotion_review`, and other operator-class actions that meet ALL sweep criteria (correct event_type, no protective event_chain_type, beyond retention window).
- Does NOT apply to: Faisal's actions, Day2 Ops incident-response events, RTBF workflow rows, compliance-audit-chain rows. **System-meta rows (`retention_sweep_summary`, `retention_sweep_deletion`, etc.) are not in this table at all** under v0.14 — they live in `factory_system_events` and are governed by that table's retention class.

**v3.1 simplification flag:**

Finance audit retention typically requires 7 years for SOX/equivalent regulator compliance. The current 90-day routine-action retention is a deliberate v3.1 simplification per Q9 resolution. Operational implications:

- For `finance`-class tenants (Credologi, Flobase), Day2 Ops cannot currently take actions that would generate audit records required for 7-year retention. The §7.4.2 pre-authorized incident-response list is structured to keep Day2 Ops actions to recovery operations rather than financial state changes (which would be `compliance_audit_chain` rows), partially mitigating this exposure.
- The `compliance_audit_chain` event chain type is defined in v3.1 but retention enforcement is deferred to v3.2+. Until then, rows tagged with this chain type are retained indefinitely (no sweep) but lack the formal 7-year-with-deletion-at-bound contract that finance audit ultimately requires.
- Any expansion of Day2 Ops authority on finance-class tenants should be paired with extending the formal retention rule. Tracked as v3.2+ work.
- A regulator audit of Credologi or Flobase before the retention rule is formalized would expose this gap. Worth a calendar reminder ahead of the first finance-class regulatory event.

**Configuration:**

```yaml
# tenant_compliance.yaml (global section, not per-tenant)
day2_ops_audit_retention_days: 90        # v3.1 simplification per Q9; expand for v3.2

day2_ops_audit_excluded_event_types:     # NEVER sweep these from factory_tenant_audit_log regardless of age
  - incident_response_taken
  - incident_response_reversed
  # Note: retention_sweep_summary and retention_sweep_deletion are NOT listed here in v0.14.
  # They land in factory_system_events under Option C (v0.13+), so they cannot appear in
  # factory_tenant_audit_log and therefore cannot be swept by definition.

retention_preserving_event_chains:       # rows in these chains survive sweep regardless of event_type
  - incident_workflow
  - rtbf_workflow
  - compliance_audit_chain
```

Changing `day2_ops_audit_retention_days`, removing event types from `day2_ops_audit_excluded_event_types`, or removing chain types from `retention_preserving_event_chains` requires a `security_changes` action per §7.4 (founder-class only). None of these can be modified via the timeout-fallback mechanism in §7.4.2. The exclusion and chain lists grow over time as new event types and chain types are introduced; they never shrink without explicit founder approval.


## 11. New Database Concepts

v3.1 adds the following tables. §5.2 verified the existing v3.0-landed `factory_*` tables (seven tables; classification per §5.2 table). The tables below are **net-new** in v3.1 (no name collision with the seven verified v3.0 tables).

```
factory_tenants              (tenant registry; immutable except status)
                             — class: global_config
factory_tenant_compliance    (derived mirror of tenant_compliance.yaml; populated at startup)
                             — class: derived_mirror
factory_tenant_audit_log     (compliance-class-elevated audit; separate from general factory_events)
                             — class: audit_global; tenant_id required for tenant-scoped events
factory_vault_routes         (which vaults each tenant's work units can read)
                             — class: derived_mirror
factory_rtbf_requests        (right-to-be-forgotten tracking — per §6.2 matrix)
                             — class: tenant_scoped
factory_subject_registry     (per-tenant subject identifier registry — per §6.3.1)
                             — class: tenant_scoped
factory_dashboard_sessions   (operator dashboard auth + audit; scoped tokens)
                             — class: audit_global; tenant_id captured per session scope
factory_system_events        (NEW in v0.13 — runtime/system event log for events with no factory_item parent: startup, config_reload, config_sync, retention_sweep_summary, retention_sweep_deletion, migration_checkpoint, etc. Distinct from factory_events which is tenant_scoped via NOT NULL FK to factory_items.)
                             — class: audit_global; tenant_id nullable per event_type per §5.3 Step 4b
```

That's **8 net-new tables in Phase B** (v0.13 added `factory_system_events` to fix the factory_events classification mismatch per §5.2). The Phase D minimal production gate recording phase may add 1-2 more for `factory_deployment_events` shape verification.

**Schema for factory_system_events (proposed):**

```sql
CREATE TABLE factory_system_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,           -- e.g., 'runtime_started', 'config_reload', 'config_sync', 'retention_sweep_summary', 'retention_sweep_deletion'
  tenant_id TEXT,                     -- NULLABLE; null means system-level, non-null means tenant-attributable
  actor TEXT,                         -- 'system', 'faisal', 'day2_ops', etc.
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX idx_factory_system_events_type_time ON factory_system_events(event_type, created_at);
```

Distinguishing factory_events vs factory_system_events:

| Aspect | `factory_events` (v3.0-landed) | `factory_system_events` (v0.13 new) |
|--------|--------------------------------|--------------------------------------|
| Purpose | Events about factory work | Events about the runtime itself |
| `factory_item_id` | NOT NULL (every row tied to work item) | (no such column) |
| `tenant_id` (v3.1) | Required, derived from factory_item parent | Nullable, event_type-driven per §5.3 Step 4b |
| Classification | `tenant_scoped` | `audit_global` |
| Example events | work_unit_started, gate_decided, artifact_landed | runtime_started, config_reload, config_sync, retention_sweep_summary, retention_sweep_deletion, migration_checkpoint |

**Known cross-references (added v0.14):** the following write targets across the RFC route to `factory_system_events`, not `factory_events`:

- §6 / §7 config sync at antfarm startup (`config_sync` event type)
- §10.4 retention sweep summaries (`retention_sweep_summary`)
- §10.4 retention sweep deletions (`retention_sweep_deletion`)

If a new section is added or edited and the event has no factory_item parent, it routes here. The deny-by-default validator in §5.3 Step 4b enforces this — any attempt to insert a parentless event into `factory_events` fails on the NOT NULL FK constraint.

Combined with the verified v3.0 schema getting `tenant_id` added per §5.1.1 classification, the v3.1 migration touches the verified tables (7 v3.0-landed `factory_*` + 7 v2 historical) plus the 8 net-new tables above. Total migration touch surface: ~22 tables.

## 12. Phases

**Critical correction from v0.1:** Day2 Ops goes live in 1-2 weeks, so it cannot be Phase D (which was 10-12 weeks out). Day2 Ops integration is now part of Phase A and Phase B. The phase structure is rebuilt accordingly.

### Phase A — Pre-implementation prerequisites (2 weeks, parallel to Day2 Ops go-live)

Close all hard prerequisites from §4:

- v3.0 closure-notes action items
- **Actual PR #11 schema inventory verified** — §5.2 stub replaced with real table names and DDL
- `tenant_compliance.yaml` schema agreed and red-teamed (location: Antfarm config repo)
- **Day2 Ops integration interface design defined** — §10 specifies the contract shape (API, channel, identity, retention). Implementation is NOT a Phase A/B blocker. Day2 Ops platform may go live before, during, or after Phase B; v3.1 ships either way with `day2_ops` slot resolving to Faisal until §10.3 activation gate is met.
- Obsidian vault sync mechanism chosen, with two physically separate vault roots set up

**Exit gate:** all five prerequisites closed with evidence. Day2 Ops interface design documented in §10 (identity model, channel, retention rule). Day2 Ops platform implementation status does not block Phase A exit.

### Phase B — Multi-tenant schema migration + dashboard MVP (6 weeks)

- Implementation migration packet drafted: SQL DDL, migration scripts per §5.3, test fixtures, rollback procedures. **Not** a separate design RFC — v3.1 is the design RFC; the implementation packet is the execution artifact.
- Migration executed using §5.3 expand/backfill/enforce/tighten pattern
- 8 net-new v3.1 tables created (`factory_tenants`, `factory_tenant_compliance`, `factory_tenant_audit_log`, `factory_vault_routes`, `factory_rtbf_requests`, `factory_subject_registry`, `factory_dashboard_sessions`, `factory_system_events` — see §11; the eighth was added in v0.13 to fix the factory_events classification mismatch per §5.2)
- `tenants.yaml` registered with six entries
- `tenant_compliance.yaml` registered in Antfarm config repo for all six tenants
- Two-vault Obsidian split set up with Syncthing sync, separate vault roots
- Dashboard MVP with tenant filter delivered — **with §9.1 API-level isolation tests passing**
- Antfarm validators pass on all tenant-scoped data
- `day2_ops` slot in `tenant_compliance.yaml` resolves to Faisal (fallback). Day2 Ops platform integration is NOT a Phase B exit requirement.

**Exit gate:** prototype tenant (Flobase) ledger populates correctly under tenant scoping; dashboard renders six tenant slots with API-level isolation proven; Faisal can approve via the new matrix; `day2_ops` slot resolves cleanly to Faisal where required.

### Phase C — Flobase as prototype tenant (4 weeks)

**Entry gate (HARD — cannot begin Phase C without this):**
- §4 prereq #6 satisfied: antfarm execution runtime activation verified. Concretely: an end-to-end test workflow has produced a recorded `factory_items` → `factory_runs` → `factory_events` evidence chain in the live antfarm.db, demonstrating the runtime is operational. The activation evidence may be tenant-less or use a sandbox tenant — what matters is that the execution layer writes to the ledger. v3.1 Phase C does not begin until this evidence is in hand. If runtime activation is not complete by the targeted Phase C start date, Phase C is paused and the runtime activation Linear issue (see §13 Q11) is the blocking item.

**Phase C work (gated on entry):**
- One real Flobase workflow runs end-to-end under tenant scoping
- §22 context pack generator pulls from `factory-shared` + `factory-sensitive/flobase` correctly
- `finance_v1` redaction ruleset validated against real Flobase content
- Faisal approves at least one real production-touching workplan via the new approval matrix
- Dashboard surfaces Flobase work accurately to Faisal
- If Day2 Ops platform is live during Phase C: Day2 Ops approves at least one routine fix for Flobase via the new approval matrix. If not live: deferred to Phase E activation gate per §10.3.

**Exit gate (HARD — both conditions required):**
1. Flobase factory work is honest, ledger-backed, tenant-scoped, and approver-gated through Faisal. Day2 Ops integration is opportunistic in this phase — present if available, deferred if not.
2. **Runtime activation evidence is now tenant-aware:** the same `factory_items` → `factory_runs` → `factory_events` evidence chain that satisfied the entry gate must now demonstrate a Flobase-tenant-scoped run, i.e., the same evidence chain with `tenant_id = 'flobase'` populated on every row. This proves the multi-tenant migration not only landed in schema but is actually being honored by writes.

### Phase D — Minimal Production Gate Recording

The v3.0 closure notes framed deploy/smoke/monitor as v3.1 continuation. v0.1 reclassified this as v3.2 without explanation. v0.2/v0.3/v0.4 clarify with a clean split: v3.1 records production events manually/stubbed; v3.2 implements the real integrations.

**v3.1 minimal production gate recording (this phase, 1-2 weeks):**
- `factory_deployment_events`, `factory_smoke_test_runs` schemas verified against PR #11 (names provisional pending §4 prereq #2)
- One real Flobase deploy logged to `factory_deployment_events` (manual entry initially)
- Smoke test runner stub that can record a result (real runner integration is v3.2)

**v3.2 full production gate integration (separate track, not v3.1 scope):**
- Real ECS Fargate deploy adapter
- Real smoke test runner
- Real monitoring backend integration
- Rollback executor

This phase is a small slice (1-2 weeks), not a v3.2-scope item. The Phase D name was misleading in v0.3 ("v3.2 production gate slice") — renamed to remove confusion about which version owns which work.

### Phase E — Remaining tenants (incremental, no fixed end)

Onboarded in this order, gated by each tenant's software cadence:

1. Credologi (similar shape to Flobase; finance class)
2. Utility Valet (default class per Q4 resolution; UV tenant PII stays in Zoho. If UV PII is ever ingested into factory, reclassify to `pii` and revisit at that point.)
3. Spearhead (default class)
4. FCRP Capital (default class — verify with Faisal whether compliance class should be elevated, see §13 Q7)
5. Starship Residential (default class)

**Critical rule (carried from planning conversation):** Don't onboard a tenant until its `tenant_compliance.yaml` entry is complete and at least one work item has flowed end-to-end. Onboarding without that produces ghost tenants.

### 12.1 v3.1 / v3.2 boundary

| Capability | v3.1 | v3.2 |
|------------|------|------|
| Multi-tenant ledger | Yes (Phase B) | — |
| Tenant compliance classes | Yes (Phase B) | — |
| Dashboard with tenant filter | Yes (Phase B) | — |
| Day2 Ops as approver | Yes (Phase A/B) | — |
| Two-vault Obsidian | Yes (Phase A/B) | — |
| RTBF policy + write-time hashing | Yes (Phase B) | — |
| Production gate schemas | Yes (Phase D minimal slice) | Real integrations |
| Real ECS Fargate deploy adapter | No | Yes |
| Real smoke test runner | No | Yes |
| Real monitoring backend | No | Yes |
| Rollback executor | No | Yes |
| Reusable skills marketplace | No | No (still out of scope per §3) |
| Slack/Teams intake | No | No (still out of scope per §3) |
| Cross-tenant federated search | No | Possibly, if evidence demands |

## 13. Open Questions

1. ~~Where does `tenant_compliance.yaml` live?~~ **Resolved (§7.1): Antfarm config repo.**
2. **Open (deferred to Day2 Ops onboarding):** Day2 Ops approver authority scope. v0.11 enumerates 11 action types in §7.4 (`production_touching`, `schema_changes`, `security_changes`, `tenant_data_access`, `rtbf_requests`, `routine_fixes`, `audit_log_access`, `model_registry_update`, `promotion_review`, `incident_response`, `tenant_lifecycle`). Final scope confirmed when actual Day2 Ops operator is identified during Phase B onboarding.
3. ~~Vault sync mechanism~~ **Resolved (§4 prereq #5, §8.2): Syncthing per vault, with `factory-sensitive` device allowlist treated as a `security_changes` action.**
4. ~~Right-to-be-forgotten for Utility Valet~~ **Resolved (§6, Q4): UV reclassified `pii` → `default`. UV tenant PII lives in Zoho, never enters the factory. RTBF mechanics apply only to `finance` class at v3.1. If UV PII is ever ingested, reclassify and revisit.**
5. ~~Tenant model eligibility~~ **Resolved (§6, Q5): all models permitted at v3.1; no finance deny list. `compliance_eligible_tenants` field retained in registry for future use.**
6. ~~Bus-factor mitigation~~ **Resolved (§7.4.2, Q6): bounded `incident_response` authority for Day2 Ops after 5-hour Faisal timeout, limited to 5 pre-authorized recovery actions. New deploys, schema changes, security changes, and tenant lifecycle remain founder-only regardless of timeout. Broader bus-factor (multi-day unavailability) remains operationally unresolved per §7.5.**
7. ~~FCRP Capital compliance class~~ **Resolved (§6, Q7): stays `default`. Holding company with simple operations.**
8. ~~Cross-tenant federated search~~ **Resolved (§9.2, Q8): cross-tenant ledger search enabled for founder authority via dashboard "show all" toggle. Scope: factory metadata only (workflow_runs, work_units, deployment events, gate decisions). Excludes context pack content, Obsidian sensitive vault content, finance-class artifacts.**
9. ~~Day2 Ops audit retention~~ **Resolved (Q9, §10.4): 90 days for routine Day2 Ops actions (`routine_fixes`, `audit_log_access`, `promotion_review`) regardless of tenant compliance class. `incident_response` events under §7.4.2 are explicitly excluded from the sweep — they inherit parent-action retention so Faisal can reverse them retroactively. Deliberate v3.1 simplification. Worth flagging: finance audit retention typically requires 7 years for SOX/equivalent compliance; the current 90-day setting for routine actions will need expansion before finance regulator audit becomes a real exposure. Tracked as v3.2+ work.**
10. ~~Day2 Ops timing risk~~ **Resolved (Q10): v3.1 Phase B built before Day2 Ops platform goes live. Day2 Ops onboarding can be delayed if needed; v3.1 ships with Day2 Ops as a planned-but-pending participant. `day2_ops` slot in `tenant_compliance.yaml` resolves to Faisal until provisioned.**
11. **Open (operational, not design):** Antfarm execution runtime is dormant as of 2026-05-24. Live DB inspection confirmed all `factory_*` tables at 0 rows; v2 tables (`runs`, `steps`, `stories`, `medic_checks`, `session_heartbeats`) have had no writes since 2026-05-19T13:45:09.764Z; macOS unified logging shows no antfarm log activity in the prior 7 days; only LaunchAgent is `ai.openclaw.antfarm-zombie-cleanup` (a cleanup job, not a runtime service). This is consistent with the v3.0 closure narrative — v3.0 closed as "schema landed and CI-tested," not as "production runtime exercised end-to-end." v3.1 multi-tenant design proceeds on the assumption that runtime activation is a parallel operational track. Activation is gated by §4 prereq #6 and is a Phase C entry blocker per §12. **Tracking issue: a Linear issue titled "Activate Antfarm execution runtime" will be created in the v3.1 project with acceptance criteria: (a) runtime start mechanism documented, (b) dispatch path verified from gateway, (c) one test workflow writes the factory ledger chain, (d) logs/monitoring path verified.** v3.1 RFC freezes independently; activation work proceeds on its own cadence and may complete before, during, or after Phase B.

## 14. Decision Checklist (pending Faisal approval before red-team)

### Architecture & boundaries
- [ ] §3.1 multi-tenant boundary (Antfarm execution / Hermes control / Obsidian synthesis)
- [ ] §4 prerequisites as hard gates (6 items: closure-notes resolution, **schema inventory VERIFIED 2026-05-24**, `tenant_compliance.yaml` schema agreed, Day2 Ops integration interface design, Syncthing vault sync (resolved), **antfarm execution runtime activation gate (new in v0.12)**)
- [x] **§4 prereq #6 (new in v0.12):** antfarm execution runtime activation gate (runtime-model-agnostic; satisfied when evidence chain `factory_items` → `factory_runs` → `factory_events` lands in live antfarm.db). Tracked operationally via separate Linear issue; Phase C entry-gated.

### Schema & migration
- [x] **§5.2 schema inventory VERIFIED 2026-05-24** against live antfarm.db. Artifact: `antfarm-schema-snapshot-2026-05-24.sql` (MD5 `5dac653ec7a187f0faa7605e10835753`, 176 lines: 167 of raw DDL + 8 of header metadata). Runtime-state artifact: `antfarm-runtime-evidence-2026-05-24.md` (MD5 `c15470411d4272e565fa8962cad4f2a7`, 216 lines). 14 tables confirmed in live DB; seven v3.0-landed `factory_*` tables present at 0 rows; seven v2 tables present with historical data (no writes since 2026-05-19). Classification applied per §5.1.1, including factory_events reclassification fix (v0.13).
- [ ] **§13 Q11 (new in v0.12):** antfarm execution runtime dormancy acknowledged. Tracked via separate "Activate Antfarm execution runtime" Linear issue with four acceptance criteria. v3.1 RFC freezes independently; activation is operational work on its own cadence.
- [ ] §5.1.1 four-class table classification (`tenant_scoped` / `global_config` / `derived_mirror` / `audit_global`)
- [ ] §5.3 expand/backfill/enforce/tighten migration pattern for `tenant_scoped` tables
- [ ] §5.3 Step 4b event-type-based enforcement for `audit_global` tables (with Path A/B for `event_type` column safety)
- [ ] §5.3 Step 4b `legacy_unclassified` quantification and 5% threshold (manual classification above threshold)
- [ ] §5.3 rollback path covering Steps 1-5 including 4b artifacts (triggers, validator, YAML)

### Compliance classes & tenants
- [ ] §6 three compliance classes with their redaction/retention/approval profiles
- [x] **Resolved Q4:** Utility Valet reclassified `pii` → `default` with `pii_data_location: zoho` (UV tenant PII lives in Zoho, never enters factory; reclassify to `pii` only if antfarm ingests UV PII)
- [x] **Resolved Q7:** FCRP Capital stays `compliance_class: default` (holding company, simple operations)
- [x] **Resolved Q5:** Model eligibility — all models permitted at v3.1; `compliance_eligible_tenants` field retained for future use
- [ ] **Note:** `pii` compliance class has zero current tenants. Class + `pii_v1` redaction ruleset + §6.3.1.2 Option B tombstone rotation remain in schema for future use but have no current consumer. RTBF mechanics apply only to `finance` class at v3.1.

### Right-to-be-forgotten (applies to `finance` class only at v3.1)
- [ ] §6.2 RTBF data-classification matrix covering all surfaces
- [ ] §6.3 write-time PII hashing for audit surfaces
- [ ] §6.3.1 subject registry threat model (keyed-hash subject IDs in `factory_subject_registry`)
- [ ] §6.3.1 KMS choice for envelope key storage (AWS KMS per the placement rule, or alternative)
- [ ] §6.3.1 envelope key backup policy (recovery-key in offline storage, bounded reversibility window only)
- [ ] §6.3.1 deletion-proof recording (signed proofs in `factory_tenant_audit_log` with `event_type: rtbf_state_transition`)
- [ ] §6.3.1 recovery-key authority (currently undefined; bus-factor gap — see §7.5)
- [ ] §6.3.1.1 RTBF state machine (`active` / `rtbf_requested` / `rtbf_reversible` / `rtbf_finalized` plus `legal_hold`)
- [ ] §6.3.1.1 default reversibility windows per compliance class (default 30 days; finance may extend)
- [ ] §6.3.1.2 subject_id_hash persistence — Option A (audit metadata) default for finance class

### Approval matrix & authority
- [ ] §7.1 `tenant_compliance.yaml` lives in Antfarm config repo (sole write authority)
- [ ] §7.4 deny-by-default policy evaluation algorithm with 11 enumerated action types (`production_touching`, `schema_changes`, `security_changes`, `tenant_data_access`, `rtbf_requests`, `routine_fixes`, `audit_log_access`, `model_registry_update`, `promotion_review`, `incident_response`, `tenant_lifecycle`)
- [ ] §7.4.1 authority class binding (`founder` / `operator`) preventing silent timeout fallback to lower authority
- [x] **Resolved Q6:** §7.4.2 bounded `incident_response` authority after 5-hour Faisal timeout — limited to 5 pre-authorized recovery actions; new deploys, schema changes, security changes, and tenant lifecycle remain founder-only regardless
- [ ] §7.4.2 pre-authorized incident-response action list (5 actions: rollback_failed_deploy, restart_hung_worker, pause_workflow_run, disable_failing_work_unit, restore_antfarm_snapshot)
- [ ] §7.4.2 retroactive reversal mechanism (Faisal can reverse Day2 Ops `incident_response` actions; reversal is audit-logged)
- [ ] §7.5 broader bus-factor remains operationally unresolved (multi-day Faisal unavailability blocks founder-only work outside pre-authorized list)

### Obsidian vaults
- [ ] §8 two physically separate Obsidian vault roots (`factory-shared`, `factory-sensitive`)
- [x] **Resolved Q3:** Vault sync via Syncthing per vault; sensitive vault device allowlist is a `security_changes` action
- [ ] §8.5 promotion workflow from sensitive to shared (one-directional with redaction + approval)
- [ ] §8.6 plugin policy (sensitive vault default-deny on community plugins)

### Dashboard
- [ ] §9.1 API-level tenant isolation with adversarial tests (404 reads, 403 mutations, audit event assertions mandatory)
- [ ] §9.2 tenant filter as day-one UI feature
- [x] **Resolved Q8:** Cross-tenant ledger search via §9.2 "show all" toggle for founder authority. Scope: factory metadata only. Excludes context pack content, Obsidian sensitive vault content, finance-class artifacts.

### Day2 Ops integration
- [ ] §10 Day2 Ops integration **interface design** (hard gate, Phase A); implementation activation per §10.3 (flexible, Phase B-E)
- [x] **Resolved Q9:** Day2 Ops audit retention — 90 days for routine actions; `incident_response` events excluded from sweep per §10.4 (inherit parent retention). **v3.1 simplification flag:** finance audit retention typically requires 7 years; routine-actions retention will need expansion before regulator audit exposure becomes real. Tracked as v3.2+ work.
- [x] **Resolved Q10:** v3.1 Phase B built before Day2 Ops platform live; Day2 Ops onboarding can be delayed if needed.

### Schema additions
- [ ] §11 8 net-new v3.1 tables (table names finalized in v0.13; `factory_system_events` added to fix v0.12 audit_global classification mismatch)

### Phasing
- [ ] §12 phase reorder — Day2 Ops in Phase A/B, not Phase D
- [ ] §12.1 explicit v3.1 / v3.2 boundary table (v3.1 = manual/stub event recording; v3.2 = real deploy/smoke/monitor integrations)

### Remaining open question
- [ ] **§13 Q2 (deferred to Day2 Ops onboarding):** Final Day2 Ops action type enumeration confirmed with the actual Day2 Ops operator during Phase B. v0.14 ships with 11 action types; operator may flag additions during onboarding.

Once these are signed off, the red-team round can begin **with the discipline originally intended for v3.0** — independent reviewer artifacts validated against the schema, not collapsed into a single approval. v3.0's red-team collapsed to agent-artifacts + Faisal approval per the closure notes; v3.1 explicitly requires independent reviewer submissions to actually exercise the design's defenses.

---

**Document version:** v0.15 (FREEZE CANDIDATE)
**Generated:** 2026-05-24 / 2026-05-25
**Schema artifact:** `antfarm-schema-snapshot-2026-05-24.sql` (MD5 `5dac653ec7a187f0faa7605e10835753`, 176 lines)
**Runtime evidence artifact:** `antfarm-runtime-evidence-2026-05-24.md` (MD5 `c15470411d4272e565fa8962cad4f2a7`, 216 lines)
**Linear tracking:** ADP-404 "Activate Antfarm execution runtime" (parallel operational track per §13 Q11)
**Next step:** Decision point — either (a) send v0.15 to genuine v3.1 red-team (Simon/Atlas/Ross/Leo, independent reviewer artifacts per the discipline originally intended for v3.0), or (b) explicitly accept the v3.0 single-approver shortcut as a deliberate choice and proceed to implementation. Runtime activation work (ADP-404) proceeds on its own cadence and is gated by §4 prereq #6 / §12 Phase C entry criterion regardless of the red-team decision.
