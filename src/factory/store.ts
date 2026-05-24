import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { getDb } from "../db.js";

export type FactoryItemStatus = "queued" | "running" | "blocked" | "done" | "canceled";
export type FactoryRunStatus = "pending" | "running" | "blocked" | "completed" | "failed" | "canceled";
export type FactoryGateStatus = "pending" | "passed" | "failed" | "waived";

export type FactoryItem = {
  id: string;
  title: string;
  description: string;
  repo: string | null;
  issue_url: string | null;
  source: string | null;
  priority: string;
  status: FactoryItemStatus;
  lifecycle_stage: string;
  requested_by: string | null;
  owner: string | null;
  created_at: string;
  updated_at: string;
};

export type FactoryRun = {
  id: string;
  factory_item_id: string;
  workflow_id: string;
  antfarm_run_id: string | null;
  status: FactoryRunStatus;
  started_at: string | null;
  completed_at: string | null;
  model_policy: string | null;
  budget_json: string | null;
  error_summary: string | null;
  created_at: string;
  updated_at: string;
};

export type FactoryAgentRun = {
  id: string;
  factory_run_id: string;
  context_pack_id: string | null;
  antfarm_step_id: string | null;
  agent_role: string;
  agent_name: string | null;
  status: string;
  workspace_path: string | null;
  branch_name: string | null;
  model: string | null;
  token_usage_json: string | null;
  cost_estimate: number | null;
  started_at: string | null;
  completed_at: string | null;
  result_summary: string | null;
  created_at: string;
  updated_at: string;
};

