# ADP-414 Closure Runbook and Evidence Checklist

Generated: 2026-05-25
Owner: Atlas
Collaborator: Leo
Issue: ADP-414

## Current Disposition

ADP-414 is not ready for Done until Syncthing folder/device configuration is completed and read back.

The policy and local vault split evidence are ready:

- `vault-routing-policy.md`
- `vault-routing-verification.md`
- `factory-vault-routes.yaml`
- `tenant_compliance.yaml`
- `validation/vault_route_checks.sh`
- Leo Linear evidence for independent root creation and operator policy

Local verification already passes:

```bash
bash /Users/faisalshomemacmini/.openclaw/antfarm/workflows/antfarm-v3.1/validation/vault_route_checks.sh
```

Expected output:

```text
vault roots and required sensitive tenant subtrees verified
```

Syncthing is installed but intentionally not running until folder/device configuration is approved:

```bash
syncthing --version
brew services list | rg -i '^syncthing|Name'
```

Observed status on 2026-05-25:

```text
syncthing v2.1.0 "Hafnium Hornet" (darwin-arm64)
syncthing     none
```

## Values Required From Faisal Before Configuration

Provide these exact values before Atlas or NexDev configures or starts Syncthing:

- Approval to start/configure Syncthing on this Mac mini.
- Shared vault folder ID, or approval for the operator to generate one.
- Sensitive vault folder ID, or approval for the operator to generate one.
- Allowed remote device IDs for `factory-shared`.
- Allowed remote device IDs for `factory-sensitive`.
- Confirmation whether this Mac mini device ID is authorized for both vaults.
- Ignore patterns for each vault, or approval to use the default patterns below.
- Confirmation that adding/removing `factory-sensitive` devices is founder-class `security_changes`.
- Approval to record non-secret folder/device IDs in this evidence packet and Linear.

Default ignore patterns proposed:

```text
(?d).DS_Store
(?d).Trash-*/
(?d).obsidian/workspace*.json
(?d).obsidian/cache/
```

## Configuration Plan

1. Confirm vault roots:

```bash
test -d "/Users/faisalshomemacmini/.openclaw/Obsidian Vault/factory-shared/.obsidian"
test -d "/Users/faisalshomemacmini/.openclaw/Obsidian Vault/factory-sensitive/.obsidian"
test -d "/Users/faisalshomemacmini/.openclaw/Obsidian Vault/factory-sensitive/flobase"
test -d "/Users/faisalshomemacmini/.openclaw/Obsidian Vault/factory-sensitive/credologi"
```

2. Start Syncthing only after approval:

```bash
brew services start syncthing
```

3. Read local Syncthing device ID:

```bash
syncthing cli show system
```

4. Configure two separate folders:

```text
factory-shared
  path: /Users/faisalshomemacmini/.openclaw/Obsidian Vault/factory-shared
  devices: approved shared-vault device IDs only

factory-sensitive
  path: /Users/faisalshomemacmini/.openclaw/Obsidian Vault/factory-sensitive
  devices: approved sensitive-vault device IDs only
```

5. Apply independent device allowlists:

- `factory-shared` may include shared factory operators approved by Faisal.
- `factory-sensitive` must include only devices explicitly approved for sensitive/finance data.
- No device may inherit access to `factory-sensitive` because it is present on `factory-shared`.

6. Apply ignore patterns separately for both folders.

7. Confirm service status:

```bash
brew services list | rg -i '^syncthing|Name'
```

## Evidence To Capture For Closure

Capture the following in a follow-up evidence artifact before moving ADP-414 to Done:

- Syncthing version.
- Service status after configuration.
- Local Mac mini Syncthing device ID.
- `factory-shared` folder ID.
- `factory-sensitive` folder ID.
- Redacted readback showing `factory-shared` path and allowed device IDs.
- Redacted readback showing `factory-sensitive` path and allowed device IDs.
- Readback proving `factory-sensitive` device list is not a superset inherited from `factory-shared`.
- Ignore pattern readback for both folders.
- `validation/vault_route_checks.sh` output.
- Context-pack eligibility evidence:
  - `flobase` eligible roots include `factory-shared` and `factory-sensitive/flobase`.
  - `credologi` eligible roots include `factory-shared` and `factory-sensitive/credologi`.
  - default tenants use `factory-shared` only.
  - finance tenants fail closed if sensitive root or tenant subtree is missing.
- Promotion workflow evidence:
  - redacted shared note includes `provenance_source`.
  - original sensitive source remains in `factory-sensitive/<tenant>`.
- Linear comment linking this artifact and the final readback artifact.

## Done Criteria

ADP-414 can move to Done when all are true:

- Two independent Obsidian vault roots exist and pass `validation/vault_route_checks.sh`.
- Syncthing has two separate folder configurations for `factory-shared` and `factory-sensitive`.
- Device allowlists are independently configured and read back.
- Sensitive-vault device access is approved by Faisal or activated Day2 Ops with explicit authority.
- No-fallback behavior for finance/PII context packs is evidenced.
- Leo operator review remains represented by the existing operator policy and comments.
- Final evidence artifact is committed to this canonical packet and referenced from Linear.

## Current Blocker

Atlas cannot safely complete the operational configuration without:

- approved shared/sensitive remote device IDs;
- approval to start/configure Syncthing;
- confirmation of sensitive-vault allowlist authority.

Estimated completion after inputs are provided: 30-45 minutes for configuration, readback, evidence capture, and Linear closeout.
