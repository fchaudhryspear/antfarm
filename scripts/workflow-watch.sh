#!/bin/bash
# workflow-watch.sh — poll a workflow run and notify on stage transitions
# Usage: ./workflow-watch.sh <run-id> [poll-interval-seconds]

RUN_ID="$1"
INTERVAL="${2:-60}"
MAX_RUNTIME="${3:-7200}"  # max 2h before auto-exit

if [ -z "$RUN_ID" ]; then
  echo "Usage: $0 <run-id> [poll-interval-seconds]"
  exit 1
fi

ANTFARM="node /Users/faisalshomemacmini/.openclaw/workspace/antfarm/dist/cli/cli.js"
STATE_FILE="/tmp/antfarm-watch-$RUN_ID.json"

send_tg() {
  local msg="$1"
  curl -s -X POST "https://api.telegram.org/bot$(python3 -c "import json; d=json.load(open('/Users/faisalshomemacmini/.openclaw/openclaw.json')); print(d.get('channels',{}).get('telegram',{}).get('botToken',''))")/sendMessage" \
    -d "chat_id=7980582930&text=${msg}&parse_mode=HTML" > /dev/null 2>&1
}

notify() {
  local emoji="$1"; shift
  local msg="$*"
  echo "[$(date '+%H:%M:%S')] $emoji $msg"
  send_tg "$(echo "$msg" | sed 's/"/\\"/g')"
}

# Init previous state
PREV_STEP_STATUS="{}"
if [ -f "$STATE_FILE" ]; then
  PREV_STEP_STATUS=$(cat "$STATE_FILE")
fi

START_TIME=$(date +%s)
LAST_NOTIFY_TIME=$START_TIME

notify "🔔" "👁️ <b>Watch started</b> — Run #$RUN_ID
Polling every ${INTERVAL}s (max ${MAX_RUNTIME}s)"
echo "Watching Run #$RUN_ID ..."

while true; do
  # Check max runtime
  NOW=$(date +%s)
  ELAPSED=$((NOW - START_TIME))
  if [ $ELAPSED -gt $MAX_RUNTIME ]; then
    notify "⏰" "Watchdog timeout after ${ELAPSED}s — exiting"
    break
  fi

  # Fetch current status
  STATUS_OUTPUT=$($ANTFARM workflow status "$RUN_ID" 2>&1)
  CURRENT_RUN_STATUS=$(echo "$STATUS_OUTPUT" | grep -E "^Status:" | awk '{print $2}')
  
  # Extract step statuses — format: "[running] agent-name"
  CURRENT_STEP_STATUS=$(echo "$STATUS_OUTPUT" | grep -E "^\s+\[(pending|running|waiting|completed|failed|cancelled)\]" | awk '{print $2, $1}' | sort | tr '\n' ',')

  if [ "$CURRENT_RUN_STATUS" = "completed" ] || [ "$CURRENT_RUN_STATUS" = "failed" ] || [ "$CURRENT_RUN_STATUS" = "cancelled" ]; then
    # Final state — extract score if available
    SCORE_LINE=$(echo "$STATUS_OUTPUT" | grep -i "SCORE\|score\|result" | head -3)
    notify "🏁" "Run <b>$CURRENT_RUN_STATUS</b> after ${ELAPSED}s
$STATUS_OUTPUT"
    rm -f "$STATE_FILE"
    break
  fi

  # Detect step state changes
  CHANGES=""
  if [ "$PREV_STEP_STATUS" != "$CURRENT_STEP_STATUS" ]; then
    # Parse individual step changes
    OLD_STEPS=$(echo "$PREV_STEP_STATUS" | tr ',' '\n')
    NEW_STEPS=$(echo "$CURRENT_STEP_STATUS" | tr ',' '\n')
    
    while IFS= read -r new_line; do
      if [ -n "$new_line" ]; then
        AGENT=$(echo "$new_line" | awk '{print $1}')
        NEW_STATE=$(echo "$new_line" | awk '{print $2}')
        OLD_LINE=$(echo "$PREV_STEP_STATUS" | tr ',' '\n' | grep "^$AGENT ")
        OLD_STATE=$(echo "$OLD_LINE" | awk '{print $2}')
        
        if [ "$NEW_STATE" != "$OLD_STATE" ]; then
          case "$NEW_STATE" in
            running)  CHANGES="${CHANGES}⚡ ${AGENT}: started
" ;;
            completed) CHANGES="${CHANGES}✅ ${AGENT}: done
" ;;
            failed)   CHANGES="${CHANGES}❌ ${AGENT}: failed
" ;;
            waiting)  CHANGES="${CHANGES}⏳ ${AGENT}: waiting
" ;;
          esac
        fi
      fi
    done <<< "$NEW_STEPS"
    
    # Also detect new agents that appeared
    while IFS= read -r old_line; do
      if [ -n "$old_line" ]; then
        AGENT=$(echo "$old_line" | awk '{print $1}')
        if ! echo "$NEW_STEPS" | grep -q "^${AGENT} "; then
          :
        fi
      fi
    done <<< "$OLD_STEPS"
  fi

  # Throttle notifications: only send if changes AND >30s since last notification
  if [ -n "$CHANGES" ] && [ $((NOW - LAST_NOTIFY_TIME)) -gt 30 ]; then
    RUNNING_COUNT=$(echo "$CURRENT_STEP_STATUS" | tr ',' '\n' | grep -c "running" || echo 0)
    PENDING_COUNT=$(echo "$CURRENT_STEP_STATUS" | tr ',' '\n' | grep -c "pending" || echo 0)
    notify "🔄" "Step transitions (${ELAPSED}s elapsed):
${CHANGES}
Running: ${RUNNING_COUNT} | Pending: ${PENDING_COUNT} | Status: ${CURRENT_RUN_STATUS}"
    LAST_NOTIFY_TIME=$NOW
    PREV_STEP_STATUS="$CURRENT_STEP_STATUS"
    echo "$CURRENT_STEP_STATUS" > "$STATE_FILE"
  fi

  sleep "$INTERVAL"
done
