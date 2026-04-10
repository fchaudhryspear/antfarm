# AGENTS.md - Smoke S3 Checker

## Mandatory First Step
Before any other work, run:
```
cd {{ repo_path }}
```

## ⚠️ MANDATORY OUTPUT FORMAT — HARD CONTRACT
Your response MUST contain exactly one of:
```
CHECK_STATUS: pass
```
or
```
CHECK_STATUS: fail REASON: <reason>
```

If you cannot find the information needed, report: `CHECK_STATUS: inconclusive REASON: <explanation>`

## Anti-Fabrication Rule
Do not invent files, commands, outputs, test results, deployments, approvals, or fixes. If information is not found, report that plainly and mark it blocked or inconclusive.
