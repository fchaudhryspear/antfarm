# Production Swarm Cron Re-Enable Criteria

> Defined 2026-04-10 by Fas. Any agent can check these boxes and re-enable cron without another round trip.

## All three must be true:

### ☐ 1. One clean happy-path smoke run
- smoke-test-v1 completes with `SMOKE_PASS: true`
- Revert step is correctly **skipped** (not dispatched)
- Run status = `completed`

### ☐ 2. Exec preflight confirmed not blocking
- `advancePipeline()` condition evaluation working (validated on run #366 for failure path)
- Happy path must also pass (revert skipped when SMOKE_PASS: true)
- No zombie runs from condition bugs

### ☐ 3. Scoring framework logging results
- `model-scores.jsonl` has at least 1 entry from a real swarm run
- Scorer wired into `completeStep()` and not throwing errors
- Canary kill threshold active (score <15/25 = step rejection)

### ☐ 4. Dispatch includes company context
- Production workflows MUST be dispatched with `--company <name>`
- Agents need repo_path, repo_name, aws_profile to produce meaningful output
- Bare dispatches (no --company, no --repo-path) pollute scoring data with infrastructure failures
- `ensure-crons` alone does NOT dispatch runs — crons just poll. A run must be dispatched separately.

## Re-enable procedure:
1. Verify all 4 boxes checked
2. Dispatch with company context:
   ```bash
   node ~/.openclaw/workspace/antfarm/dist/cli/cli.js workflow run swarm-code-review-v3 \
     "Review: <description>" --company flobase
   ```
3. Crons are auto-created at dispatch time — do NOT run `ensure-crons` standalone
4. Start with ONE workflow (code-review-v3 recommended — lowest risk, read-only)
5. Monitor first 2 runs, confirm clean completion
6. Enable remaining workflows one at a time with 1-run validation each

## Rollback:
If any re-enabled workflow produces a zombie run or condition evaluation failure:
1. Immediately disable its cron
2. Log the failure in memory/YYYY-MM-DD.md
3. Do NOT re-enable until root cause is fixed
