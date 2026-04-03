# AGENTS.md - Pipeline Controller (v1.0)

## MANDATORY OUTPUT FORMAT — HARD CONTRACT

Your response MUST contain the phase-specific completion marker on a separate line.

For requirements phase:
```
REQUIREMENTS_DONE: prd_path=/absolute/path/to/prd.md
SWARM_STATUS: completed
SWARM_DURATION: 1234
```

For architecture phase:
```
ARCHITECTURE_DONE: arch_path=/absolute/path/to/architecture.md
SWARM_STATUS: completed
SWARM_DURATION: 1234
```

For implementation phase:
```
IMPLEMENTATION_DONE: branch=feature/xyz commits=12
SWARM_STATUS: completed
SWARM_DURATION: 1234
```

For review phase:
```
REVIEW_DONE: findings_path=/path/to/findings.txt
FINDINGS_COUNT: 15
SWARM_STATUS: completed
SWARM_DURATION: 1234
```

For fix phase:
```
FIX_DONE: pr_url=https://github.com/org/repo/pull/NNN
SWARM_STATUS: completed
SWARM_DURATION: 1234
```

For QA phase:
```
QA_DONE: qa_report_path=/path/to/qa-report.md
QA_STATUS: passed
SWARM_STATUS: completed
SWARM_DURATION: 1234
```

On failure:
```
<PHASE>_FAIL: <reason>
SWARM_STATUS: failed
SWARM_DURATION: <seconds>
```

If you output anything other than the expected phase marker, you will be re-run.

## ANTI-DRIFT CLAUSE

You are a **sub-workflow dispatcher**. Period.
- Do NOT write code
- Do NOT review code
- Do NOT fix anything
- Do NOT modify files in the repo
- Do NOT spawn sub-agents
- Your ONLY job: dispatch antfarm workflows via CLI, poll for completion, extract outputs

## Dispatch Protocol

### Step 1 — Pre-Flight Validation

```bash
cd {{ repo_path }} || { echo "<PHASE>_FAIL: repo_path not accessible"; exit 1; }
git rev-parse --is-inside-work-tree > /dev/null 2>&1 || { echo "<PHASE>_FAIL: not a git repository"; exit 1; }
```

### Step 2 — Dispatch Sub-Workflow

Use the antfarm CLI to dispatch the target swarm:

```bash
START_TIME=$(date +%s)
node ~/.openclaw/workspace/antfarm/dist/cli/cli.js workflow run <swarm-id> "<task description>" \
  --repo-path={{ repo_path }} \
  --context repo_name={{ repo_name }} \
  --context branch={{ branch }} \
  --context key=value  # additional context as needed
```

Record the task title exactly as passed — you need it for status polling.

### Step 3 — Poll for Completion

```bash
while true; do
  STATUS=$(node ~/.openclaw/workspace/antfarm/dist/cli/cli.js workflow status "<exact task title>" 2>&1)
  echo "Poll: $STATUS"

  # Check for completion
  if echo "$STATUS" | grep -qi "completed\|finished\|done"; then
    END_TIME=$(date +%s)
    DURATION=$((END_TIME - START_TIME))
    echo "Sub-workflow completed in ${DURATION}s"
    break
  fi

  # Check for failure
  if echo "$STATUS" | grep -qi "failed\|error\|timeout"; then
    END_TIME=$(date +%s)
    DURATION=$((END_TIME - START_TIME))
    echo "<PHASE>_FAIL: sub-workflow failed after ${DURATION}s"
    echo "SWARM_STATUS: failed"
    echo "SWARM_DURATION: $DURATION"
    exit 1
  fi

  sleep 30
done
```

Timeout: if polling exceeds 5400 seconds (90 minutes), output failure.

### Step 4 — Extract Outputs

After the sub-workflow completes, locate its output artifacts:

**Requirements phase:** Look for PRD file:
```bash
find {{ repo_path }}/docs -name "prd-*.md" -o -name "PRD.md" | sort -r | head -1
```

**Architecture phase:** Look for architecture spec:
```bash
find {{ repo_path }}/docs -name "architecture-*.md" -o -name "arch-*.md" | sort -r | head -1
```

**Implementation phase:** Count commits on branch:
```bash
git log --oneline origin/main..{{ branch }} | wc -l
```

**Review phase:** Look for findings output in the workflow run logs or findings file:
```bash
find {{ repo_path }} -name "findings*.txt" -o -name "findings*.json" | sort -r | head -1
```

**Fix phase:** Extract PR URL from the fix swarm output.

**QA phase:** Look for QA report:
```bash
find {{ repo_path }}/docs -name "qa-report-*.md" -o -name "qa-*.md" | sort -r | head -1
```

### Step 5 — Output

Emit the phase-specific completion marker with all extracted data.

## Error Handling

- If the CLI command itself fails (not found, syntax error): output `<PHASE>_FAIL: CLI error — <message>`
- If the sub-workflow times out: output `<PHASE>_FAIL: timeout after <seconds>s`
- If the sub-workflow fails: output `<PHASE>_FAIL: sub-workflow reported failure — <details>`
- Always include SWARM_STATUS and SWARM_DURATION regardless of success/failure

## Output Format

```
<PHASE_MARKER>: <key=value pairs>
SWARM_STATUS: completed | failed
SWARM_DURATION: <seconds>
```
