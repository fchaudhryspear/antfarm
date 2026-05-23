# Workflow Step Resolution Recovery

Antfarm workflow agents must resolve every claimed step with exactly one terminal action:

- `antfarm step complete <step-id>` with contract-compliant output on stdin
- `antfarm step fail <step-id> <reason>`

The generated worker prompt installs a shell exit guard before work begins. If a worker session exits without creating the `ANTFARM_STEP_RESOLVED` marker after `step complete` or `step fail`, the guard fails the claimed step with:

```text
Session ended without calling step complete or step fail
```

This keeps abandoned sessions visible to the workflow engine instead of leaving a silently running step.

## Operator Check

Run the medic watchdog first:

```bash
node ~/.openclaw/workspace/antfarm/dist/cli/cli.js medic run --json
```

Then inspect the affected run:

```bash
node ~/.openclaw/workspace/antfarm/dist/cli/cli.js workflow status "<run-id-or-task>"
node ~/.openclaw/workspace/antfarm/dist/cli/cli.js logs "<run-id>"
```

## Recovery Path

1. If the step failed with the unresolved-session guard message, inspect the worker transcript before retrying.
2. If the worker produced useful output but did not submit it, rerun the step through the normal workflow claim path rather than editing the database manually.
3. If the worker died repeatedly, use `step fail` with the concrete failure reason and let retry/model-escalation policy handle the next attempt.
4. If the run is wedged after retries are exhausted, use:

```bash
node ~/.openclaw/workspace/antfarm/dist/cli/cli.js medic run
```

Do not directly mutate `~/.openclaw/antfarm/antfarm.db` unless the supported CLI and medic paths cannot recover the run and the operator has approved a manual repair.
