# Agent Prompt Hardening Guidelines

Best practices for reducing retry rates and improving agent output consistency.

## Monitoring Retry Rates

```bash
# View all agent stats
antfarm agent-stats

# Filter by agent name
antfarm agent-stats --agent fix-security
```

Agents with >10% retry rate are flagged automatically. Target: <5% retry rate.

## Common Causes of Retries

### 1. Missing Required Output Fields

Every agent role has required output fields (Issue #337):

| Role         | Required Fields                     |
|--------------|-------------------------------------|
| analysis     | STATUS, SCORE, FINDINGS             |
| coding       | STATUS, CHANGES, FILES_MODIFIED     |
| verification | STATUS, SCORE, FINDINGS             |
| testing      | STATUS, SCORE, FINDINGS             |
| pr           | STATUS, PR_URL                      |
| scanning     | STATUS, SCORE, FINDINGS             |

**Fix:** Add explicit output format instructions at the end of your agent prompt:

```
## Required Output Format
You MUST include these fields in your output:
STATUS: done
CHANGES: <description of changes>
FILES_MODIFIED: <comma-separated list>
```

### 2. Empty or Truncated Output

Agents sometimes produce no output (timeout, crash, prompt confusion).

**Fix:**
- Keep prompts under 4000 tokens to leave room for output
- Add a fallback instruction: "If you cannot complete the task, output STATUS: error with a reason"
- Use `timeout_minutes` in workflow.yml to give complex agents more time

### 3. Output Format Drift

Agents may use lowercase keys, different separators, or prose instead of structured output.

**Fix:**
- Use UPPER_SNAKE_CASE for all output keys (matches parser expectations)
- Place output format instructions LAST in the prompt (recency bias)
- Include a concrete example of expected output in the prompt

### 4. Cross-Domain Duplicate Work

Multiple fix agents fixing the same issue wastes cycles and causes merge conflicts.

**Fix:** Issue #338 adds single-owner finding assignment. Ensure your setup agent outputs STRUCTURED_FINDINGS_JSON so the ownership map can be built.

## Prompt Structure Template

```markdown
# Role
You are the [ROLE] agent for [DOMAIN].

# Context
[Injected context from previous steps]

# Task
[Specific instructions]

# Constraints
- Read at most N files
- Fix at most M findings
- Do not modify files outside your domain

# Required Output (MANDATORY — copy this structure exactly)
STATUS: done | error | skipped
SCORE: [0-100]
FINDINGS: [count]
[additional role-specific fields]
```

## Few-Shot Examples for High-Retry Agents

Adding concrete output examples to agent prompts dramatically reduces retry rates.
Use these patterns for agents flagged with >10% retry rate.

### Fix Agent (coding role) — Few-Shot Example

Add this to the end of your fix agent's AGENTS.md:

```
## Example Output (COPY THIS FORMAT EXACTLY)

STATUS: done
CHANGES: Fixed SQL injection in login handler by parameterizing queries.
  Replaced string concatenation with prepared statements in 2 functions.
FILES_MODIFIED: src/auth/login.ts, src/auth/session.ts
SCORE: 85
```

### Review Agent (analysis role) — Few-Shot Example

```
## Example Output (COPY THIS FORMAT EXACTLY)

STATUS: done
SCORE: 72
FINDINGS: 3
  - HIGH: SQL injection in src/auth/login.ts:42 — user input concatenated into query
  - MEDIUM: Missing rate limiting on /api/login endpoint
  - LOW: Debug logging enabled in production config
```

### PR Agent (pr role) — Few-Shot Example

```
## Example Output (COPY THIS FORMAT EXACTLY)

STATUS: done
PR_URL: https://github.com/org/repo/pull/123
DOMAINS_INCLUDED: security, backend, frontend
DOMAINS_EXCLUDED: none
DEFERRED_LOG: none
```

### Skipped/Error Fallback Pattern

Every agent should include a fallback for when it cannot complete:

```
If you have NO findings or NO changes to make, output:
STATUS: skipped
SCORE: 100
FINDINGS: 0

If you encounter an error you cannot recover from, output:
STATUS: error
SCORE: 0
FINDINGS: 0
CHANGES: none
FILES_MODIFIED: none
```

## Debugging High Retry Agents

1. Run `antfarm agent-stats --agent <name>` to confirm retry rate
2. Check recent events: `antfarm logs` and filter for `step.failed` events
3. Review agent output in DB: the failed step's `output` column shows what was produced
4. Common fixes:
   - Simplify the prompt (shorter = more reliable)
   - Add explicit output examples (see few-shot section above)
   - Increase `max_retries` as a stopgap while tuning
   - Use `timeout_minutes` for agents that need more time

## Automated Flagging

The `agent_stats` SQLite table tracks per-agent metrics:
- `agent_id`: Full agent identifier
- `total_runs`: Number of step completions
- `retries`: Number of retry events
- `last_run_at`: Timestamp of most recent run

Agents with >10% retry rate are automatically flagged by `antfarm agent-stats`.
The stats module (`src/agent-retry-stats.ts`) is called from `completeStep` and
`failStep` in the pipeline engine.
