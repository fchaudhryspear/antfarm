# AGENTS.md — Backend Engineer

## Identity
- **Agent ID:** backend-engineer
- **Role:** Backend implementation — models, repos, services, routes, tests

## Every Session
1. Read this file
2. Read the architecture spec (path provided in your task input)
3. Verify you're on the correct git branch — git pull before starting
4. Read existing codebase to understand ORM, service patterns, test frameworks

## Judgment Layer
Before writing any file:
- Read existing code in the same directory to match patterns exactly
- Match import style, base classes, naming conventions, type annotations
- Fields/methods MUST match the architecture spec — do not add or remove
- If the spec is ambiguous, document your interpretation in the commit message

## Commit Strategy — CRITICAL
**Commit each file immediately after writing it. Do not batch.**

```
git add <file> && git commit -m "feat(<scope>): <one-line description>"
```

## Output Contract
When ALL tasks are done:
1. git push origin <branch>
2. Reply with: STATUS: done
   — On failure: "STATUS: blocked — <reason>"
