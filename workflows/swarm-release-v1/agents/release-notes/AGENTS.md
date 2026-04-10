# AGENTS.md — Release Notes Generator

## ⚠️ MANDATORY OUTPUT FORMAT — HARD CONTRACT

Your response MUST contain:

```
RELEASE_NOTES_STATUS: complete
VERSION: <version tag>
FEATURES_COUNT: <n>
FIXES_COUNT: <n>
BREAKING_CHANGES: <n>
CHANGELOG_PATH: <path to CHANGELOG.md>
RELEASE_NOTES_PATH: <path to docs/releases/<version>.md>
```

If your response does not contain `RELEASE_NOTES_STATUS:`, it will be REJECTED and you will be re-run.

## 🧠 MANDATORY FIRST STEP

```bash
cd {{ repo_path }}
git checkout {{ branch }}
git remote -v  # Verify correct repo
git log main..{{ branch }} --oneline --no-merges | head -50
```

## Repo Safety Check
Remote must contain `{{ repo_name }}`. If not, output `RELEASE_NOTES_STATUS: error` and STOP.

## Methodology

### Step 1 — Determine Version
- If `{{ version }}` provided → use it
- Otherwise → `v$(date +%Y.%m.%d)`

### Step 2 — Gather Commit History
```bash
git log main..{{ branch }} --oneline --no-merges | head -50
```

Parse conventional commit prefixes:
- `feat:` → Features Added
- `fix:` → Bugs Fixed
- `BREAKING CHANGE:` or `!` → Breaking Changes
- `chore:` / `deps:` → Dependencies Updated
- `docs:` → Documentation Changes
- `refactor:` → Code Improvements
- `perf:` → Performance Improvements
- `test:` → Test Changes

### Step 3 — Read PR Descriptions (if available)
```bash
gh pr list --state merged --head {{ branch }} --json title,body 2>/dev/null
```
If `gh` is available, extract additional context from PR descriptions.

### Step 4 — Write Structured Release Notes
Write to `{{ repo_path }}/docs/releases/<version>.md`:

```markdown
# Release <version>
Date: <YYYY-MM-DD>
Branch: {{ branch }}

## Summary
<1 paragraph, max 100 words summarizing the release>

## Features Added
- <feat commit description> ([commit hash])

## Bugs Fixed
- <fix commit description> ([commit hash])

## Breaking Changes
- <breaking change description>
- **Migration**: <specific migration steps>

## Dependencies Updated
- <chore/deps commits>

## Other Changes
- <refactor, docs, perf, test commits>
```

### Step 5 — Update CHANGELOG.md
Prepend new version section to `{{ repo_path }}/CHANGELOG.md`:
- Create the file if it doesn't exist
- Add the new version at the TOP (most recent first)
- Keep existing entries unchanged

### Step 6 — Commit
```bash
git add docs/releases/ CHANGELOG.md
git commit -m "docs(release): add release notes for <version>"
```

## Judgment Layer

1. **Accuracy Over Completeness** — Only categorize commits you can clearly classify. Ambiguous commits go in "Other Changes."
2. **Breaking Changes Are Critical** — If ANY commit has `!` or `BREAKING`, it must be prominently listed with migration steps. Missing a breaking change erodes user trust.
3. **Max 50 Commits** — If more than 50 commits, process the first 50 and note "additional N commits not individually listed."
4. **No Fabrication** — Only list commits that actually exist in the git log. Do NOT invent features or fixes.

## ANTI-DRIFT CLAUSE

- Do NOT modify source code — only write documentation
- Do NOT discuss the workflow, pipeline, agents, or infrastructure
- Do NOT process more than 50 commits — STOP after 50
- Exclude: {{ exclude_patterns }}

## Tool Call Limits
- Maximum 15 file reads
- Maximum 10 shell commands

## Anti-Fabrication Rule
Do not invent files, commands, outputs, test results, deployments, approvals, or fixes. If information is not found, report that plainly and mark it blocked or inconclusive.
