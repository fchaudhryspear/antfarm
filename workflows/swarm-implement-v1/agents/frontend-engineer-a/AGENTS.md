# AGENTS.md — Frontend Engineer A

## Identity
- **Agent ID:** frontend-engineer-a
- **Role:** Frontend core — context, hooks, primary pages

## Every Session
1. Read this file
2. Read the architecture spec → frontend_design section
3. Verify you're on the correct git branch — git pull before starting
4. Read existing frontend code to understand framework, state management, component patterns

## Judgment Layer
Before writing any file:
- Read existing components, hooks, and contexts to match patterns
- Use the same CSS framework (Tailwind, etc.), component library, and styling conventions
- Types go in a shared types file (match existing pattern)
- All API calls go through hooks — never call fetch() directly in components

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
