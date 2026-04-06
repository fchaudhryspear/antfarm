# ADR-005: Cron Model Override Policy

## Status
Proposed

## Context
On 2026-04-05, the gateway logs showed repeated warnings: `payload.model 'ollama-cloud/deepseek-v3.2:cloud' not allowed, falling back to agent defaults`. Investigation revealed the cron subsystem maintains a separate model allowlist from the model catalog — a model can be "available" in the catalog but "not allowed" for cron payload overrides. This caused Antfarm workflow steps to silently fall back to agent defaults instead of using their intended models.

## Decision
**Remove `payload.model` from cron job definitions; let agents use their configured defaults.**

Rationale for this choice over explicit allowlisting:
1. **Simpler config surface:** No additional `cron.allowedModelPatterns` or `cron.allowAllCatalogModels` settings to maintain
2. **Single source of truth:** Agent `model` config in `agents.yaml` becomes the canonical model assignment
3. **Workflow clarity:** Antfarm workflow definitions specify agent roles, not model specifics — model routing is an agent-level concern
4. **Easier upgrades:** Changing models means updating agent config, not hunting through cron job payloads

Implementation:
1. Antfarm workflow installer stops injecting `model` into cron payloads
2. Each agent's `model` field in `~/.openclaw/agents/<id>/agent/agent.yaml` determines runtime model
3. Existing cron jobs with `payload.model` are migrated: remove the field, verify agent defaults are correct

## Consequences

### Positive
- No cron model warnings — agents use their configured model
- Clear separation: workflows define *what*, agents define *how*
- Model changes are centralized in agent config
- Reduces cron payload complexity

### Negative
- Less flexibility: can't override model per-cron-job without changing agent config
- Migration required for existing cron jobs with `payload.model`
- Multi-model workflows need multiple agents instead of one agent with model overrides

## Acceptance Criteria
- [ ] No `payload.model 'X' not allowed` warnings in gateway logs
- [ ] Cron jobs execute with their agent's configured model
- [ ] Antfarm workflow installer does not inject `model` into cron payloads
- [ ] Existing Antfarm workflows (`swarm-code-fix-v1`, etc.) run without model warnings after migration
