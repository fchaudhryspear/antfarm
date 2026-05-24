#!/usr/bin/env node
import { runGatewayLoadTest } from "../dist/gateway/staging-load-test.js";

function numberArg(name, fallback) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  const value = Number.parseFloat(process.argv[idx + 1] ?? "");
  return Number.isFinite(value) ? value : fallback;
}

function stringArg(name, fallback) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

const result = await runGatewayLoadTest({
  issueId: stringArg("--issue", "ADP-388"),
  baselineConcurrentSessions: numberArg("--baseline", 5),
  multiplier: numberArg("--multiplier", 5),
  targetConcurrentSessions: process.argv.includes("--target") ? numberArg("--target", 25) : undefined,
  sustainedSeconds: numberArg("--sustained-seconds", 10),
  heartbeatIntervalMs: numberArg("--heartbeat-interval-ms", 100),
  heartbeatTimeoutMs: numberArg("--heartbeat-timeout-ms", 500),
  evidencePath: stringArg("--evidence", "/tmp/antfarm-adp388-gateway-load-test.json"),
  evidenceDbPath: stringArg("--evidence-db", "/tmp/antfarm-adp388-gateway-load-test.db"),
  maxParallelUnits: numberArg("--max-parallel-units", 25),
});

console.log(JSON.stringify(result, null, 2));
process.exit(result.pass ? 0 : 1);
