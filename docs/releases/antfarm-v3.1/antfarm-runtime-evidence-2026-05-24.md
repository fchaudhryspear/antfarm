# Antfarm Runtime State Evidence — 2026-05-24

This artifact captures the live-system observations cited in RFC-antfarm-v3.1.md v0.13 §4 prereq #6 and §13 Q11. It complements `antfarm-schema-snapshot-2026-05-24.sql` (which proves schema). This file proves runtime *state*.

All observations captured on host `Mac-mini` (faisalshomemacmini) on 2026-05-24 / 2026-05-25 during the v3.1 RFC verification pass. Gateway process: PID 39084.

---

## Observation 1: factory_* tables are at zero rows

**Command:**
```bash
echo "table_name|row_count" > ~/Desktop/antfarm-rowcounts.txt
sqlite3 /Users/faisalshomemacmini/.openclaw/antfarm/antfarm.db \
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;" | \
  while read t; do
    cnt=$(sqlite3 /Users/faisalshomemacmini/.openclaw/antfarm/antfarm.db "SELECT COUNT(*) FROM \"$t\";")
    echo "$t|$cnt" >> ~/Desktop/antfarm-rowcounts.txt
  done
```

**Output:**
```
table_name|row_count
agent_stats|67
cron_idle_ticks|34
factory_agent_runs|0
factory_artifacts|0
factory_context_packs|0
factory_events|0
factory_gates|0
factory_items|0
factory_runs|0
medic_checks|500
runs|367
session_heartbeats|14
steps|3227
stories|101
```

**Finding:** All seven `factory_*` tables (the v3 execution ledger) contain zero rows. v2 tables retain historical data.

---

## Observation 2: v2 ledger tables have no writes since 2026-05-19

**Command:**
```bash
sqlite3 /Users/faisalshomemacmini/.openclaw/antfarm/antfarm.db <<'EOF'
SELECT 'runs' AS t, MAX(created_at) AS latest FROM runs
UNION ALL SELECT 'steps', MAX(created_at) FROM steps
UNION ALL SELECT 'stories', MAX(created_at) FROM stories
UNION ALL SELECT 'agent_stats', MAX(updated_at) FROM agent_stats;
EOF
```

**Output:**
```
runs|2026-05-19T13:45:09.764Z
steps|2026-05-19T13:45:09.764Z
stories|2026-03-31T16:50:24.106Z
agent_stats|2026-05-19 13:45:09
```

**Finding:** The latest write to `runs`, `steps`, and `agent_stats` all converge on 2026-05-19T13:45:09.764Z — a coordinated stop. `stories` froze even earlier (2026-03-31). No execution activity has hit antfarm.db in approximately one week before the capture.

---

## Observation 3: Activity counts since the May 19 cutoff confirm dormancy

**Command:**
```bash
sqlite3 /Users/faisalshomemacmini/.openclaw/antfarm/antfarm.db <<'EOF'
SELECT 'runs since May 19' AS what, COUNT(*) FROM runs WHERE created_at > '2026-05-19T13:45:09.764Z'
UNION ALL SELECT 'medic_checks since May 19', COUNT(*) FROM medic_checks WHERE checked_at > '2026-05-19T13:45:09.764Z'
UNION ALL SELECT 'session_heartbeats since May 19', COUNT(*) FROM session_heartbeats WHERE created_at > '2026-05-19T13:45:09.764Z'
UNION ALL SELECT 'cron_idle_ticks since May 19', COUNT(*) FROM cron_idle_ticks WHERE updated_at > '2026-05-19T13:45:09.764Z';
EOF
```

**Output:**
```
runs since May 19|0
medic_checks since May 19|0
session_heartbeats since May 19|0
cron_idle_ticks since May 19|6
```

**Finding:** Zero new runs, zero health checks, zero session heartbeats since May 19. Only `cron_idle_ticks` has activity (6 updates) — these are scheduler liveness pings that update in place per agent, not new execution events. The scheduler process is alive but not scheduling actual work into antfarm.db.

---

## Observation 4: Gateway file handles point to other databases, not antfarm.db

**Command:**
```bash
lsof -p 39084 2>/dev/null | grep -Ei "\.db|\.sqlite"
```

**Output (relevant rows):**
```
node 39084 ... /Users/faisalshomemacmini/.openclaw/tasks/runs.sqlite          (20.4 MB, active)
node 39084 ... /Users/faisalshomemacmini/.openclaw/tasks/runs.sqlite-wal      (140 KB, active WAL)
node 39084 ... /Users/faisalshomemacmini/.openclaw/tasks/runs.sqlite-shm
node 39084 ... /Users/faisalshomemacmini/.openclaw/lcm.db                     (2.31 GB)
node 39084 ... /Users/faisalshomemacmini/.openclaw/lcm.db-wal                 (5.91 MB, active WAL)
node 39084 ... /Users/faisalshomemacmini/.openclaw/lcm.db-shm
node 39084 ... /Users/faisalshomemacmini/.openclaw/flows/registry.sqlite      (5.39 MB)
node 39084 ... /Users/faisalshomemacmini/.openclaw/flows/registry.sqlite-shm
node 39084 ... /Users/faisalshomemacmini/.openclaw/flows/registry.sqlite-wal
```