export type FactoryContextPack = {
  id: string;
  factory_item_id: string;
  factory_run_id: string | null;
  stage: string;
  agent_role: string;
  path: string;
  checksum: string;
  manifest_json: string;
  created_at: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function jsonOrNull(value: unknown): string | null {
  return value === undefined || value === null ? null : JSON.stringify(value);
}

export function createFactoryItem(input: {
  id?: string;
  title: string;
  description?: string;
  repo?: string;
  issueUrl?: string;
  source?: string;
  priority?: string;
  requestedBy?: string;
  owner?: string;
}, db: DatabaseSync = getDb()): FactoryItem {
  const id = input.id ?? crypto.randomUUID();
  const now = nowIso();
  db.prepare(`
    INSERT INTO factory_items (
      id, title, description, repo, issue_url, source, priority, status,
      lifecycle_stage, requested_by, owner, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', 'intake', ?, ?, ?, ?)
  `).run(
    id,
    input.title,
    input.description ?? "",
    input.repo ?? null,
    input.issueUrl ?? null,
    input.source ?? null,
    input.priority ?? "normal",
    input.requestedBy ?? null,
    input.owner ?? null,
    now,
    now,
  );
  return getFactoryItem(id, db)!;
}

export function getFactoryItem(id: string, db: DatabaseSync = getDb()): FactoryItem | null {
  return db.prepare("SELECT * FROM factory_items WHERE id = ?").get(id) as FactoryItem | undefined ?? null;
}

export function createFactoryRun(input: {
  id?: string;
  factoryItemId: string;
  workflowId: string;
  antfarmRunId?: string;
  modelPolicy?: string;
  budget?: unknown;
}, db: DatabaseSync = getDb()): FactoryRun {
  const id = input.id ?? crypto.randomUUID();
  const now = nowIso();
  db.prepare(`
    INSERT INTO factory_runs (
      id, factory_item_id, workflow_id, antfarm_run_id, status, model_policy,
      budget_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?)
  `).run(
    id,
    input.factoryItemId,
    input.workflowId,
    input.antfarmRunId ?? null,
    input.modelPolicy ?? null,
    jsonOrNull(input.budget),
    now,
    now,
  );
  appendFactoryEvent({ factoryItemId: input.factoryItemId, factoryRunId: id, eventType: "factory_run.created", payload: { workflow_id: input.workflowId } }, db);
  return db.prepare("SELECT * FROM factory_runs WHERE id = ?").get(id) as FactoryRun;
}

export function recordFactoryAgentRun(input: {
  id?: string;
  factoryRunId: string;
  contextPackId?: string;
  antfarmStepId?: string;
  agentRole: string;
  agentName?: string;
  status?: string;
  workspacePath?: string;
  branchName?: string;
  model?: string;
  tokenUsage?: unknown;
  costEstimate?: number;
  resultSummary?: string;
}, db: DatabaseSync = getDb()): FactoryAgentRun {
  const id = input.id ?? crypto.randomUUID();
  const now = nowIso();
  db.prepare(`
    INSERT INTO factory_agent_runs (
      id, factory_run_id, context_pack_id, antfarm_step_id, agent_role, agent_name, status,
      workspace_path, branch_name, model, token_usage_json, cost_estimate,
      result_summary, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.factoryRunId,
    input.contextPackId ?? null,
    input.antfarmStepId ?? null,
    input.agentRole,
    input.agentName ?? null,
    input.status ?? "pending",
    input.workspacePath ?? null,
    input.branchName ?? null,
    input.model ?? null,
    jsonOrNull(input.tokenUsage),
    input.costEstimate ?? null,
    input.resultSummary ?? null,
    now,
    now,
  );
  return db.prepare("SELECT * FROM factory_agent_runs WHERE id = ?").get(id) as FactoryAgentRun;
}

export function recordFactoryContextPack(input: {
  id?: string;
  factoryItemId: string;
  factoryRunId?: string;
  stage: string;
  agentRole: string;
  path: string;
  checksum: string;
  manifest: unknown;
}, db: DatabaseSync = getDb()): FactoryContextPack {
  const id = input.id ?? crypto.randomUUID();
  db.prepare(`
    INSERT INTO factory_context_packs (
      id, factory_item_id, factory_run_id, stage, agent_role, path, checksum,
      manifest_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.factoryItemId,
    input.factoryRunId ?? null,
    input.stage,
    input.agentRole,
    input.path,
    input.checksum,
    JSON.stringify(input.manifest),
    nowIso(),
  );
  return db.prepare("SELECT * FROM factory_context_packs WHERE id = ?").get(id) as FactoryContextPack;
}

export function recordFactoryArtifact(input: {
  id?: string;
  factoryItemId: string;
  factoryRunId?: string;
  agentRunId?: string;
  artifactType: string;
  title: string;
  pathOrUrl: string;
  checksum?: string;
}, db: DatabaseSync = getDb()): string {
  const id = input.id ?? crypto.randomUUID();
  db.prepare(`
    INSERT INTO factory_artifacts (
      id, factory_item_id, factory_run_id, agent_run_id, artifact_type,
      title, path_or_url, checksum, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.factoryItemId,
    input.factoryRunId ?? null,
    input.agentRunId ?? null,
    input.artifactType,
    input.title,
    input.pathOrUrl,
    input.checksum ?? null,
    nowIso(),
  );
  return id;
}

export function upsertFactoryGate(input: {
  id?: string;
  factoryItemId: string;
  factoryRunId?: string;
  gateType: string;
  status: FactoryGateStatus;
  required?: boolean;
  evidenceUrl?: string;
}, db: DatabaseSync = getDb()): string {
  const id = input.id ?? crypto.randomUUID();
  const now = nowIso();
  db.prepare(`
    INSERT INTO factory_gates (
      id, factory_item_id, factory_run_id, gate_type, status, required,
      evidence_url, checked_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status,
      required = excluded.required,
      evidence_url = excluded.evidence_url,
      checked_at = excluded.checked_at,
      updated_at = excluded.updated_at
  `).run(
    id,
    input.factoryItemId,
    input.factoryRunId ?? null,
    input.gateType,
    input.status,
    input.required === false ? 0 : 1,
    input.evidenceUrl ?? null,
    now,
    now,
    now,
  );
  return id;
}

export function appendFactoryEvent(input: {
  id?: string;
  factoryItemId: string;
  factoryRunId?: string;
  eventType: string;
  actor?: string;
  payload?: unknown;
}, db: DatabaseSync = getDb()): string {
  const id = input.id ?? crypto.randomUUID();
  db.prepare(`
    INSERT INTO factory_events (
      id, factory_item_id, factory_run_id, event_type, actor, payload_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.factoryItemId,
    input.factoryRunId ?? null,
    input.eventType,
    input.actor ?? null,
    JSON.stringify(input.payload ?? {}),
    nowIso(),
  );
  return id;
}

export function getFactoryItemStatus(factoryItemId: string, db: DatabaseSync = getDb()): {
  item: FactoryItem | null;
  runs: FactoryRun[];
  agentRuns: FactoryAgentRun[];
  contextPacks: FactoryContextPack[];
  gates: Array<Record<string, unknown>>;
  artifacts: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
} {
  return {
    item: getFactoryItem(factoryItemId, db),
    runs: db.prepare("SELECT * FROM factory_runs WHERE factory_item_id = ? ORDER BY created_at ASC").all(factoryItemId) as FactoryRun[],
    contextPacks: db.prepare("SELECT * FROM factory_context_packs WHERE factory_item_id = ? ORDER BY created_at ASC").all(factoryItemId) as FactoryContextPack[],
    agentRuns: db.prepare(`
      SELECT ar.* FROM factory_agent_runs ar
      JOIN factory_runs fr ON fr.id = ar.factory_run_id
      WHERE fr.factory_item_id = ?
      ORDER BY ar.created_at ASC
    `).all(factoryItemId) as FactoryAgentRun[],
    gates: db.prepare("SELECT * FROM factory_gates WHERE factory_item_id = ? ORDER BY created_at ASC").all(factoryItemId) as Array<Record<string, unknown>>,
    artifacts: db.prepare("SELECT * FROM factory_artifacts WHERE factory_item_id = ? ORDER BY created_at ASC").all(factoryItemId) as Array<Record<string, unknown>>,
    events: db.prepare("SELECT * FROM factory_events WHERE factory_item_id = ? ORDER BY created_at ASC").all(factoryItemId) as Array<Record<string, unknown>>,
  };
}
