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

## Debugging High Retry Agents

1. Run `antfarm agent-stats --agent <name>` to confirm retry rate
2. Check recent events: `antfarm logs` and filter for `step.failed` events
3. Review agent output in DB: the failed step's `output` column shows what was produced
4. Common fixes:
   - Simplify the prompt (shorter = more reliable)
   - Add explicit output examples
   - Increase `max_retries` as a stopgap while tuning
   - Use `timeout_minutes` for agents that need more time
