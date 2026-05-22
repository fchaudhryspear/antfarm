# Antfarm Swarm System Blueprint

> **Version:** 0.5.1 | **Updated:** 2026-04-10 | **Author:** Optimus  
> **Purpose:** Complete reference for how the swarm system works end-to-end.  
> Use this to troubleshoot after upgrades, detect missing components, or onboard new agents.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [File System Layout](#2-file-system-layout)
3. [Database Schema](#3-database-schema)
4. [Workflow Lifecycle](#4-workflow-lifecycle)
5. [Cron & Scheduling System](#5-cron--scheduling-system)
6. [Step Execution Flow](#6-step-execution-flow)
7. [Model Routing & Escalation](#7-model-routing--escalation)
8. [Scoring Framework](#8-scoring-framework)
9. [Condition Evaluation](#9-condition-evaluation)
10. [Safety & Validation](#10-safety--validation)
11. [Installed Workflows](#11-installed-workflows)
12. [Background Services](#12-background-services)
13. [Company Lanes](#13-company-lanes)
14. [Troubleshooting Runbook](#14-troubleshooting-runbook)
15. [Health Check Checklist](#15-health-check-checklist)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Fas (Telegram)                        │
│                         │                                │
│                    ┌────▼────┐                           │
│                    │ Optimus │  (Primary Orchestrator)    │
│                    └────┬────┘                           │
│                         │                                │
│              ┌──────────▼──────────┐                     │
│              │  OpenClaw Gateway   │                     │
│              │  (pid on :18789)    │                     │
│              │  ┌───────────────┐  │                     │
│              │  │ Cron Scheduler│  │  ← jobs.json        │
│              │  │ Agent Sessions│  │                     │
│              │  │ LCM Plugin    │  │  ← lcm.db           │
│              │  └───────────────┘  │                     │
│              └──────────┬──────────┘                     │
│                         │                                │
│         ┌───────────────┼───────────────┐                │
│         ▼               ▼               ▼                │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐        │
│  │ Antfarm CLI │ │ Antfarm DB  │ │  Workflows   │        │
│  │ (Node.js)   │ │(antfarm.db) │ │ (YAML+agents)│        │
│  └─────────────┘ └─────────────┘ └─────────────┘        │
│         │                                                │
│    ┌────▼─────────────────────────────────┐              │
│    │        Cloud Model Fleet             │              │
│    │  GLM-5.1 │ Qwen3.5 │ Kimi-K2.5     │              │
│    │  DeepSeek │ Devstral │ MiniMax      │              │
│    │  OpenAI Codex (escalation)           │              │
│    └──────────────────────────────────────┘              │
└─────────────────────────────────────────────────────────┘
```

**Data flow:** Dispatch → DB rows created → Gateway crons fire → Agent sessions spawn → Work done → `step complete` → DB updated → `advancePipeline()` → next steps dispatched → run completed.

---

## 2. File System Layout

### Source Code (editable)
```
~/.openclaw/workspace/antfarm/
├── src/
│   ├── cli/
│   │   ├── cli.ts              # Main CLI entry point (dispatch, status, step ops)
│   │   ├── cron-recovery.ts    # Re-register crons after gateway restart
│   │   └── validate.ts         # Workflow YAML validation
│   ├── installer/
│   │   ├── agent-cron.ts       # Cron job creation & two-phase polling prompts
│   │   ├── agent-provision.ts  # Agent directory setup in ~/.openclaw/agents/
│   │   ├── events.ts           # Event emission (step.done, run.failed, etc.)
│   │   ├── gateway-api.ts      # HTTP/CLI bridge to OpenClaw gateway
│   │   ├── install.ts          # Workflow installation, role policies, timeouts
│   │   ├── run.ts              # runWorkflow() — creates DB rows, dispatches crons
│   │   ├── step-ops.ts         # ⭐ CORE: completeStep(), advancePipeline(), condition eval
│   │   ├── types.ts            # TypeScript interfaces (WorkflowStep, AgentRole, etc.)
│   │   └── workflow-spec.ts    # YAML parser for workflow.yml
│   ├── model-eval/
│   │   └── scorer.ts           # Step scoring (5 dimensions, canary kill)
│   ├── medic/
│   │   ├── medic.ts            # Health check engine
│   │   └── checks.ts           # Individual health checks
│   ├── db.ts                   # SQLite connection (node:sqlite)
│   ├── heartbeat-service.ts    # Agent session liveness tracking
│   ├── validate-step-output.ts # Output schema enforcement (Issue #337)
│   └── validate-consolidate-inputs.ts  # PR input validation (Issue #340)
├── workflows/                  # Workflow definitions (YAML + agent AGENTS.md)
│   ├── smoke-test-v1/
│   ├── swarm-code-review-v3/
│   ├── swarm-code-fix-v1/
│   ├── pipeline-orchestrator/
│   ├── swarm-architecture-v1/
│   ├── swarm-implement-v1/
│   ├── swarm-qa-v1/
│   ├── swarm-release-v1/
│   ├── swarm-requirements-v1/
│   └── swarm-code-review-small-v1/
├── docs/                       # Operational docs
├── tests/                      # Test suite
├── schemas/                    # JSON schemas (structured-findings)
├── scripts/                    # Helper scripts
└── package.json                # v0.5.1
```

### Runtime Data (generated, NOT in source)
```
~/.openclaw/antfarm/
├── antfarm.db                  # ⭐ SQLite: runs, steps, stories, stats
├── medic.db                    # Medic check history
├── logs/
│   ├── workflow.log            # Structured workflow event log
│   └── model-scores.jsonl      # ⭐ Scoring data (append-only)
└── workflows/                  # Installed workflow metadata
    └── <workflow-id>/metadata.json

~/.openclaw/cron/
└── jobs.json                   # ⭐ Gateway cron job definitions (71KB+)

~/.openclaw/agents/             # Agent session state (per-agent dirs)
├── main/
├── ross/
├── simon/
├── atlas/
├── smoke-test-v1_smoke-deployer/
├── swarm-code-review-v3_code-quality/
└── ... (one dir per agent)

~/.openclaw/companies/          # Company context files (Phase 6.1)
├── credologi/context.json
├── flobase/context.json
└── utility-valet/context.json
```

### Key Singleton Files
| File | Purpose | Loss Impact |
|------|---------|-------------|
| `~/.openclaw/antfarm/antfarm.db` | All run/step state | **CRITICAL** — lose all workflow history |
| `~/.openclaw/cron/jobs.json` | Active cron definitions | **HIGH** — all crons stop, need `ensure-crons` |
| `~/.openclaw/antfarm/logs/model-scores.jsonl` | Scoring calibration data | MEDIUM — lose scoring history |
| `~/.openclaw/workspace/antfarm/workflows/*/workflow.yml` | Workflow definitions | **HIGH** — can't dispatch new runs |
| `~/.openclaw/workspace/antfarm/dist/` | Compiled JS | LOW — rebuild with `npm run build` |

---

## 3. Database Schema

**Database:** `~/.openclaw/antfarm/antfarm.db` (SQLite, via `node:sqlite`)

### `runs` table
| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | UUID |
| `workflow_id` | TEXT | e.g., "swarm-code-review-v3" |
| `task` | TEXT | Human-readable task title |
| `status` | TEXT | `running` → `completed` / `failed` / `cancelled` |
| `context` | TEXT | JSON — merged context vars (repo_path, scope, step outputs) |
| `run_number` | INTEGER | Sequential (#368, #369, etc.) |
| `notify_url` | TEXT | Optional webhook for completion |
| `created_at` / `updated_at` | TEXT | ISO timestamps |

### `steps` table
| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | UUID |
| `run_id` | TEXT FK | → runs.id |
| `step_id` | TEXT | From workflow.yml (e.g., "deploy", "smoke-test") |
| `agent_id` | TEXT | Full agent ID (e.g., "smoke-test-v1_smoke-deployer") |
| `step_index` | INTEGER | Execution order |
| `input_template` | TEXT | Resolved input with {{ vars }} replaced |
| `expects` | TEXT | Required output marker (e.g., "SCORE:", "STATUS:") |
| `status` | TEXT | `waiting` → `pending` → `running` → `done`/`failed`/`skipped`/`cancelled` |
| `output` | TEXT | Agent's full output text |
| `retry_count` / `max_retries` | INTEGER | Default 0/2 |
| `abandoned_count` | INTEGER | Times step was abandoned by agent |
| `depends_on` | TEXT | JSON array of step_ids (e.g., `["setup"]`) |
| `condition` | TEXT | Conditional execution (e.g., `"SMOKE_PASS: false"`) |
| `escalated_model` | TEXT | Model after escalation (if retried) |
| `timeout_minutes` | INTEGER | Per-step timeout override |
| `type` | TEXT | `single` or `loop` |
| `loop_config` | TEXT | JSON loop configuration |
| `current_story_id` | TEXT | Active story in loop mode |
| `last_output_at` | TEXT | Commit-based completion tracking |

### `stories` table (loop steps)
| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | UUID |
| `run_id` | TEXT FK | → runs.id |
| `story_id` | TEXT | From STORIES_JSON |
| `status` | TEXT | `pending` → `running` → `done` / `failed` |
| `acceptance_criteria` | TEXT | JSON array |

### `agent_stats` table
| Column | Type | Description |
|--------|------|-------------|
| `agent_id` | TEXT PK | Full agent ID |
| `total_runs` | INTEGER | Lifetime run count |
| `retries` | INTEGER | Lifetime retry count |
| `last_run_at` | TEXT | ISO timestamp |

### `session_heartbeats` table
| Column | Type | Description |
|--------|------|-------------|
| `session_id` | TEXT | OpenClaw session key |
| `step_id` | TEXT | Antfarm step UUID |
| `run_id` | TEXT | Antfarm run UUID |
| `status` | TEXT | `alive` / `dead` |

---

## 4. Workflow Lifecycle

### Phase 1: Dispatch
```
antfarm workflow run <workflow-id> "task title" \
  --repo-path=/path/to/repo \
  --context repo_name=my-project \
  --company flobase
```

1. **Preflight validation** — checks `repo_path` and `repo_name` are non-empty
2. **Company context** — if `--company`, loads `~/.openclaw/companies/<name>/context.json`
3. **Run created** — INSERT into `runs` table with merged context
4. **Steps created** — one row per workflow step in `steps` table
   - First step(s) with no `depends_on` → status `pending`
   - All others → status `waiting`
5. **Crons created** — `setupAgentCrons()` registers per-agent cron jobs in gateway

### Phase 2: Execution (Cron-Driven)
```
Every 60 seconds per agent:
  Cron fires → Two-phase polling prompt → Agent session
```

1. **Phase 1 (Peek):** `step peek <agent-id>` — returns `HAS_WORK` or `NO_WORK`
2. **Phase 2 (Stale recovery):** `step status <agent-id>` — detects/resets stuck steps
3. **Phase 3 (Guard):** Re-check status — prevents double-claiming
4. **Phase 4 (Claim):** `step claim <agent-id>` — returns JSON with `stepId`, `runId`, `input`
5. **Spawn sub-agent** — `sessions_spawn` with work model and full prompt
6. **Agent does work** — reads input, executes task, produces output
7. **Report completion:** `step complete <stepId>` (pipes output via stdin)

### Phase 3: Completion
```
completeStep() → validate → score → merge context → advancePipeline()
```

1. **Empty output guard** — rejects empty output, resets to pending
2. **Marker validation** — output must contain one of: `SCORE:`, `PR_URL:`, `STATUS: done`, `SETUP_OK:`, etc.
3. **Schema validation** — per-role output schema enforcement (Issue #337)
4. **Consolidate validation** — checks all prior outputs present (Issue #340)
5. **Scoring** — `scoreAndPersist()` writes to model-scores.jsonl
6. **Canary kill** — if score < 15/25 on step 0 or 1, kills the run
7. **Context merge** — KEY: value lines merged into run context
8. **advancePipeline()** — finds waiting steps whose dependencies are satisfied → sets to pending

### Phase 4: Run Completion
When all steps are `done`/`skipped`/`failed`:
- If any failed → run status = `failed`
- If all done/skipped → run status = `completed`
- Cron teardown scheduled (removes agent crons for this run)

### Step Status State Machine
```
waiting ──(deps satisfied)──→ pending ──(cron claims)──→ running
                                 │                          │
                                 │                     ┌────┴────┐
                                 │                     │         │
                                 ▼                     ▼         ▼
                              skipped              done       failed
                           (condition              │         │
                            not met)               │    (retry < max?)
                                                   │    │ yes    │ no
                                                   │    ▼        ▼
                                                   │  pending  failed
                                                   │  (escalated model)
                                                   ▼
                                              cancelled
                                           (sibling failed)
```

---

## 5. Cron & Scheduling System

### Gateway Crons (per-agent, in-memory + jobs.json)
| Property | Value |
|----------|-------|
| Store | `~/.openclaw/cron/jobs.json` |
| Default interval | 60 seconds (`DEFAULT_EVERY_MS`) |
| Retry delays | 1s, 3s, 8s (`CRON_RETRY_DELAYS_MS`) |
| Session type | `isolated` (each cron fire = fresh session) |
| Wake mode | `now` (immediate execution) |

### Cron Naming Convention
```
antfarm/<workflow-id>/<agent-id>
```
Example: `antfarm/swarm-code-review-v3/security-auditor`

### Two-Phase Polling Prompt
Each cron fires a lightweight polling prompt (Phase 1) before spawning expensive work (Phase 2):

1. **Phase 1:** Uses cheap polling model (workflow-level default)
   - Runs `step peek` → `HAS_WORK` or `NO_WORK`
   - If NO_WORK → `step status` for stale recovery
   - If still no work → `HEARTBEAT_OK` and stop
2. **Phase 2:** Uses per-agent work model
   - `step claim` → gets resolved input
   - `sessions_spawn` with full work prompt

### macOS launchd Services
| Service | Schedule | Purpose |
|---------|----------|---------|
| `ai.openclaw.gateway` | Always on | Gateway daemon |
| `ai.openclaw.gateway.clean` | Always on | Gateway cleanup |
| `ai.openclaw.antfarm-cron-recovery` | Periodic | Re-register crons after restart |
| `ai.openclaw.antfarm-zombie-cleanup` | Nightly 2 AM | Kill runs stuck > 24h |
| `ai.openclaw.antfarm-dashboard` | Always on | Web dashboard (:3333) |
| `ai.openclaw.check-tracker` | Every 15 min | Open items tracker |
| `ai.openclaw.daily-summary` | 7 AM | Daily email summary |
| `ai.openclaw.project-dashboard` | 7 AM | Project status dashboard |
| `ai.openclaw.executive-digest` | 7 AM | Exception-based daily digest |
| `ai.openclaw.brand-monitor` | Periodic | Brand/social monitoring |

### System Crontab (3 jobs)
```crontab
PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin
*/15 * * * * medic --once >> medic.log 2>&1
0 8 * * *   cost-real daily >> cost-real.log 2>&1
0 0 * * *   backup.sh >> backup.log 2>&1
```

---

## 6. Step Execution Flow

### Valid Completion Markers
An agent's output MUST contain at least one of:
```
SCORE:          — Review agents (numeric score)
PR_URL:         — Consolidate agent (GitHub PR link)
STATUS: done    — Generic completion
STATUS: complete
STATUS: partial
STATUS: skipped
SETUP_OK:       — Setup agent success
SETUP_FAIL:     — Setup agent failure
```

Missing markers → output rejected → step reset to `pending` → retry.

### Output Schema Validation (Issue #337)
Per-role required fields:
- **Review agents:** `SCORE:`, `FINDINGS:`
- **Fix agents:** `STATUS:`
- **Setup agent:** `SETUP_OK:` or `SETUP_FAIL:`
- **Consolidate:** Exempt (own validation)

Failed schema → auto-retry with model escalation.

### Consolidate-PR Input Validation (Issue #340)
Before consolidate creates a PR:
- Checks all critical domain outputs are present
- Missing critical domains → run fails
- Missing non-critical domains → warning appended, PR proceeds

### Stale Session Detection
```
STALE_SESSION_THRESHOLD_MS = 3 minutes  (no output = stale)
ABANDONED_THRESHOLD_MS     = max_role_timeout + 5 minutes
MAX_ABANDON_RESETS         = 5
```

If a running step goes idle > 3 min → marked stale → reset to pending on next cron tick.
If abandoned > 5 times → step fails → run fails.

---

## 7. Model Routing & Escalation

### Model Specialization Map
| Model | Best For | Used By |
|-------|----------|---------|
| `glm-5.1:cloud` | Business logic, decisions, gates | pipeline-controller, gate-keeper, api-designer |
| `qwen3.5:397b-cloud` | Large context, docs, review | Most code-review-v3 agents |
| `kimi-k2.6:cloud` | Reasoning, UX, frontend | ux-specialist, backend-architect |
| `qwen3-coder-next:cloud` | Fast coding, scaffolding | fix-code-quality, fix-tests, regression-checker |
| `qwen3-coder:480b-cloud` | Heavy coding, complex logic | fix-frontend |
| `deepseek-v3.2:cloud` | General analysis, compilation | consolidate |
| `devstral-2:123b-cloud` | Security, infrastructure | security-auditor, fix-security, devops-architect |
| `minimax-m2.7:cloud` | Meta/synthesis | fix-performance, consolidate-pr, post-review, smoke-test agents |

### Escalation Chain (Two-Tier)
```
Tier 1: Ollama Cloud → kimi-k2.6
  qwen3.5:397b  → kimi-k2.6
  deepseek-v3.2  → kimi-k2.6
  devstral-2     → kimi-k2.6
  minimax-m2.7   → kimi-k2.6
  qwen3-coder-next → kimi-k2.6
  glm-5.1        → kimi-k2.6

Tier 2: kimi-k2.6 → OpenAI Codex chain
  kimi-k2.6      → gpt-5.4-mini
  gpt-5.4-mini   → gpt-5.1
  gpt-5.1        → gpt-5.1-codex-max
  gpt-5.1-codex-max → gpt-5.2
  gpt-5.2        → gpt-5.4

Terminal (no further escalation):
  openai-codex/gpt-5.4
```

Escalation triggers:
- Output schema validation failure
- Empty output rejection
- Abandoned step reset

---

## 8. Scoring Framework

### Location
`~/.openclaw/antfarm/logs/model-scores.jsonl` (append-only)

### Dimensions (0-5 each, max 25)
| Dimension | What It Measures |
|-----------|------------------|
| `specAlignment` | Output matches expected schema/format |
| `completeness` | All required files/sections present |
| `compilation` | Code compiles / valid syntax |
| `noHallucination` | No phantom fields, functions, or references |
| `integration` | Cross-module wiring correct |

### Thresholds
| Threshold | Value | Action |
|-----------|-------|--------|
| Pass | ≥ 15/25 | Normal completion |
| Fail (canary kill) | < 15/25 on step 0-1 | Kill entire run |
| Calibration mode | Always `true` | Observation-only (no enforcement yet) |

### Score Entry Format
```json
{
  "timestamp": "2026-04-10T22:00:56.992Z",
  "runId": "50c25fb2-...",
  "workflowId": "smoke-test-v1",
  "stepId": "deploy",
  "agentId": "smoke-test-v1_smoke-deployer",
  "model": "openai-codex/gpt-5.4-mini",
  "role": "coding",
  "scores": { "specAlignment": 3, "completeness": 5, "compilation": 3, "noHallucination": 5, "integration": 3 },
  "total": 19,
  "pass": true,
  "calibrationMode": true,
  "flags": []
}
```

---

## 9. Condition Evaluation

### How Conditions Work
Workflow steps can have `condition: "KEY: value"` in workflow.yml.

Example from smoke-test-v1:
```yaml
- id: revert
  condition: "SMOKE_PASS: false"
  depends_on: [smoke-test]
```

**Evaluation:** When `advancePipeline()` promotes a waiting step to pending, it checks:
1. Parse condition → extract KEY and expected value
2. Look up KEY in run context (merged from prior step outputs)
3. If actual value matches → step proceeds normally
4. If actual value doesn't match → step marked `skipped`

**Prefix matching:** `actualValue === expected || actualValue.startsWith(expected + ' ')`
This handles outputs like `SMOKE_PASS: false FAILED_TESTS: 3 REASON:...`

### Known Edge Case (Fixed)
Condition evaluation happens in `advancePipeline()`, NOT in the cron's claim flow. If the cron claims a step before advancePipeline evaluates the condition, the step runs despite the unmet condition. Fix: condition evaluation was added to advancePipeline() in Phase 1 engine fix (Run #366).

---

## 10. Safety & Validation

### Pre-Flight (dispatch time)
- Required context vars must be non-empty (`repo_path`, `repo_name`)
- Gateway deferred restart check (blocks dispatch if restart pending)
- Workflow YAML validation (`antfarm validate`)

### Cross-Project Contamination Guard
Three layers:
1. **Setup agent (v2.1):** Validates repo_path is git repo, no SOUL.md/USER.md leak files
2. **All 10 fixer agents:** `git remote -v` confirms repo matches `{{ repo_name }}`
3. **Consolidate-PR agent:** Cross-commit check — all files in fix branch exist in target repo

### Session Timeout Hook
Every spawned agent session registers an emergency EXIT trap:
```bash
trap "node antfarm step fail <stepId> 'Session timeout'" EXIT
```
If the session dies without calling `step complete`, the trap auto-fails the step.

### Zombie Cleanup
- **launchd:** `ai.openclaw.antfarm-zombie-cleanup` runs nightly at 2 AM
- **Script:** `antfarm-zombie-cleanup.sh` kills runs in `running` state > 24h
- **Sibling cancellation:** When a step fails, `cancelAllSiblingSteps()` cancels all running/pending siblings

---

## 11. Installed Workflows

### Production Workflows

| Workflow | Agents | Pattern | Primary Model |
|----------|--------|---------|---------------|
| `swarm-code-review-v3` | 11 (10 review + consolidate) | Parallel fan-out | qwen3.5:397b |
| `swarm-code-fix-v1` | 13 (setup + 10 fix + consolidate + post-review) | Setup → parallel fix → merge | Mixed |
| `pipeline-orchestrator` | 4 (assessor, controller, gate-keeper, reporter) | Sequential pipeline | glm-5.1 |

### Utility Workflows

| Workflow | Agents | Pattern | Primary Model |
|----------|--------|---------|---------------|
| `smoke-test-v1` | 3 (deploy → test → conditional revert) | Sequential + conditional | minimax-m2.7 |
| `smoke-test-s3-v1` | 3 | S3 variant of smoke test | minimax-m2.7 |

### Sub-Swarms (dispatched by pipeline-orchestrator)

| Workflow | Agents | Purpose |
|----------|--------|---------|
| `swarm-requirements-v1` | ~5 | Requirements gathering + PRD compilation |
| `swarm-architecture-v1` | ~5 | Architecture design + API contracts |
| `swarm-implement-v1` | ~5 | Code implementation |
| `swarm-qa-v1` | ~5 | Quality assurance + regression testing |
| `swarm-release-v1` | ~3 | Release packaging |
| `swarm-code-review-small-v1` | ~5 | Lightweight review variant |

### swarm-code-review-v3 Agent Model Map
| Agent | Model | Role |
|-------|-------|------|
| code-quality | qwen3.5:397b | review |
| security-auditor | devstral-2:123b | security scanning |
| performance-engineer | qwen3.5:397b | review |
| ux-specialist | kimi-k2.6 | UX analysis |
| backend-architect | kimi-k2.6 | architecture review |
| frontend-architect | qwen3.5:397b | review |
| devops-engineer | qwen3.5:397b | review |
| documentation-specialist | qwen3.5:397b | review |
| testing-strategist | qwen3.5:397b | review |
| product-strategist | qwen3.5:397b | review |
| consolidate | deepseek-v3.2 | merge all reports |

### swarm-code-fix-v1 Agent Model Map
| Agent | Model | Role |
|-------|-------|------|
| setup | qwen3-coder-next | pre-flight validation |
| fix-code-quality | qwen3-coder-next | coding |
| fix-security | devstral-2:123b | security fixes |
| fix-performance | minimax-m2.7 | perf optimization |
| fix-ux | kimi-k2.6 | UX fixes |
| fix-backend | qwen3-coder:480b | heavy backend coding |
| fix-frontend | kimi-k2.6 | frontend fixes |
| fix-devops | qwen3-coder-next | infra/devops |
| fix-docs | qwen3.5:397b | documentation |
| fix-tests | qwen3-coder-next | test writing |
| fix-product | qwen3.5:397b | product improvements |
| consolidate-pr | minimax-m2.7 | merge + PR |
| post-review | minimax-m2.7 | verify merged PR |

---

## 12. Background Services

### Gateway Daemon
- **Plist:** `~/Library/LaunchAgents/ai.openclaw.gateway.plist`
- **Process:** `openclaw-gateway` on `127.0.0.1:18789`
- **Start:** `openclaw gateway start` / `launchctl bootstrap gui/$UID <plist>`
- **Stop:** `openclaw gateway stop` / `launchctl bootout gui/$UID/ai.openclaw.gateway`
- **Restart:** `openclaw gateway restart`
- **Logs:** `/tmp/openclaw/openclaw-YYYY-MM-DD.log`

### Antfarm Cron Recovery
- **Plist:** `~/Library/LaunchAgents/ai.openclaw.antfarm-cron-recovery.plist`
- **Purpose:** Re-register crons for active runs after gateway restart
- **Script:** `cron-recovery-hook.sh` → `antfarm cron-recovery`

### Health Monitor (Medic)
- **Crontab:** Every 15 min
- **Script:** `~/.openclaw/bin/medic --once`
- **Log:** `~/.openclaw/workspace/health/medic.log`
- **Checks:** Gateway up, sessions healthy, cron running, key ages, costs

---

## 13. Company Lanes

### How It Works
```bash
antfarm workflow run swarm-code-review-v3 "Review Flobase" --company flobase
```

The `--company` flag:
1. Loads `~/.openclaw/companies/<name>/context.json`
2. Sets `repo_path` from company config
3. Sets `repo_name` from `githubRepo` field
4. Sets `aws_profile` and `aws_region`
5. Merges all fields into run context

### Company Context File Format
```json
{
  "name": "Flobase",
  "email": "faisal@flobase.ai",
  "repoPath": "/Users/faisalshomemacmini/dev/flobase-capital-platform",
  "githubRepo": "flobase-capital-platform",
  "awsProfile": "atlas",
  "awsRegion": "us-east-1"
}
```

### Configured Companies
| Company | Repo | AWS Profile |
|---------|------|-------------|
| credologi | — | — |
| flobase | flobase-capital-platform | atlas |
| utility-valet | — | — |

---

## 14. Troubleshooting Runbook

### 🔴 "Steps stuck in pending forever"
1. Check if agent crons exist: `openclaw cron list --json | grep <agent-id>`
2. If no crons: `antfarm workflow ensure-crons <workflow-id>`
3. If crons exist but not firing: check gateway logs for cron errors
4. Check gateway is running: `openclaw gateway status`

### 🔴 "Step keeps retrying"
1. Check output markers: `node antfarm step peek <agent-id>`
2. Common cause: output missing `SCORE:` or `STATUS:` marker
3. Check model-scores.jsonl for low scores triggering canary kill
4. Check escalation: `SELECT escalated_model FROM steps WHERE ...`

### 🔴 "Run stuck in running with all steps done"
1. Known bug: terminal step completion race
2. Manual fix: `UPDATE runs SET status = 'completed' WHERE id = '<run-id>'`
3. Then: `antfarm workflow status "<task>"`

### 🔴 "Crons disappeared after gateway restart"
1. Run: `antfarm cron-recovery`
2. Verify: `openclaw cron list --json | grep antfarm`
3. If still missing: `antfarm workflow ensure-crons <workflow-id>`

### 🔴 "Agent running wrong model"
1. Check workflow.yml for agent model assignment
2. Check if escalated: `SELECT escalated_model FROM steps WHERE agent_id = '...'`
3. Override: edit workflow.yml → rebuild (`npm run build`)

### 🔴 "Cross-project contamination"
1. Check `git remote -v` in agent output
2. Verify setup step ran pre-flight validation
3. Check consolidate-pr cross-commit verification

### 🔴 "Condition not evaluated (revert runs when it shouldn't)"
1. Condition evaluation happens in `advancePipeline()`, not cron claim
2. Check run context for the condition key: query `SELECT context FROM runs WHERE id = '...'`
3. If key exists with wrong value: prior step may have produced unexpected output

### 🟡 "ensure-crons times out / no output"
1. The command runs but takes 12+ seconds per agent (gateway API calls)
2. With 10+ agents, can take > 2 minutes total
3. Check gateway logs for "cron: job created" entries to verify it worked
4. Don't rely on CLI stdout — check `~/.openclaw/cron/jobs.json` directly

### 🔴 "Scoring baseline polluted with infrastructure failures"
1. **Root cause:** Workflow dispatched without `--company` context
2. Agents have no repo_path/repo_name → fail on schema validation → scores reflect infra failure, not model quality
3. **Fix:** ALWAYS dispatch production workflows with `--company <name>`
4. **Rule:** `ensure-crons` creates polling crons but does NOT dispatch runs. A bare `ensure-crons` followed by no dispatch = crons burning tokens polling empty queues.
5. **Correct sequence:** Dispatch run WITH company context → crons auto-created → agents have work + context

### 🟡 "model-scores.jsonl shows 'unknown' model"
1. Agent model wasn't propagated to the step metadata
2. Scores are still valid — model field is informational only during calibration
3. Fix: check `escalated_model` field and cron payload for model assignment

---

## 15. Health Check Checklist

Run after any OpenClaw upgrade, gateway restart, or system reboot:

```bash
# 1. Gateway running?
openclaw gateway status

# 2. Antfarm DB intact?
node -e "const db = require('node:sqlite'); const d = new db.DatabaseSync('$HOME/.openclaw/antfarm/antfarm.db'); console.log('runs:', d.prepare('SELECT count(*) as c FROM runs').get().c, 'steps:', d.prepare('SELECT count(*) as c FROM steps').get().c)"

# 3. Crons registered?
openclaw cron list --json 2>&1 | grep -c "antfarm/"

# 4. LCM compaction working?
grep "Compaction summarization model" /tmp/openclaw/openclaw-$(date +%Y-%m-%d).log | tail -1

# 5. Scoring log exists?
wc -l ~/.openclaw/antfarm/logs/model-scores.jsonl

# 6. Launchd services healthy?
launchctl list | grep ai.openclaw | awk '{printf "%s exit=%s\n", $3, $2}'

# 7. Crontab intact?
crontab -l | grep -c "medic\|cost-real\|backup"
# Expected: 3

# 8. Active runs not zombie?
node ~/.openclaw/workspace/antfarm/dist/cli/cli.js workflow status 2>&1 | grep "running"

# 9. Company contexts present?
ls ~/.openclaw/companies/*/context.json

# 10. Workflow YAMLs present?
ls ~/.openclaw/workspace/antfarm/workflows/*/workflow.yml | wc -l
# Expected: 10
```

### Quick Recovery Commands
```bash
# Re-register all crons after gateway restart
antfarm cron-recovery

# Rebuild after source changes
cd ~/.openclaw/workspace/antfarm && npm run build

# Kill zombie run
node ~/.openclaw/workspace/antfarm/dist/cli/cli.js workflow cancel <run-id>

# Force complete stuck run
node -e "const db = require('node:sqlite'); const d = new db.DatabaseSync('$HOME/.openclaw/antfarm/antfarm.db'); d.prepare(\"UPDATE runs SET status = 'completed' WHERE id = '<run-id>'\").run()"

# Restart gateway cleanly
openclaw gateway stop && sleep 2 && openclaw gateway start

# Check for stale steps
node -e "const db = require('node:sqlite'); const d = new db.DatabaseSync('$HOME/.openclaw/antfarm/antfarm.db'); const rows = d.prepare(\"SELECT step_id, agent_id, status, updated_at FROM steps WHERE status = 'running' ORDER BY updated_at ASC LIMIT 10\").all(); console.table(rows)"
```

---

*This blueprint is the source of truth for how Antfarm works. Update it when adding new workflows, changing models, or modifying the engine.*
