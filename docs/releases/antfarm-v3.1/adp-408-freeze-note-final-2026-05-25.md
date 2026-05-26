# ADP-408 Final Freeze Note - 2026-05-25

Status: frozen.

ADP-408 freezes Antfarm v3.1 at the current canonical v0.16 workflow directory state after red-team consolidation and explicit dependency closeout.

## Frozen Target

- RFC path: `RFC-antfarm-v3.1.md`
- Frozen version: v0.16 / current canonical workflow directory state
- Canonical directory: `/Users/faisalshomemacmini/.openclaw/antfarm/workflows/antfarm-v3.1/`
- Manifest: `HASHES.md`
- RFC MD5: `6adf05fd0d267ac9ff9d092e47a9f46d`
- RFC line count: 1409

## Closeout Basis

- ADP-404 is Done/accepted for ADP-408 purposes. The gateway proof caveat was accepted and split to ADP-424 as Phase C readiness work; it does not block this RFC freeze.
- ADP-409 is closure-ready after Simon evidence on 2026-05-25: PR `fchaudhryspear/antfarm#12`, commit `abba1ae`, with `npm run build` and targeted Node tests passing, 13 tests.
- ADP-413 is closure-ready on the same Simon evidence packet: RTBF/audit invalid-row rejection, tenant-null RTBF transition rejection, unknown event rejection, and raw PII payload rejection are covered.
- ADP-416 is closure-ready on the same Simon evidence packet: Day2 Ops malformed audit rows are rejected before retention processing.
- ADP-414 is Done with explicit Syncthing activation deferral. The two independent vault roots and local routing validation are complete; live Syncthing folder IDs, remote allowlists, service/config readback, and sensitive-vault device access evidence are deferred by owner direction.

## Red-Team Disposition

- Review inputs: `review-findings.simon.json`, `review-findings.atlas.json`, `review-findings.ross.json`, and `review-findings.leo.json`.
- Consolidation artifacts: `consolidated-findings.json` and `v0.16-change-plan.md`.
- Ross disposition: v0.15 was not freeze-ready; v0.16/current canonical state is the freeze target after accepted fixes and owner decisions.
- All 9 consolidated findings are accepted in the consolidation packet. Freeze-blocking findings are treated as resolved by the recorded v0.16 artifacts, dependency evidence, or explicit owner deferral below.

## Owner Decisions And Deferrals

- `restore_antfarm_snapshot` authority remains constrained as founder-approved break-glass / explicit authority rather than a routine Day2 Ops post-timeout action.
- Runtime activation gate semantics are Phase C operational readiness gates, not blockers for freezing the v3.1 RFC. Implementation issues still require their own evidence and cannot be marked complete solely because this RFC is frozen.
- ADP-414 Syncthing live activation is deferred: Syncthing is installed but intentionally stopped until approved folder/device IDs and explicit start/config approval are present. Sensitive-vault device changes remain founder-class `security_changes`.
- ADP-424 carries the isolated proof-agent shell-tool gap as Phase C readiness work and does not reopen ADP-404 or ADP-408.

## Final Artifact References

Primary hashes are recorded in `HASHES.md`. Key freeze references:

| Artifact | MD5 | Lines |
| --- | --- | ---: |
| `RFC-antfarm-v3.1.md` | `6adf05fd0d267ac9ff9d092e47a9f46d` | 1409 |
| `consolidated-findings.json` | `f32ab37d0ddfa30239992f2a0b14a9d6` | 137 |
| `v0.16-change-plan.md` | `794224e119f55c177070b8f2f2b98d0e` | 61 |
| `evidence/adp-414-closeout-deferral-2026-05-25.md` | `163565780a32204fbd11beaaadef6fbe` | 103 |
| `evidence/adp-424-isolated-proof-agent-shell-tools-evidence-2026-05-25.md` | `b50d2cc2881d449bab177a0f3dae4bf9` | 185 |

## Freeze Decision

ADP-408 is complete. The final freeze records v0.16/current canonical state, accepted red-team disposition, artifact hashes, and explicit deferred risks. Move ADP-408 to Done after this note and `HASHES.md` are posted to Linear.
