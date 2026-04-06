# ADR-004: Single-owner Gateway + Port Ownership Guard

## Status
Proposed

## Context
On 2026-04-05, duplicate `openclaw-gateway` processes caused split-brain model loading — ollama-cloud models were invisible to one process while OpenAI models were visible to the other. Cron warnings fired repeatedly from the wrong process owning port 18789. The root cause: no guard preventing multiple gateway instances from competing for the same port, with launchd, PM2, and manual starts all capable of spawning independent gateways.

## Decision
**launchd is the single supervisor for the gateway.** PM2 is removed from gateway management.

Specific requirements:
1. **Supervisor exclusivity:** Gateway runs under `~/Library/LaunchAgents/ai.openclaw.gateway.plist` only
2. **Startup port check:** On bind attempt, gateway refuses to start if another process owns port 18789 (`lsof -i :18789 -t`)
3. **Restart behavior:** `openclaw gateway restart` hard-kills any listeners on the port before starting the launchd service
4. **Canonical health check:** `openclaw gateway status --deep` verifies PID matches port listener

## Consequences

### Positive
- Eliminates split-brain scenarios where processes see different model catalogs
- Config changes always apply to the running gateway
- Predictable cron behavior — one process, one model catalog
- Clear ownership model for debugging

### Negative
- Users must migrate from PM2 to launchd for gateway supervision
- Manual `node openclaw-gateway` debugging requires stopping launchd first
- Linux deployments need equivalent systemd configuration

## Acceptance Criteria
- [ ] `openclaw gateway status --deep` never shows "PID does not own listening port"
- [ ] Starting gateway while another is running emits clear error and refuses to bind
- [ ] `openclaw gateway restart` kills all listeners before rebind
- [ ] `pm2 list` shows no `openclaw` gateway process (PM2 removed from gateway management)
- [ ] Zero duplicate gateway processes in production
