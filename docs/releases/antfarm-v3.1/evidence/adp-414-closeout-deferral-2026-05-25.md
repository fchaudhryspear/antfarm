# ADP-414 Closeout With Explicit Syncthing Deferral

Generated: 2026-05-25
Owner: Atlas
Issue: ADP-414

## Closeout Decision

ADP-414 is closed for Atlas scope with an explicit deferral of live Syncthing folder/device evidence.

The accepted boundary is:

- Atlas completed the two-vault Obsidian split policy and local evidence packet.
- Atlas verified the local vault roots and required sensitive tenant subtrees.
- Syncthing is installed locally and intentionally not running.
- Live Syncthing folder IDs, remote device allowlists, service readback, and sensitive-vault device access evidence are deferred until Faisal provides approved device IDs and an explicit configuration/start window.

This keeps ADP-414 from blocking the v3.1 packet on unavailable remote-device inputs while preserving the security gate for actual sensitive-vault sync activation.

## Evidence

Canonical artifacts:

- `vault-routing-policy.md`
- `vault-routing-verification.md`
- `factory-vault-routes.yaml`
- `tenant_compliance.yaml`
- `validation/vault_route_checks.sh`
- `evidence/adp-414-closure-runbook-2026-05-25.md`

Local validation:

```bash
bash /Users/faisalshomemacmini/.openclaw/antfarm/workflows/antfarm-v3.1/validation/vault_route_checks.sh
```

Observed output:

```text
vault roots and required sensitive tenant subtrees verified
```

Syncthing install/readiness:

```bash
syncthing --version
brew services list | rg -i '^Name|^syncthing'
```

Observed output:

```text
syncthing v2.1.0 "Hafnium Hornet" (go1.26.3 darwin-arm64) brew@Tahoe-arm64.local 2026-05-12 05:59:47 UTC [noupgrade]
Name          Status User               File
syncthing     none
```

The `none` service status is intentional because folder and device allowlists are not approved/configured yet.

## Deferred Activation Gate

Before live vault sync is enabled, Atlas or NexDev still needs:

- Approval to start/configure Syncthing on this Mac mini.
- Shared vault folder ID, or approval to generate one.
- Sensitive vault folder ID, or approval to generate one.
- Approved remote device IDs for `factory-shared`.
- Approved remote device IDs for `factory-sensitive`.
- Confirmation that this Mac mini device ID is authorized for the target vaults.
- Approval to record non-secret folder/device IDs in Linear/evidence.

Adding or removing a device from `factory-sensitive` remains a founder-class `security_changes` action.

## Linear Closeout Text

Recommended Linear comment:

```markdown
Atlas closeout for ADP-414:

Closed with explicit Syncthing activation deferral.

Completed:
- Two independent Obsidian vault roots are present.
- Local vault routing validation passes: `vault roots and required sensitive tenant subtrees verified`.
- Canonical policy/runtime projection artifacts are in `/Users/faisalshomemacmini/.openclaw/antfarm/workflows/antfarm-v3.1/`.
- Syncthing is installed: `syncthing v2.1.0 "Hafnium Hornet"`.
- Syncthing daemon remains intentionally stopped: `brew services list` reports `syncthing none`.

Deferred by owner direction:
- Live Syncthing folder IDs.
- Remote device allowlists.
- Service/config readback after start.
- Sensitive-vault device access evidence.

Activation remains gated on approved shared/sensitive device IDs and explicit approval to start/configure Syncthing. Sensitive-vault device changes remain founder-class `security_changes`.

Closeout artifact: `evidence/adp-414-closeout-deferral-2026-05-25.md`.
```

## Final Atlas Status

Atlas scope is complete. Operational Syncthing activation is a deferred follow-up, not an ADP-414 blocker.
