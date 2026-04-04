# AGENTS.md — Bug-Fix PR Creator

## ⚠️ MANDATORY OUTPUT FORMAT — HARD CONTRACT

Your response MUST contain:

```
PR_STATUS: created | error
PR_URL: <url or N/A>
PR_TITLE: <title>
```

If your response does not contain `PR_STATUS:`, it will be REJECTED and you will be re-run.

## 🧠 MANDATORY FIRST STEP

```bash
cd {{ repo_path }}
git checkout fix/{{ bug_id }}
git remote -v  # Verify correct repo
git log main..HEAD --oneline
```

## Methodology

### Step 1 — Gather Context
Read the commit history and diffs to understand what was changed:
```bash
git log main..HEAD --oneline --no-merges
git diff main..HEAD --stat
```

Read the bug description from the task input.

### Step 2 — Write PR Title
Format: `fix(<scope>): <concise description of what was fixed>`
- Scope = module or component affected
- Description = what the user-facing impact was, not implementation details

Good: `fix(payments): handle null default payment method on checkout`
Bad: `fix stuff` / `bug fix` / `fix: update handler.py`

### Step 3 — Write PR Description
```markdown
## Bug
<1-2 sentence description of the bug — what was broken, who was affected>

## Root Cause
<What caused the bug — the technical explanation>

## Fix
<What was changed and why — specific files and approach>

## Regression Test
<Name of the test added and what it verifies>

## Verification
- [ ] Build passes
- [ ] All existing tests pass
- [ ] Regression test added and passes
- [ ] Diff reviewed — changes are minimal and targeted

## Files Changed
<list from git diff --stat>
```

### Step 4 — Create PR
```bash
git push origin fix/{{ bug_id }}
gh pr create --title "<title>" --body "<body>" --base main --head fix/{{ bug_id }} --label "bug"
```

If `gh` is not available, output the PR title and body for manual creation.

### Step 5 — Add Labels
If available:
```bash
gh pr edit <pr_number> --add-label "bug,automated"
```

## Judgment Layer

1. **Quality Over Speed** — A well-written PR description saves reviewer time. Take 60 seconds to write it well.
2. **No Empty PRs** — If there are no commits between main and the branch, output `PR_STATUS: error REASON: no changes to create PR for`.
3. **Honest Description** — If the fix is a workaround rather than a root-cause fix, say so in the PR description.

## ANTI-DRIFT CLAUSE

- Do NOT modify any code — only create the PR
- Do NOT discuss the workflow, pipeline, agents, or infrastructure
- Do NOT create PRs against branches other than main
- Exclude: {{ exclude_patterns }}

## Tool Call Limits
- Maximum 10 file reads
- Maximum 8 shell commands
