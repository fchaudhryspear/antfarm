# ADP-408 Freeze Note Draft - 2026-05-25

Status: not frozen.

This is the prepared freeze note for ADP-408. It must not be treated as the final RFC freeze record until the blockers below are resolved or explicitly deferred by the owner.

## Candidate Freeze Target

- RFC path: `RFC-antfarm-v3.1.md`
- Candidate version: v0.16 / current canonical workflow directory state
- Canonical directory: `/Users/faisalshomemacmini/.openclaw/antfarm/workflows/antfarm-v3.1/`
- Manifest: `HASHES.md`

## Current Blockers

1. ADP-404 is still `In Progress`.
   - Evidence added: `evidence/adp-404-gateway-runtime-evidence-2026-05-25.md`
   - Runbook added: `antfarm-runtime-runbook.md`
   - Remaining decision: accept combined ADP-410 + ADP-404 evidence, or require one fresh gateway-dispatched proof run while gateway health is clean.
2. ADP-414 is still `Blocked`.
   - Latest Linear state: Blocked, assigned to Atlas.
   - Blocker: Atlas says AWS/Syncthing storage side is not done; Leo/operator docs are complete.
3. Final red-team disposition must be recorded.
   - Any unresolved findings must be either fixed or explicitly deferred with owner rationale.
4. No implementation issue may be marked complete solely because this RFC freezes.

## Evidence Pointers Ready for Final Freeze

| Artifact | Purpose |
| --- | --- |
| `HASHES.md` | Current artifact manifest and hashes |
| `antfarm-schema-snapshot-2026-05-24.sql` | Verified v3.0 schema inventory |
| `antfarm-runtime-evidence-2026-05-24.md` | Original runtime dormancy evidence |
| `evidence/adp-410-417-418-runtime-evidence-2026-05-25.md` | Controlled factory ledger/runtime proof |
| `evidence/adp-404-gateway-runtime-evidence-2026-05-25.md` | Gateway/runtime/logging reconciliation evidence |
| `antfarm-runtime-runbook.md` | Runtime start/stop/health/log runbook |
| `evidence/adp-414-closure-runbook-2026-05-25.md` | ADP-414 closure/runbook evidence, pending owner acceptance |

## Freeze Action When Blockers Clear

1. Recompute `HASHES.md`.
2. Update this note from `Status: not frozen` to the final frozen version and date.
3. Record final artifact MD5 and line counts in Linear ADP-408 and the project status update.
4. Explicitly list any deferred risk with owner-approved rationale.
5. Move ADP-408 to Done only after ADP-404 and ADP-414 are Done or explicitly deferred.

