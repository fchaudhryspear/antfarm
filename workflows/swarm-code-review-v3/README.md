# swarm-code-review-v3

Detailed design notes for the 10-agent parallel code review workflow.

## What it is

`swarm-code-review-v3` runs 10 specialized review agents in parallel against a repo, then merges their outputs into one ranked review summary and validates that the consolidate step produced a usable result.

Pipeline:

```text
10 parallel review domains → consolidate → validate-consolidate
```

Domains:
- code quality
- security
- performance
- UX
- backend
- frontend
- DevOps
- documentation
- testing
- product

## Current design

### Dispatch contract
Required runtime context:
- `repo_path`
- `repo_name`

Optional context:
- `scope` (default `full-stack`)
- `focus_areas`
- `review_mode` (`full` or `diff-only`)
- `diff_base` (default `main`)
- `exclude_patterns`
- `url`

### Operating model
- All 10 review agents launch in parallel.
- Each agent is constrained to real source discovery first.
- Each agent is instructed to report only findings grounded in files actually read.
- Consolidation waits on all 10 review steps.
- `validate-consolidate` verifies the consolidate output contract before the run can finish.

## Output contracts

### Review agents
Expected output starts with:

```text
SCORE:
```

### Consolidator
Expected output starts with:

```text
OVERALL_SCORE:
```

### validate-consolidate
Expected output starts with:

```text
STATUS:
```

## Important design updates

### 1. Review consolidate vs fix consolidate schema split
This workflow exposed a real engine bug in runs #396 and #397.

#### Failure mode
`validate-consolidate` rejected valid review consolidate output because schema routing treated review consolidate like a fix/PR consolidate and required `PR_URL`.

#### Root cause
`getAgentSchema()` used substring matching and matched `consolidate` before checking workflow type.

#### Fix
Schema routing now distinguishes:
- `consolidate-review`
- `consolidate-fix`

Rules:
- review workflow consolidate → `consolidate-review`
- fix/implement workflow consolidate → `consolidate-fix`
- bare consolidate defaults to review-safe behavior

#### Outcome
- Run #398 was the first fully clean review swarm run
- Run #400 repeated cleanly end-to-end
- All 10 domains + consolidate + validate-consolidate completed without manual intervention

### 2. Product strategist latency hardening
The product-review step went stale across multiple runs.

#### Root causes
- model was too heavy: `ollama-cloud/qwen3.5:397b-cloud`
- timeout was too loose: 50 minutes
- AGENTS.md was too open-ended for a lightweight product review

#### Fixes applied
- model changed to `ollama-cloud/glm-5.1:cloud`
- timeout reduced from 50 minutes to 20 minutes
- output capped to 7 findings
- AGENTS.md now caps file reads to 15 files
- duplicate instruction block removed

### 3. False-positive guardrails
This workflow previously learned the hard way that build/vendor directories poison review quality.

Global excludes now block common junk paths:
- `_build_artifacts`
- `node_modules`
- `vendor`
- `.venv`
- `__pycache__`
- `dist`
- `build`
- `.next`
- `.git`

## Model layout

Current model allocation:
- code-quality: `ollama-cloud/qwen3.5:397b-cloud`
- security-auditor: `ollama-cloud/devstral-2:123b-cloud`
- performance-engineer: `ollama-cloud/qwen3.5:397b-cloud`
- ux-specialist: `ollama-cloud/kimi-k2.5:cloud`
- backend-architect: `ollama-cloud/kimi-k2.5:cloud`
- frontend-architect: `ollama-cloud/qwen3.5:397b-cloud`
- devops-engineer: `ollama-cloud/qwen3.5:397b-cloud`
- documentation-specialist: `ollama-cloud/qwen3.5:397b-cloud`
- testing-strategist: `ollama-cloud/qwen3.5:397b-cloud`
- product-strategist: `ollama-cloud/glm-5.1:cloud`
- consolidate: `ollama-cloud/deepseek-v3.2:cloud`

## Timing profile

Current notable timeouts:
- most review agents: 50 minutes
- testing-review: 35 minutes
- product-review: 20 minutes
- consolidate: 50 minutes
- validate-consolidate: 5 minutes

This workflow should normally finish well under those ceilings. These are failure cushions, not target durations.

## Validation and regression coverage

Regression tests were added in:
- `test/validate-step-output.test.ts`

Coverage includes:
- review consolidate passes without `PR_URL`
- fix consolidate fails without `PR_URL`
- implement consolidate routes to fix schema
- unknown/bare consolidate defaults safely
- other schema routing still resolves correctly

## Known technical debt

### Substring-based role detection in `agent-cron.ts`
`isSetup` and `isFixer` still rely on substring matching.

This is safe for the current naming convention, but fragile if agent names ever include `fix` or `setup` for non-role reasons.

Preferred future fix:
- add an explicit role/type field in workflow YAML
- stop inferring behavior from agent names

## Recommended usage

### Full review
```bash
node ~/.openclaw/workspace/antfarm/dist/cli/cli.js workflow run swarm-code-review-v3 "Review repo" \
  --repo-path=/absolute/path/to/repo \
  --context repo_name=my-repo
```

### Diff-only review
```bash
node ~/.openclaw/workspace/antfarm/dist/cli/cli.js workflow run swarm-code-review-v3 "Review changed files" \
  --repo-path=/absolute/path/to/repo \
  --context repo_name=my-repo \
  --context review_mode=diff-only \
  --context diff_base=main
```

## Milestones
- **Run #398**: first fully clean end-to-end review swarm completion
- **Run #400**: second clean end-to-end confirmation, proving repeatability
