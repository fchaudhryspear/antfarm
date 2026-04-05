#!/bin/bash
# antfarm-zombie-cleanup.sh
# Finds and cancels workflow runs stuck in "running" state for > 24 hours.
# Usage: ./antfarm-zombie-cleanup.sh [--dry-run] [--hours=24]

HOURS=${HOURS:-24}
DRY_RUN=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run) DRY_RUN=1; shift ;;
    --hours=*) HOURS="${1#*=}"; shift ;;
    *) shift ;;
  esac
done

ANTFARM="node /Users/faisalshomemacmini/.openclaw/workspace/antfarm/dist/cli/cli.js"
LOG="/Users/faisalshomemacmini/.openclaw/workspace/antfarm/logs/antfarm-cleanup.log"
mkdir -p "$(dirname "$LOG")"

echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] Scanning for runs stuck > ${HOURS}h (dry-run=$DRY_RUN)" >> "$LOG"

# Get all running runs
RUNS=$($ANTFARM workflow runs 2>/dev/null | grep "running" || true)

if [ -z "$RUNS" ]; then
  echo "No stuck runs found."
  echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] No stuck runs found." >> "$LOG"
  exit 0
fi

echo "$RUNS" | while IFS= read -r line; do
  # Parse: [running] RUN#NNN  RUNID  WORKFLOW  TASK...
  RUN_ID=$(echo "$line" | awk '{print $NF}')
  WORKFLOW=$(echo "$line" | awk '{print $NF-2}')
  TASK=$(echo "$line" | sed 's/.*\(running\).*//' | sed 's/^[^ ]* [^ ]* [^ ]* //')
  
  if [[ "$RUN_ID" =~ ^[a-f0-9]{8}- ]]; then
    # Check age — look up in the DB or use workflow status
    STATUS_OUTPUT=$($ANTFARM workflow status "$RUN_ID" 2>/dev/null || true)
    UPDATED=$(echo "$STATUS_OUTPUT" | grep "Updated:" | sed 's/.*Updated: //')
    
    if [ -n "$UPDATED" ]; then
      UPDATED_EPOCH=$(date -j -f "%Y-%m-%dT%H:%M:%S" "$UPDATED" +%s 2>/dev/null || date -d "$UPDATED" +%s 2>/dev/null || echo "0")
      NOW_EPOCH=$(date +%s)
      AGE_SECS=$((NOW_EPOCH - UPDATED_EPOCH))
      AGE_HOURS=$((AGE_SECS / 3600))
      
      if [ "$AGE_HOURS" -ge "$HOURS" ]; then
        MSG="ZOMBIE: Run ${RUN_ID:0:8} (workflow=$WORKFLOW) stuck ${AGE_HOURS}h — $([ -n "$DRY_RUN" ] && echo "WOULD CANCEL" || echo "CANCELLING")"
        echo "  $MSG"
        echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $MSG" >> "$LOG"
        
        if [ -z "$DRY_RUN" ]; then
          RESULT=$($ANTFARM workflow stop "$RUN_ID" 2>&1 || true)
          echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')]   → $RESULT" >> "$LOG"
        fi
      fi
    fi
  fi
done

echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] Cleanup done." >> "$LOG"
echo "Done. See $LOG for details."
