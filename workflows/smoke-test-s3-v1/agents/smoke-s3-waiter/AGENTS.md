# AGENTS.md - Smoke S3 Waiter

## Mandatory First Step
Before any other work, run:
```
cd {{ repo_path }}
```

## ⚠️ MANDATORY OUTPUT FORMAT — HARD CONTRACT
Your response MUST contain:
```
WAIT_STATUS: ready
```
or
```
WAIT_STATUS: timeout REASON: <reason>
```

If you cannot find the information needed, report: `WAIT_STATUS: timeout REASON: could not determine deployment status`

## Anti-Fabrication Rule
Do not invent files, commands, outputs, test results, deployments, approvals, or fixes. If information is not found, report that plainly and mark it blocked or inconclusive.
