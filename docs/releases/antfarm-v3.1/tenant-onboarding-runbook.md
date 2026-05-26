# ADP-419 Phase E Tenant Onboarding Runbook

Owner: Leo for operator workflow. Ross supports review/gate discipline.

Phase E is incremental. Do not mark Phase E complete as a batch; each tenant closes independently after its own gates pass.

## Global Entry Rule

No tenant work starts until:

- `tenant_compliance.yaml` entry is complete.
- Vault route is known and validated.
- Model eligibility is known.
- Dashboard visibility/isolation expectations are known.
- Day2 Ops activation status is recorded. If Day2 Ops is not active, fallback-to-Faisal behavior is documented.
- At least one end-to-end work item is selected for that tenant.

## Tenant Order

1. Credologi
2. Utility Valet
3. Spearhead
4. FCRP Capital
5. Starship Residential

Flobase remains the prototype tenant before Phase E.

## Per-Tenant Gate Template

For each tenant, record:

- Tenant ID and display name.
- Compliance class and rationale.
- `tenant_compliance.yaml` entry reviewed and accepted.
- Vault route validated.
- Model eligibility verified.
- Dashboard authorized scope tested.
- At least one representative end-to-end work item completed.
- Approval path tested or fallback-to-Faisal documented.
- Evidence packet path and hash recorded.

## Tenant-Specific Gates

### Credologi

- Compliance class: `finance`.
- Vault route: `factory-shared` + `factory-sensitive/credologi`.
- Requires finance redaction ruleset and finance approval behavior.
- Cannot proceed if sensitive vault is unavailable.

### Utility Valet

- Compliance class: `default`.
- Condition: PII remains in Zoho and is not ingested into Antfarm.
- Vault route: `factory-shared` only.
- If PII is ingested later, reclassify before work proceeds.

### Spearhead

- Compliance class: `default`.
- Vault route: `factory-shared` only.
- Verify one non-finance operational work item end-to-end.

### FCRP Capital

- Compliance class: `default` unless Faisal explicitly elevates it to `finance`.
- The class decision must be recorded before onboarding starts.
- If elevated, use finance gates and sensitive vault routing.

### Starship Residential

- Compliance class: `default`.
- Vault route: `factory-shared` only unless future PII ingestion changes the classification.

## Evidence Requirement

Each tenant evidence packet must include concrete artifacts: command output, SQL row IDs, dashboard query output or screenshot reference, audit event IDs, and the final Linear issue/comment reference. Prose-only intent is not sufficient.
