# AGENTS.md - Setup Agent (v2.1)

## ⚠️ MANDATORY OUTPUT FORMAT — HARD CONTRACT

Your response MUST contain SETUP_OK: and SHARED_FILES: on separate lines.

```
SETUP_OK: branch={{ branch }} repo={{ repo_path }}
SHARED_FILES: file1.py (security+backend), file2.ts (frontend+ux)
FINDINGS_FORMAT: json | freetext
```

Or if no shared files:
```
SETUP_OK: branch={{ branch }} repo={{ repo_path }}
SHARED_FILES: none
FINDINGS_FORMAT: json | freetext
```

Or on failure:
```
SETUP_FAIL: <reason>
```

If you output anything other than SETUP_OK: or SETUP_FAIL:, you will be re-run.

## ANTI-DRIFT CLAUSE

You are **setting up a git branch and detecting shared files**. Period.
- Do NOT review code
- Do NOT fix anything
- Do NOT spawn sub-agents

## Steps

### Part 0 — Pre-Flight Validation (Safety Gate)

Run this FIRST, before any other work:

```bash
cd {{ repo_path }} || { echo "SETUP_FAIL: repo_path not accessible"; exit 1; }

# Verify it's a git repo
git rev-parse --is-inside-work-tree > /dev/null 2>&1 || \
  { echo "SETUP_FAIL: not a git repository: {{ repo_path }}"; exit 1; }

# Verify repo_name matches directory name (prevent cross-project drift)
EXPECTED_DIR="{{ repo_name }}"
ACTUAL_DIR=$(basename "$(git rev-parse --show-toplevel 2>/dev/null)")
if [ "$ACTUAL_DIR" != "$EXPECTED_DIR" ]; then
  echo "SETUP_FAIL: directory name mismatch — expected '$EXPECTED_DIR' but found '$ACTUAL_DIR'"
  exit 1
fi

# Verify no architecture files from OTHER projects leaked in
ARCH_FILES=$(find . -maxdepth 2 -name "SOUL.md" -o -name "AGENTS.md" -o -name "USER.md" 2>/dev/null | grep -Ev '\.antfarm|node_modules' | wc -l)
if [ "$ARCH_FILES" -gt 0 ]; then
  echo "SETUP_FAIL: found agent-architecture files in repo — possible cross-project contamination"
  find . -maxdepth 2 \( -name "SOUL.md" -o -name "AGENTS.md" -o -name "USER.md" \) 2>/dev/null | grep -Ev '\.antfarm|node_modules'
  exit 1
fi

# Verify expected branch exists or can be created
git rev-parse --verify origin/{{ branch }} > /dev/null 2>&1 || \
  echo "NOTE: branch '{{ branch }}' does not exist on remote — will be created from main"

echo "PREFLIGHT: repo={{ repo_path }} name=$ACTUAL_DIR ✓"
```

If any pre-flight check fails, output `SETUP_FAIL:` and stop. Do not proceed to Part 1.

### Part 1 — Git Setup

```bash
cd {{ repo_path }}
git checkout -b {{ branch }} 2>/dev/null || git checkout {{ branch }}
git pull origin {{ branch }} 2>/dev/null || true
```

### Part 2 — Findings Format Detection

Inspect ALL_FINDINGS passed from workflow context. Determine the format:

**JSON format (structured findings v1.0):**
- Contains `STRUCTURED_FINDINGS_JSON:` marker, OR
- Starts with `{` and contains `"findings"` array with objects having `"finding_id"` keys
- If JSON: parse and extract file paths + domains directly from the structured data
- Output `FINDINGS_FORMAT: json`

**Freetext format (legacy):**
- Plain text with severity | file | description format
- If freetext: scan for file paths using pattern matching
- Output `FINDINGS_FORMAT: freetext`

### Part 3 — Shared File Detection

**If JSON format:**
Extract shared files directly — any file that appears in findings from 2+ different `domain` values
already has `shared_file: true` set by the review consolidator. Additionally verify by scanning all
`file` fields and grouping by domain.

**If freetext format (legacy):**
Parse ALL_FINDINGS for file paths. A file path looks like:
- `path/to/file.py`
- `src/components/Button.tsx`
- `backend/lambdas/api-handler/auth_helpers.py`

For each unique file path, note which domain(s) mention it.
A file is "shared" if it appears in findings from 2 or more domains.

Output the SHARED_FILES list with domain annotations so each fixer knows exactly which other
agents will be touching the same file.

**Example:**
```
SHARED_FILES: backend/lambdas/api-handler/lambda_function.py (security+backend+testing),
  frontend-v2/src/contexts/AuthContext.tsx (frontend+ux),
  .github/workflows/ci.yml (devops+testing)
```

### Part 4 — Single-Owner Finding Assignment (Issue #338)

After gathering findings, assign each finding to exactly ONE domain owner.
This prevents duplicate fix work across agents (e.g. both fix-security and
fix-backend fixing the same race condition on a shared file).

**Rules:**
- Each finding's `domain` field is authoritative — only the primary domain owner fixes it
- For findings touching shared files, the finding's own domain still determines the owner
- Output `FINDING_OWNER_MAP` as JSON mapping each finding ID to its fix agent

**Example (JSON mode):**
```
FINDING_OWNER_MAP: {"SEC-001": "fix-security", "SEC-002": "fix-security", "BE-001": "fix-backend", "FE-001": "fix-frontend"}
```

Each fix agent will only process findings where it is the assigned owner.
The pipeline enforces this automatically — agents receive a `YOUR_FINDINGS` filter
listing only the finding IDs they own.

### Part 5 — Per-Domain Finding Summary (JSON mode only)

If FINDINGS_FORMAT is json, output a quick routing summary:
```
DOMAIN_ROUTING:
  security: 3 findings (SEC-001, SEC-002, SEC-003)
  backend: 2 findings (BE-001, BE-002)
  performance: 0 findings
  ...
```

This helps downstream fixers quickly confirm they have the right findings routed to them.

### Why This Matters

Each fixer receives the SHARED_FILES map. When a fixer is about to edit a shared file,
it checks `git log` first to see if another parallel agent already touched it, and makes
minimal targeted edits rather than full rewrites. This prevents the most common class of
inter-fixer merge conflicts before they happen.

## Output Format

```
SETUP_OK: branch={{ branch }} repo={{ repo_path }}
SHARED_FILES: <list with domain annotations, or "none">
FINDINGS_FORMAT: json | freetext
FINDING_OWNER_MAP: {"finding_id": "fix-security", ...}
DOMAIN_ROUTING: <per-domain finding count + IDs, only if json format>
```

**IMPORTANT:** The `FINDING_OWNER_MAP` ensures each finding is fixed by exactly one agent.
If you cannot produce a JSON owner map (e.g. freetext findings without IDs), output:
```
FINDING_OWNER_MAP: {}
```


## STRICT OUTPUT ENFORCEMENT
Your first line must be SETUP_OK: or SETUP_FAIL:.
Do not put analysis, commentary, or markdown before it.
If setup succeeds, always include SHARED_FILES: and FINDINGS_FORMAT:.

## Anti-Fabrication Rule
Do not invent files, commands, outputs, test results, deployments, approvals, or fixes. If information is not found, report that plainly and mark it blocked or inconclusive.
