# Artifact Manifest Specification

## Purpose
Every swarm writes a manifest at `.antfarm/artifacts.json` in the repo.
The next swarm in the pipeline reads it to find inputs instead of guessing paths.

## Schema

```json
{
  "version": "1.0",
  "pipeline_run": "<run-id or timestamp>",
  "swarm": "<swarm-id>",
  "branch": "<branch-name>",
  "completed_at": "<ISO 8601>",
  "artifacts": {
    "prd": {
      "path": "docs/prd/<feature>.json",
      "type": "json",
      "status": "complete"
    },
    "architecture": {
      "path": "docs/architecture/<feature>-spec.md",
      "type": "markdown",
      "status": "complete"
    },
    "design": {
      "path": "docs/design/<feature>/",
      "type": "directory",
      "status": "complete"
    },
    "implementation": {
      "branch": "<feature-branch>",
      "test_count": 42,
      "status": "complete"
    },
    "review": {
      "path": "docs/review/<feature>-findings.json",
      "type": "json",
      "score": 78,
      "status": "complete"
    },
    "fixes": {
      "pr_url": "https://github.com/org/repo/pull/123",
      "domains_fixed": ["security", "backend", "tests"],
      "status": "complete"
    },
    "qa": {
      "path": "docs/qa/<branch>-qa-report.md",
      "go_no_go": "GO",
      "acceptance_coverage": "18/20",
      "status": "complete"
    },
    "release": {
      "path": "docs/deployment-readiness-<version>.md",
      "readiness": "READY",
      "version": "v2026.04.03",
      "status": "complete"
    }
  }
}
```

## Rules
1. Each swarm APPENDS its artifact to the existing manifest (don't overwrite previous entries)
2. Pipeline-controller reads the manifest before dispatching the next swarm
3. If a required artifact is missing, the pipeline-controller reports error and stops
4. The manifest is committed to the repo alongside the artifacts