**Finding:** Gateway PID 39084 has no file handles on `/Users/faisalshomemacmini/.openclaw/antfarm/antfarm.db`. The gateway holds handles on `lcm.db` (conversation memory), `tasks/runs.sqlite` (task delivery), and `flows/registry.sqlite` (workflow registry) — but not on antfarm.db. Whatever process would write to antfarm.db is not currently running and not connected to the gateway.

---

## Observation 5: No antfarm log activity in the last 7 days

**Command:**
```bash
log show --predicate 'process == "node" AND eventMessage CONTAINS "antfarm"' --last 7d --info 2>&1 | tail -50
```

**Output:** Empty (no matching log entries). The query returned no rows.

**Finding:** macOS unified logging across all node processes filtered for "antfarm" returned zero entries in the prior 7 days. If antfarm were running — even logging startup, errors, or heartbeats — entries would appear. Absence is consistent with the runtime not having executed in that window.

---

## Observation 6: Only antfarm-related LaunchAgent is the zombie cleanup job

**Command:**
```bash
launchctl list | grep -iE "antfarm|factory|swarm"
```

**Output:**
```
- 0 ai.openclaw.antfarm-zombie-cleanup
```

**Finding:** The only LaunchAgent referencing antfarm is `ai.openclaw.antfarm-zombie-cleanup`. This is a cleanup job, not a runtime service. There is no `ai.openclaw.antfarm.plist` or equivalent that would start the antfarm execution layer as a persistent service. If antfarm runtime exists, it is started by something other than LaunchAgent — or is not currently being started at all.

---

## Observation 7: Gateway health is OK

**Command:**
```bash
openclaw gateway health 2>&1
```

**Output:**
```
🦞 OpenClaw 2026.5.22 (a374c3a)
   I'm the middleware between your ambition and your attention span.

Gateway Health
OK (5416ms)
```

**Finding:** The gateway itself is running and healthy. The dormancy is specific to the antfarm execution layer; the surrounding OpenClaw infrastructure (gateway, task delivery, conversation memory) is operational.

---

## Observation 8: Multiple antfarm.db candidates; only one has real data

**Command:**
```bash
find ~ -maxdepth 5 -name "antfarm*.db" -o -name "*.sqlite*" -path "*antfarm*" 2>/dev/null
ls -la <each path found>
```

**Output:**
```
/Users/faisalshomemacmini/.openclaw_backup/antfarm/antfarm.db        49152 bytes  Mar 14 08:28
/Users/faisalshomemacmini/.openclaw/antfarm.db                            0 bytes  Mar 29 22:02
/Users/faisalshomemacmini/.openclaw/antfarm/antfarm.db             14946304 bytes  May 24 02:00  ← LIVE
/Users/faisalshomemacmini/.openclaw/workspace/antfarm/antfarm.db          0 bytes  Mar 18 14:55
/Users/faisalshomemacmini/.openclaw/workspace/antfarm/db.sqlite3          0 bytes  Apr 4 09:54
/Users/faisalshomemacmini/.openclaw/workspace/antfarm/dist/antfarm.db     0 bytes  Apr 2 05:51
/Users/faisalshomemacmini/.openclaw/workspace/antfarm/dist/db.sqlite3     0 bytes  Apr 4 09:54
```

**Finding:** Seven candidate antfarm.db paths exist; only `/Users/faisalshomemacmini/.openclaw/antfarm/antfarm.db` (14.9 MB, last modified 2026-05-24 02:00) contains real data. The others are either zero-byte stubs (workspace/dist artifacts) or a small historical backup (49 KB from March). This confirms the live antfarm.db path used in §4 prereq #2 and §5.2.

---

## Summary

| Observation | Signal | Implication |
|---|---|---|
| #1 factory_* row counts | All 0 | v3 execution path never used in production |
| #2 v2 max timestamps | All ≤ 2026-05-19 13:45:09 | v2 execution paused or moved elsewhere |
| #3 post-May-19 counts | 0 for runs/medic/heartbeats, 6 cron_idle | Scheduler alive, execution dormant |
| #4 Gateway file handles | No antfarm.db | Gateway not connected to antfarm runtime |
| #5 Log search | Empty for last 7 days | Runtime not emitting any logs |
| #6 LaunchAgent inventory | Only cleanup job | No persistent runtime service registered |
| #7 Gateway health | OK | Surrounding infrastructure is fine |
| #8 DB path candidates | One live, six stubs/backup | Live antfarm.db location confirmed |

**Conclusion:** Antfarm execution runtime is dormant as of 2026-05-24. The schema landed cleanly via PR #11; the runtime that would write to that schema is not running. This is consistent with v3.0's honest closure narrative ("schema landed and CI-tested") and is the basis for §4 prereq #6 (runtime activation gate) and the Linear tracking issue ADP-404.

This artifact is referenced by:

- `RFC-antfarm-v3.1.md` v0.13 §4 prereq #6
- `RFC-antfarm-v3.1.md` v0.13 §13 Q11
- Linear issue ADP-404 "Activate Antfarm execution runtime"

---

**Artifact metadata:**
- Generated: 2026-05-24 / 2026-05-25 during v3.1 RFC verification pass
- Host: `Mac-mini` (faisalshomemacmini)
- Gateway PID at capture: 39084
- Companion artifact: `antfarm-schema-snapshot-2026-05-24.sql` (proves schema; this file proves state)
