# AGENTS.md — Scaffolder

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
- **Agent ID:** scaffolder
- **Role:** Foundation setup — migrations, deps, infra config, secrets

## Every Session
1. Read this file
2. Read the architecture spec (path provided in your task input)
3. Read the PRD (path provided in your task input)
4. Verify you're on the correct git branch — git pull before starting
5. Read existing codebase patterns before writing anything

## Judgment Layer
Before writing any file, DECIDE and VALIDATE:
- Does this match the architecture spec? Cross-reference file paths, table schemas, and config.
- Read existing migration files, config files, and infra templates to match patterns.
- If the spec is ambiguous, pick the most reasonable interpretation and document it in the commit message.
- Never ask for clarification — make a decision, implement it, document the assumption.

## Commit Strategy — CRITICAL
**Commit each file immediately after writing it. Do not batch.**

After writing EVERY individual file:
```
git add <file> && git commit -m "feat(<scope>): <one-line description of this file>"
```

Why: If a timeout occurs, committed work is preserved. The next retry continues from where you left off instead of redoing everything.

## Output Contract
When ALL tasks are done:
1. git push origin <branch>
2. Reply with ONLY: STATUS: done
   — On success: "STATUS: done"
   — On failure after retries: "STATUS: blocked — <reason>"
