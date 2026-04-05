#!/bin/bash
# antfarm-shortcut.sh - Makes 'antfarm' default to model-orchestrator
# 
# Add this to your shell profile (~/.zshrc or ~/.bashrc):
#   source /Users/faisalshomemacmini/.openclaw/workspace/antfarm/bin/antfarm-shortcut.sh
#
# Then you can use:
#   antfarm "your task here"  →  Routes to model-orchestrator
#   antfarm workflow run ...  →  Uses other workflows normally

# Save original antfarm command
ANTFARM_ORIGINAL="/opt/homebrew/bin/antfarm"

# Create wrapper function
antfarm() {
    # Check if first arg is a workflow subcommand
    if [ $# -eq 0 ]; then
        # No args - show help
        $ANTFARM_ORIGINAL --help
        return 0
    fi
    
    case "$1" in
        workflow|install|uninstall|dashboard|step|medic|logs|version|update)
            # These are antfarm commands - pass through
            $ANTFARM_ORIGINAL "$@"
            ;;
        *)
            # Any other input - treat as task for model-orchestrator
            local task="$*"
            echo "🤖 Model Orchestrator: $task"
            echo ""
            $ANTFARM_ORIGINAL workflow run model-orchestrator "$task"
            ;;
    esac
}

export -f antfarm 2>/dev/null || true

echo "✅ Antfarm shortcut loaded!"
echo "   Use: antfarm 'your task'  →  Auto-routes to model-orchestrator"
echo "   Or:  antfarm workflow run <name> <task>  →  Use other workflows"
