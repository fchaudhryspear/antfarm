# Phase 5: Model Evaluation Framework

> Approved by Fas on 2026-04-10 15:31 CDT
> Adjustments incorporated from review

## Status
- ✅ **Week 1**: Scoring logic (implemented, built, tested)
- ⏳ **Week 2**: Drift detection + alerting
- ⏳ **Week 3**: Dashboard + threshold tuning

## Approved Adjustments
1. **No auto-swap** → Auto-recommend + alert only. Humans approve model changes.
2. **18/25 threshold** → Starting point. 2-week calibration period, no enforcement.
3. **Kill canary at <15/25** → Approved. Enforced immediately on Band 1 steps. *Note: Disabled during initial calibration; enable after 2 weeks of data.*
4. **No historical backfill** → Start fresh, build data forward.
5. **Build order**: Scoring → Drift detection → Dashboard.
6. **No automated actions** until 2 weeks of calibration data collected.

## Architecture

### Scoring Module
- **File**: `src/model-eval/scorer.ts`
- **5 Dimensions** (0-5 each, 25 max):
  1. Spec Alignment — output matches expected schema
  2. Completeness — no TODOs, placeholders, stubs
  3. Compilation — code compiles / valid syntax
  4. No Hallucination — no phantom fields, services, imports
  5. Integration — cross-module wiring correct
- **Output**: `~/.openclaw/antfarm/logs/model-scores.jsonl`

### Wiring
- Called from `completeStep()` in `step-ops.ts`
- Runs after step marked done, before pipeline advances
- **Non-blocking**: wrapped in try/catch, never prevents step completion
- **Observation-only**: logs scores, no enforcement during calibration

### Thresholds (Starting Points — Will Be Tuned)
| Range | Classification | Action |
|-------|---------------|--------|
| ≥18/25 | PASS | None |
| 15-17/25 | WATCH | Log for drift analysis |
| <15/25 | FAIL | Canary kill (Band 1 only, after calibration) |

### Known Hallucination Patterns (Pre-Seeded)
- `broker_id`, `billing_type`, `cancel_at_period_end` (Run #276)
- `external_sofr_api`, `handle_insights parallelization` (swarm scan)
- Excessive imports (>30), commented-out service calls

## Calibration Plan
- **Start**: 2026-04-10
- **End**: 2026-04-24 (2 weeks)
- **During calibration**: Score every step, log to JSONL, no enforcement
- **After calibration**: Review score distributions, tune thresholds, enable canary kill
