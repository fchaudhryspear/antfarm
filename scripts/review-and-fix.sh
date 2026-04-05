#!/usr/bin/env bash
# review-and-fix.sh — Closed-loop pipeline: review → fix → post-review
# Usage: ./review-and-fix.sh --repo-path=/path/to/repo --repo-name=my-project [options]
#
# Options:
#   --repo-path=PATH       Required. Absolute path to the repository.
#   --repo-name=NAME       Required. Repository name for PR titles etc.
#   --branch=NAME          Fix branch name (default: fix/swarm-auto)
#   --priority=LEVEL       all | high-and-above | high | critical-only (default: all)
#   --verify               Run post-review verification (default: off)
#   --safe-consolidate     Run bisect rollback on build failure (default: true)
#   --dry-run              Run review only, output findings, don't fix
#   --findings=FILE        Skip review, use existing findings file (JSON or freetext)
#   --max-fixes=N          Max fixes per domain (default: 5)
#   --scope=SCOPE          Review scope (default: full-stack)
#
# Examples:
#   # Full pipeline: review → fix → PR
#   ./review-and-fix.sh --repo-path=/Users/fas/code/flobase --repo-name=flobase
#
#   # Review only (dry run)
#   ./review-and-fix.sh --repo-path=/Users/fas/code/flobase --repo-name=flobase --dry-run
#
#   # Skip review, use existing findings
#   ./review-and-fix.sh --repo-path=/Users/fas/code/flobase --repo-name=flobase --findings=findings.json
#
#   # Full pipeline with verification
#   ./review-and-fix.sh --repo-path=/Users/fas/code/flobase --repo-name=flobase --verify

set -euo pipefail

ANTFARM_CLI="node $HOME/.openclaw/workspace/antfarm/dist/cli/cli.js"
FINDINGS_DIR="$HOME/.openclaw/workspace/antfarm/findings"
mkdir -p "$FINDINGS_DIR"

# Defaults
BRANCH="fix/swarm-auto"
PRIORITY="all"
VERIFY="false"
SAFE_CONSOLIDATE="true"
DRY_RUN="false"
EXISTING_FINDINGS=""
MAX_FIXES="5"
SCOPE="full-stack"
REPO_PATH=""
REPO_NAME=""

# Parse arguments
for arg in "$@"; do
  case "$arg" in
    --repo-path=*) REPO_PATH="${arg#*=}" ;;
    --repo-name=*) REPO_NAME="${arg#*=}" ;;
    --branch=*) BRANCH="${arg#*=}" ;;
    --priority=*) PRIORITY="${arg#*=}" ;;
    --verify) VERIFY="true" ;;
    --safe-consolidate) SAFE_CONSOLIDATE="true" ;;
    --no-safe-consolidate) SAFE_CONSOLIDATE="false" ;;
    --dry-run) DRY_RUN="true" ;;
    --findings=*) EXISTING_FINDINGS="${arg#*=}" ;;
    --max-fixes=*) MAX_FIXES="${arg#*=}" ;;
    --scope=*) SCOPE="${arg#*=}" ;;
    *) echo "Unknown argument: $arg"; exit 1 ;;
  esac
done

# Validate required args
if [ -z "$REPO_PATH" ]; then echo "Error: --repo-path is required"; exit 1; fi
if [ -z "$REPO_NAME" ]; then echo "Error: --repo-name is required"; exit 1; fi
if [ ! -d "$REPO_PATH" ]; then echo "Error: repo-path '$REPO_PATH' does not exist"; exit 1; fi

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
FINDINGS_FILE="$FINDINGS_DIR/${REPO_NAME}-${TIMESTAMP}.json"

echo "╔══════════════════════════════════════════════════════╗"
echo "║  review-and-fix — Closed-Loop Pipeline v1.0         ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║  Repo:     $REPO_NAME"
echo "║  Path:     $REPO_PATH"
echo "║  Branch:   $BRANCH"
echo "║  Priority: $PRIORITY"
echo "║  Verify:   $VERIFY"
echo "║  Dry Run:  $DRY_RUN"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ─── PHASE 1: REVIEW ───────────────────────────────────────
if [ -n "$EXISTING_FINDINGS" ]; then
  echo "📋 Phase 1: SKIP — using existing findings from $EXISTING_FINDINGS"
  if [ ! -f "$EXISTING_FINDINGS" ]; then
    echo "Error: findings file '$EXISTING_FINDINGS' not found"
    exit 1
  fi
  cp "$EXISTING_FINDINGS" "$FINDINGS_FILE"
  FINDINGS_CONTENT=$(cat "$FINDINGS_FILE")
