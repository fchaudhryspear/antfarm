import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

export function recordDeploymentEvent(input: {
  db: DatabaseSync;
  tenantId: string;
  factoryItemId?: string;
  factoryRunId?: string;
  environment: string;
  service: string;
  version?: string;
  status?: "planned" | "started" | "succeeded" | "failed" | "rolled_back" | "manual_recorded";
  actor?: string;
  evidenceUrl?: string;
  payload?: unknown;
}): string {
  const id = crypto.randomUUID();
  input.db.prepare(`
    INSERT INTO factory_deployment_events (
      id, tenant_id, factory_item_id, factory_run_id, environment, service, version,
      status, actor, evidence_url, payload_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    id,
    input.tenantId,
    input.factoryItemId ?? null,
    input.factoryRunId ?? null,
    input.environment,
    input.service,
    input.version ?? null,
    input.status ?? "manual_recorded",
    input.actor ?? null,
    input.evidenceUrl ?? null,
    JSON.stringify(input.payload ?? {}),
  );
  return id;
}

export function recordSmokeTestStub(input: {
  db: DatabaseSync;
  tenantId: string;
  deploymentEventId?: string;
  suite: string;
  status: "passed" | "failed" | "skipped";
  result?: unknown;
}): string {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  input.db.prepare(`
    INSERT INTO factory_smoke_test_runs (
      id, tenant_id, deployment_event_id, suite, status, runner, result_json, started_at, completed_at
    ) VALUES (?, ?, ?, ?, ?, 'manual_stub', ?, ?, ?)
  `).run(
    id,
    input.tenantId,
    input.deploymentEventId ?? null,
    input.suite,
    input.status,
    JSON.stringify(input.result ?? {}),
    now,
    now,
  );
  return id;
}
