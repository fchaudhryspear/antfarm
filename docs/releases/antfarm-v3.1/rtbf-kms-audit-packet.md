# RTBF, KMS Envelope Keys, and Audit Hashing Packet

## Context

This packet satisfies Atlas-owned architecture for ADP-413 against RFC-antfarm-v3.1.md sections 6.2, 6.3, and 6.3.1. Simon still owns application integration and tests.

## Decisions

- Use AWS KMS for tenant master keys and per-subject envelope keys.
- Store only opaque KMS key IDs and keyed subject hashes in SQLite.
- Do not store natural subject identifiers in `factory_subject_registry`, audit payloads, deletion proofs, Linear comments, or notifications.
- Use Option A for current finance tenants (`flobase`, `credologi`): subject hash persists as audit metadata.
- Keep Option B reserved for future PII tenants: rotate/destroy lookup pepper at finalization for stricter forgetting.
- Keep Utility Valet in `default` class; UV PII remains in Zoho unless a future onboarding changes that.

## Key Hierarchy

```text
tenant_lookup_pepper/<tenant>      KMS secret material for subject_id_hash lookup
tenant_master_key/<tenant>         Long-lived KMS CMK or key alias
subject_envelope_key/<tenant>/<subject_id_hash>
  wraps audit hashing salt for one deletion subject
```

`factory_subject_registry.envelope_key_id` stores the opaque KMS reference. The actual envelope key and lookup pepper never land in SQLite.

## Write-Time Hashing

Audit writers must:

1. Resolve `tenant_id` and compliance class from `tenant_compliance.yaml`.
2. Compute `subject_id_hash = HMAC(tenant_lookup_pepper, natural_subject_id)`.
3. Create or look up the subject envelope key.
4. HMAC each PII-bearing field with the subject envelope key.
5. Write only hashed fields to `factory_events.payload_json` or `factory_tenant_audit_log.payload_json`.
6. Reject literal PII patterns using the tenant redaction ruleset before commit.

## RTBF State Machine

`active -> rtbf_requested -> rtbf_reversible -> rtbf_finalized`

- `rtbf_requested`: request logged; key remains live.
- `rtbf_reversible`: envelope key destroyed in KMS, encrypted recovery backup exists.
- `rtbf_finalized`: backup destroyed; recovery impossible.
- `legal_hold = true`: blocks finalization.

## Deletion Proof

Deletion proofs are signed records in `factory_tenant_audit_log`:

- `event_type: rtbf_state_transition`
- `event_chain_type: rtbf_workflow`
- `tenant_id`
- `subject_id_hash`
- KMS deletion confirmation metadata
- operator identity and timestamp
- no natural subject identifier

## Recovery Authority Gap

Recovery during `rtbf_reversible` requires Faisal plus one additional founder-class approver. The second approver is not yet named. This is an explicit bus-factor gap and blocks production RTBF activation until owner decision.

## Required Tests

- Finance tenant RTBF moves from requested to reversible to finalized and emits signed deletion proof.
- Future PII tenant placeholder uses Option B and rejects fallback to Option A without founder approval.
- Wrong-subject deletion is recoverable only during the reversible window.
- Post-finalization hashes are opaque after envelope-key destruction.
- Validators reject email, phone, account/routing, and configured tenant PII patterns in audit payloads.
- Registry leak without lookup pepper cannot enumerate natural subjects.