else
  echo "🔍 Phase 1: REVIEW — launching swarm-code-review-v3..."
  echo ""

  REVIEW_TASK="Full-stack code review of $REPO_NAME"

  $ANTFARM_CLI workflow run swarm-code-review-v3 "$REVIEW_TASK" \
    --repo-path="$REPO_PATH" \
    --context repo_name="$REPO_NAME" \
    --context scope="$SCOPE"

  echo ""
  echo "⏳ Review swarm launched. Waiting for completion..."
  echo "   Monitor with: $ANTFARM_CLI workflow status \"$REVIEW_TASK\""
  echo ""

  # Poll for completion (check every 60s, timeout after 45 min)
  MAX_WAIT=2700
  ELAPSED=0
  REVIEW_DONE=false

  while [ $ELAPSED -lt $MAX_WAIT ]; do
    sleep 60
    ELAPSED=$((ELAPSED + 60))

    STATUS_OUTPUT=$($ANTFARM_CLI workflow status "$REVIEW_TASK" 2>&1 || true)

    if echo "$STATUS_OUTPUT" | grep -q "completed"; then
      REVIEW_DONE=true
      echo "✅ Review swarm completed after ${ELAPSED}s"
      break
    elif echo "$STATUS_OUTPUT" | grep -q "failed"; then
      echo "❌ Review swarm failed after ${ELAPSED}s"
      echo "$STATUS_OUTPUT"
      exit 1
    fi

    echo "   ... waiting (${ELAPSED}s elapsed)"
  done

  if [ "$REVIEW_DONE" = false ]; then
    echo "❌ Review swarm timed out after ${MAX_WAIT}s"
    exit 1
  fi

  # Extract findings from the consolidator output
  # The consolidator outputs STRUCTURED_FINDINGS_JSON: followed by the JSON block
  CONSOLIDATOR_OUTPUT=$($ANTFARM_CLI logs --workflow swarm-code-review-v3 --step consolidate --last 2>&1 || true)

  # Try to extract structured JSON
  if echo "$CONSOLIDATOR_OUTPUT" | grep -q "STRUCTURED_FINDINGS_JSON:"; then
    echo "$CONSOLIDATOR_OUTPUT" | sed -n '/STRUCTURED_FINDINGS_JSON:/,/^}$/p' | sed '1s/STRUCTURED_FINDINGS_JSON://' > "$FINDINGS_FILE"
    echo "📄 Structured findings saved to: $FINDINGS_FILE"
  else
    # Fallback: save raw output as freetext
    echo "$CONSOLIDATOR_OUTPUT" > "$FINDINGS_FILE"
    echo "📄 Freetext findings saved to: $FINDINGS_FILE (no structured JSON found)"
  fi

  FINDINGS_CONTENT=$(cat "$FINDINGS_FILE")
fi

# ─── DRY RUN EXIT ──────────────────────────────────────────
if [ "$DRY_RUN" = "true" ]; then
  echo ""
  echo "🏁 Dry run complete. Findings saved to: $FINDINGS_FILE"
  echo "   To run fixes: ./review-and-fix.sh --repo-path=$REPO_PATH --repo-name=$REPO_NAME --findings=$FINDINGS_FILE"
  exit 0
fi

# ─── PHASE 2: FIX ──────────────────────────────────────────
echo ""
echo "🔧 Phase 2: FIX — launching swarm-code-fix-v1..."
echo ""

FIX_TASK="Fix findings in $REPO_NAME from review $TIMESTAMP"

$ANTFARM_CLI workflow run swarm-code-fix-v1 "$FIX_TASK" \
  --repo-path="$REPO_PATH" \
  --context repo_name="$REPO_NAME" \
  --context "findings=$(cat "$FINDINGS_FILE")" \
  --context branch="$BRANCH" \
  --context priority="$PRIORITY" \
  --context safe_consolidate="$SAFE_CONSOLIDATE" \
  --context verify="$VERIFY" \
  --context max_fixes_per_domain="$MAX_FIXES"

echo ""
echo "⏳ Fix swarm launched. Waiting for completion..."
echo "   Monitor with: $ANTFARM_CLI workflow status \"$FIX_TASK\""
echo ""

# Poll for completion (check every 60s, timeout after 2 hours)
MAX_WAIT=7200
ELAPSED=0
FIX_DONE=false

while [ $ELAPSED -lt $MAX_WAIT ]; do
  sleep 60
  ELAPSED=$((ELAPSED + 60))

  STATUS_OUTPUT=$($ANTFARM_CLI workflow status "$FIX_TASK" 2>&1 || true)

  if echo "$STATUS_OUTPUT" | grep -q "completed"; then
    FIX_DONE=true
    echo "✅ Fix swarm completed after ${ELAPSED}s"
    break
  elif echo "$STATUS_OUTPUT" | grep -q "failed"; then
    echo "❌ Fix swarm failed after ${ELAPSED}s"
    echo "$STATUS_OUTPUT"
    exit 1
  fi

  echo "   ... waiting (${ELAPSED}s elapsed)"
done

if [ "$FIX_DONE" = false ]; then
  echo "❌ Fix swarm timed out after ${MAX_WAIT}s"
  exit 1
fi

# ─── PHASE 3: RESULTS ──────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  Pipeline Complete                                   ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║  Findings: $FINDINGS_FILE"
echo "║  Check PR: gh pr list --head $BRANCH"
echo "╚══════════════════════════════════════════════════════╝"

# Show final status
$ANTFARM_CLI workflow status "$FIX_TASK" 2>&1 || true
