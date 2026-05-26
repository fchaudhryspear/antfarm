# ADP-414 Vault Routing Policy

Owner: Leo for operator workflow/docs. Atlas owns storage/sync mechanics and runtime projection.

## Vault Roots

The v3.1 Obsidian vault split uses two physically separate vault roots:

- Shared vault: `/Users/faisalshomemacmini/.openclaw/Obsidian Vault/factory-shared`
- Sensitive vault: `/Users/faisalshomemacmini/.openclaw/Obsidian Vault/factory-sensitive`

Each root has its own `.obsidian/` directory and must be opened by Obsidian as an independent vault, not as a folder inside the existing Dual-Agent Ops Vault.

## Sync Decision

Default sync mechanism: Syncthing per RFC v0.15.

- `factory-shared` syncs through the shared factory sync target.
- `factory-sensitive` syncs through a separate restricted sync target.
- Adding a device to `factory-sensitive` is a `security_changes` action and requires founder-class approval until a named Day2 Ops operator is activated with explicit authority.

Atlas handoff: configure the actual Syncthing device IDs, ignore patterns, and access controls. Leo's acceptance evidence is the operator policy and independent vault-root creation.

## Route Rules

- `default` tenants read from `factory-shared` only.
- `finance` tenants read from `factory-shared` plus their own subtree under `factory-sensitive/<tenant_id>`.
- Future `pii` tenants read from `factory-shared` plus their own subtree under `factory-sensitive/<tenant_id>`.
- Sensitive tenants fail closed if their sensitive vault path is unavailable. There is no fallback to shared-only context for finance or PII work.

Initial tenant routes:

- `flobase`: `factory-shared` + `factory-sensitive/flobase`
- `credologi`: `factory-shared` + `factory-sensitive/credologi`
- `utility_valet`: `factory-shared` only while PII remains in Zoho
- `spearhead`: `factory-shared` only
- `fcrp_capital`: `factory-shared` only unless Faisal explicitly elevates it to finance
- `starship_residential`: `factory-shared` only

## Plugin Policy

- `factory-shared`: Obsidian core plugins plus the maintained shared allowlist.
- `factory-sensitive`: Obsidian core plugins only by default. Any community plugin requires explicit approval for the relevant compliance class.
- Cross-vault links are written as plain text paths, not Obsidian wikilinks, because working cross-vault wikilinks are not portable and can leak context into plugin indexes.

## Promotion Workflow

Promoting content from sensitive to shared requires:

1. Source page identified under `factory-sensitive/<tenant_id>/`.
2. Redaction ruleset applied for the tenant compliance class.
3. `promotion_review` gate approved by Faisal or activated Day2 Ops authority.
4. Approved page written to `factory-shared` with `provenance_source: <tenant_id>/<path>`.
5. Original sensitive page retained in `factory-sensitive`; shared content is never moved back into sensitive without explicit tenant tagging.

## Runtime Handoff

Simon/Atlas implementation must project these rules into `factory_vault_routes` and the context-pack eligibility calculator. Tests should prove finance tenants cannot proceed when the sensitive vault is missing.
