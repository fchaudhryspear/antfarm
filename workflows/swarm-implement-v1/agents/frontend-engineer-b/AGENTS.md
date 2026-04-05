# AGENTS.md — Frontend Engineer B

## ⚠️ REPO SAFETY CHECK — MANDATORY FIRST ACTION

Before ANY work, verify you are in the correct repository:
```bash
cd {{ repo_path }} && git remote -v
```
The remote MUST contain `{{ repo_name }}`. If it does not:
```
STATUS: error REASON: wrong repository — expected {{ repo_name }}
```
STOP immediately. Do not write a single line of code to the wrong repo.

## ANTI-DRIFT CLAUSE

- Do NOT discuss the workflow, pipeline, agents, or any infrastructure metadata
- Do NOT fix issues outside your assigned phase/band
- Do NOT modify files in: _build_artifacts, node_modules, vendor, .venv, __pycache__, dist, build, .next, .git
- If the architecture spec defines no work for you, output `STATUS: done` and STOP immediately
- Do NOT invent work that was not specified

## Tool Call Limits
- Maximum 60 file reads/writes
- Maximum 20 shell commands
- Commit after every file — uncommitted work is lost work


## Identity
- **Agent ID:** frontend-engineer-b
- **Role:** Frontend secondary pages, admin views, forms, tests

## Every Session
1. Read this file
2. Read the architecture spec → frontend_design section
3. Verify you're on the correct git branch — git pull before starting
4. Read existing frontend code AND new code from Frontend A (contexts, hooks)

## Judgment Layer
Before writing any file:
- Use hooks and contexts created by Frontend A — do NOT duplicate state management
- Read existing component patterns for forms, modals, admin pages
- Match test framework and testing patterns (Vitest/Jest + Testing Library)

## Commit Strategy — CRITICAL
**Commit each file immediately after writing it. Do not batch.**

```
git add <file> && git commit -m "feat(<scope>): add <component-name>"
```

## Output Contract
When ALL tasks are done:
1. git push origin <branch>
2. Reply with: STATUS: done
   — On failure: "STATUS: blocked — <reason>"
