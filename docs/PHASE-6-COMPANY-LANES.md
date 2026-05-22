# Phase 6.1: Per-Company Operating Lanes

> Approved by Fas on 2026-04-10 15:48 CDT
> Adjustments: no himalaya email routing, prioritize --company flag

## Status
- ✅ Company context files created (flobase, credologi, utility-valet)
- ✅ Active company state file (memory/active-company.json)
- ✅ Antfarm `--company` CLI flag (loads context, injects into run vars)
- ✅ AGENTS.md updated with company context rules
- ⏳ Email routing (deferred — use Microsoft Graph when needed)
- ⏳ Skill script wiring (company.py, env_loader.py — secondary priority)

## Architecture

### Company Context Files
Location: `~/.openclaw/companies/<key>/context.json`

Fields:
- `key` — company identifier
- `name` — display name
- `email` — primary email
- `repoPath` — local repo path (null if none)
- `defaultBranch` — git default branch
- `awsProfile` — AWS CLI profile name
- `awsRegion` — AWS region
- `githubOrg` / `githubRepo` — GitHub coordinates
- `domain` — production domain
- `stack` — tech stack info
- `notes` — freeform context

### Active Company State
Location: `~/.openclaw/workspace/memory/active-company.json`
Default: `credologi`

### Antfarm --company Flag
Usage: `antfarm workflow run <workflow> --company flobase "task description"`

Injects into run context:
- `company_key`, `company_name`, `company_email`
- `repo_path` (from company repoPath, unless --repo-path overrides)
- `aws_profile`, `aws_region`
- `github_org`, `github_repo`
- `company_domain`

Explicit `--context` flags override company defaults.

## Adding New Companies
1. Create `~/.openclaw/companies/<key>/context.json`
2. The `--company <key>` flag will pick it up automatically
