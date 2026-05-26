# ADP-422 No-Raw-PII Notification Policy

Owner: Leo for operator messaging behavior. Simon owns enforcement hooks and tests.

## Policy

Telegram, Hermes, and other external operator notifications must never include raw tenant PII or raw sensitive subject identifiers.

Notifications may include:

- Tenant ID.
- Linear issue ID.
- Work item ID.
- Opaque subject handle or hash.
- Dashboard, Antfarm, vault, or audit-link reference.

Notifications must not include:

- Names of tenant subjects.
- Postal addresses.
- Phone numbers.
- Email addresses.
- Account numbers.
- Routing numbers.
- Lease IDs where they identify a person or tenant subject.
- Customer financial identifiers.
- Freeform pasted finance/PII snippets.

## Operator Message Pattern

Use this shape:

```text
Tenant: flobase
Work item: <factory_item_id>
Subject: subj_<opaque_hash>
Action: approval_needed
Open details: <dashboard_or_vault_reference>
```

The detailed content stays inside Antfarm, dashboard, or the appropriate vault surface.

## Validator Handoff

Simon should add a notification payload validator before send. Minimum checks:

- Email-like pattern.
- US phone-like pattern.
- SSN-like pattern.
- Bank routing/account-like numeric patterns.
- Common raw-address markers.
- Lease/customer financial identifier labels.
- Tenant ruleset-specific deny patterns from `tenant_compliance.yaml`.

Tests must fail if raw PII patterns appear in outbound notification payloads.

## Legacy Deletion/Audit Path

For pre-policy or non-compliant messages:

1. Attempt best-effort deletion using the platform API when available.
2. Emit an audit event regardless of outcome.
3. Never claim deletion guarantees for external chat retention.

Audit event minimum fields:

- `event_type`: `notification_delete_attempt`
- `platform`
- `message_id_hash`
- `tenant_id`
- `subject_handle_hash`
- `requested_by`
- `result`: `success`, `not_found`, `permission_denied`, `platform_unsupported`, or `error`
- `error_code`
- `created_at`

The audit event itself must not contain raw PII.
