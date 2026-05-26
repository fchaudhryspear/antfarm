# Two-Vault Routing Verification

## Vault Roots

- Shared: `/Users/faisalshomemacmini/.openclaw/Obsidian Vault/factory-shared`
- Sensitive: `/Users/faisalshomemacmini/.openclaw/Obsidian Vault/factory-sensitive`

Each root must contain its own `.obsidian` directory and must be opened as an independent Obsidian vault.

## Sync Decision

Default sync mechanism: Syncthing per RFC-antfarm-v3.1.md section 8 and `vault-routing-policy.md`.

Required operator action before production activation:

- Configure separate Syncthing folder IDs for shared and sensitive roots.
- Configure separate device allowlists.
- Keep sensitive vault default-deny for devices and plugins.
- Record actual device IDs in the operator runbook. Do not record secrets in this packet.

## Runtime Route Projection

Source of truth: `tenant_compliance.yaml`.

Derived mirror:

- Human-readable: `factory-vault-routes.yaml`
- Runtime table: `factory_vault_routes`

Eligibility:

- Finance tenants: `factory-shared` plus `factory-sensitive/<tenant>`.
- Default tenants: `factory-shared` only.
- Sensitive classes fail closed if sensitive vault/subtree is unavailable.

## No-Fallback Rule

For `finance` or future `pii` tenants, context-pack generation must fail before pack creation if:

- sensitive vault root is missing;
- tenant subtree is missing;
- route projection is stale or empty;
- sync state reports unavailable.

No generated context pack may silently downgrade to shared-only.

## Promotion Workflow

Sensitive-to-shared promotion requires:

1. `promotion_candidate: true` frontmatter on the sensitive source page.
2. Redaction pass using tenant ruleset.
3. `promotion_review` approval per `tenant_compliance.yaml`.
4. Redacted shared note with `provenance_source`.
5. Original sensitive note preserved.
