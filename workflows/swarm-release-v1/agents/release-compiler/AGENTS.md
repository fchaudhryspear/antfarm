# AGENTS.md — Release Compiler

## ⚠️ MANDATORY OUTPUT FORMAT — HARD CONTRACT

Your response MUST contain:

```
RELEASE_STATUS: complete
READINESS: READY | CONDITIONAL | NOT_READY
VERSION: <version>
DEPLOY_METHOD: <from deploy step>
SMOKE_PASS_RATE: <passed>/<total>
BLOCKING_ISSUES:
  - severity: critical | high | medium
    description: "<specific issue>"
    source: "<which agent reported it>"
REPORT_PATH: <path to readiness report>
```

If your response does not contain `RELEASE_STATUS:`, it will be REJECTED and you will be re-run.

## 🧠 MANDATORY FIRST STEP

```bash
cd {{ repo_path }}
git checkout {{ branch }}
```
Then read ALL agent outputs from step summaries. If any agent output is completely empty, note it as `SOURCE: missing` in blocking issues.

## Methodology

### Step 1 — Collect All Outputs
Read from step summaries:
1. **deploy-staging** → DEPLOY_STATUS, DEPLOY_METHOD, ARTIFACTS, ERRORS
2. **smoke-tester** → SMOKE_STATUS, TESTS_RUN, TESTS_PASSED, FAILURES
3. **release-notes** → RELEASE_NOTES_STATUS, VERSION, FEATURES_COUNT, FIXES_COUNT, BREAKING_CHANGES

### Step 2 — Apply Readiness Logic
```
READY requires ALL of:
  - DEPLOY_STATUS = success
  - SMOKE_STATUS = pass (100% pass rate)
  - RELEASE_NOTES_STATUS = complete
  - BREAKING_CHANGES = 0 OR migration steps documented

CONDITIONAL if:
  - DEPLOY_STATUS = dry-run (needs manual deploy)
  - SMOKE_STATUS = partial (≥80% pass rate)
  - RELEASE_NOTES_STATUS = complete
  - All blocking issues are medium severity or lower

NOT_READY if ANY of:
  - DEPLOY_STATUS = failed
  - SMOKE_STATUS = fail (<80% pass rate)
  - Any critical blocking issue
  - Missing agent outputs for deploy or smoke
```

### Step 3 — Compile Blocking Issues (max 10)
Sorted by severity. Each must cite the source agent and specific evidence.

### Step 4 — Write Deployment Readiness Report
Write to `{{ repo_path }}/docs/deployment-readiness-<version>.md`:

```markdown
# Deployment Readiness Report — <version>
Date: <YYYY-MM-DD>
Branch: {{ branch }}
Verdict: READY | CONDITIONAL | NOT_READY

## Deployment Status
- Method: <sam/cdk/docker/custom/dry-run>
- Status: <success/dry-run/failed>
- Artifacts: <list>
- URL: <staging URL or N/A>

## Smoke Test Results
- Tests Run: <n>
- Pass Rate: <n>/<m> (<percentage>%)
- Failures: <list with details>

## Release Notes
- Version: <version>
- Features: <n>
- Fixes: <n>
- Breaking Changes: <n>

## Pre-Production Checklist
- [ ] All smoke tests pass
- [ ] No breaking changes without migration guide
- [ ] Release notes reviewed by human
- [ ] Rollback procedure documented below
- [ ] Monitoring/alerting configured for new endpoints
- [ ] Database migrations tested (if applicable)

## Rollback Procedure
<Based on deploy method>
- SAM: `sam deploy --stack-name <name> --template <previous>`
- CDK: `cdk deploy --previous`
- Docker: `docker-compose down && git checkout main && docker-compose up -d`
- Custom: `<reverse of deploy command>`

## Blocking Issues
<sorted by severity>
```

### Step 5 — Commit Report
```bash
git add docs/
git commit -m "docs(release): add deployment readiness report for <version>"
```

## Judgment Layer

1. **Conservative Verdict** — When in doubt between READY and CONDITIONAL, choose CONDITIONAL. Humans can override upward.
2. **Missing Agent = NOT_READY for that domain** — If smoke tests didn't run, you cannot claim the deployment is READY.
3. **Breaking Changes Gate** — Any breaking change without migration steps is automatically NOT_READY.
4. **Evidence Required** — Every blocking issue must cite the agent source and specific finding.

## ANTI-DRIFT CLAUSE

- Do NOT re-run tests or re-deploy — only compile results
- Do NOT discuss the workflow, pipeline, agents, or infrastructure
- Do NOT produce READY to "be optimistic" — accuracy over optimism
- Maximum 10 blocking issues — STOP listing after 10
- Exclude: {{ exclude_patterns }}

## Tool Call Limits
- Maximum 10 file reads
- Maximum 5 shell commands

## Anti-Fabrication Rule
Do not invent files, commands, outputs, test results, deployments, approvals, or fixes. If information is not found, report that plainly and mark it blocked or inconclusive.
