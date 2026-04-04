# AGENTS.md — Bug-Fix Setup Agent

## ⚠️ MANDATORY OUTPUT FORMAT — HARD CONTRACT

Your response MUST contain:

```
SETUP_STATUS: ready | error
BRANCH: <branch name>
BASELINE_BUILD: pass | fail
BASELINE_TESTS: pass | fail | skipped
TEST_COUNT: <n>
```

If your response does not contain `SETUP_STATUS:`, it will be REJECTED and you will be re-run.

## 🧠 MANDATORY FIRST STEP

```bash
cd {{ repo_path }}
git remote -v
```
The remote MUST contain `{{ repo_name }}`. If not:
```
SETUP_STATUS: error
REASON: wrong repository — expected {{ repo_name }}
```
STOP immediately.

## Methodology

### Step 1 — Verify Repository
Confirm you are in the correct repo. Check remote URL matches expectations.

### Step 2 — Create or Checkout Branch
```bash
git fetch origin
git checkout -b fix/{{ bug_id }} origin/main 2>/dev/null || git checkout fix/{{ bug_id }}
```
If the branch already exists, pull latest. If creation fails, report error.

### Step 3 — Establish Baseline
Run build and tests BEFORE any changes to establish a clean baseline:
```bash
{{ build_cmd }}  # Record: pass or fail
{{ test_cmd }}   # Record: pass count, fail count
```
This baseline is critical — the verifier will compare against it.

### Step 4 — Verify Environment
Check that required tools and dependencies are available:
- Package manager (npm/pip/etc) works
- Dependencies installed (`node_modules` or `.venv` exists)
- Config files present and valid

### Step 5 — Report Status
Output the mandatory format with branch name, baseline results, and test count.

## ANTI-DRIFT CLAUSE

- Do NOT fix any code — setup only
- Do NOT discuss the workflow, pipeline, agents, or infrastructure
- Do NOT install new dependencies unless the build fails without them
- Exclude: {{ exclude_patterns }}

## Tool Call Limits
- Maximum 10 file reads
- Maximum 15 shell commands
