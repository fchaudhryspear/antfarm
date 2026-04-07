#!/bin/bash
# Antfarm Cron Recovery Hook
# Triggered by WatchPaths on gateway.log changes.
# Waits for gateway to be healthy, then runs cron-recovery for all active runs.

LOG="/Users/faisalshomemacmini/.openclaw/logs/antfarm-cron-recovery.log"
LOCKFILE="/tmp/antfarm-cron-recovery.lock"
NODE="/opt/homebrew/opt/node/bin/node"
CLI="/Users/faisalshomemacmini/.openclaw/workspace/antfarm/dist/cli/cli.js"

# Prevent concurrent runs
if [ -f "$LOCKFILE" ]; then
  # Check if lock is stale (> 10 min old — accounts for 60s health wait + cron registration)
  if [ "$(find "$LOCKFILE" -mmin +10 2>/dev/null)" ]; then
    rm -f "$LOCKFILE"
  else
    exit 0
  fi
fi
touch "$LOCKFILE"
trap 'rm -f "$LOCKFILE"' EXIT

echo "$(date '+%Y-%m-%d %H:%M:%S') [cron-recovery] Gateway log changed, checking for active runs..." >> "$LOG"

# Wait for gateway to be fully up (health check)
RETRIES=0
MAX_RETRIES=12
while [ $RETRIES -lt $MAX_RETRIES ]; do
  if curl -s --max-time 2 http://127.0.0.1:18789/health >/dev/null 2>&1; then
    break
  fi
  RETRIES=$((RETRIES + 1))
  sleep 5
done

if [ $RETRIES -eq $MAX_RETRIES ]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') [cron-recovery] Gateway not healthy after 60s, aborting" >> "$LOG"
  exit 1
fi

# Stabilization delay: gateway /health may pass before cron subsystem is fully initialized.
# Without this, cron registration can hit a brief window where the gateway accepts HTTP
# but the cron tool isn't ready, causing silent failures.
sleep 3
echo "$(date '+%Y-%m-%d %H:%M:%S') [cron-recovery] Gateway healthy, stabilization wait complete" >> "$LOG"

# Check if there are any active runs
ACTIVE_RUNS=$(sqlite3 ~/.openclaw/antfarm/antfarm.db "SELECT COUNT(*) FROM runs WHERE status='running';" 2>/dev/null)
if [ "$ACTIVE_RUNS" = "0" ] || [ -z "$ACTIVE_RUNS" ]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') [cron-recovery] No active runs, skipping" >> "$LOG"
  exit 0
fi

echo "$(date '+%Y-%m-%d %H:%M:%S') [cron-recovery] Found $ACTIVE_RUNS active run(s), recovering crons..." >> "$LOG"

# Run cron-recovery
$NODE "$CLI" cron-recovery >> "$LOG" 2>&1
EXIT_CODE=$?

echo "$(date '+%Y-%m-%d %H:%M:%S') [cron-recovery] Done (exit=$EXIT_CODE)" >> "$LOG"
exit $EXIT_CODE
