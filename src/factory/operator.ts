import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { getDb } from "../db.js";
import {
  appendDashboardAuditEvent,
  appendFactoryEvent,
  createFactoryItem,
  getFactoryItem,
  upsertFactoryGate,
  type DashboardAuditEvent,
  type FactoryGateStatus,
  type FactoryItem,
  type FactoryRun,
} from "./store.js";

export class StaleOperatorCommandError extends Error {
  constructor(targetId: string) {
    super(`Stale operator command for ${targetId}; refresh state before retrying`);
    this.name = "StaleOperatorCommandError";
  }
}

export type OperatorCommandResult = {
  ok: true;
  command: string;
  factoryItemId?: string;
  factoryRunId?: string;
  auditEvent: DashboardAuditEvent;
};

function nowIso(): string {
  return new Date().toISOString();
}

function getFactoryRun(factoryRunId: string, db: DatabaseSync): FactoryRun {
  const run = db.prepare("SELECT * FROM factory_runs WHERE id = ?").get(factoryRunId) as FactoryRun | undefined;
  if (!run) throw new Error(`Factory run not found: ${factoryRunId}`);
  return run;
}

function assertFreshRun(run: FactoryRun, expectedUpdatedAt?: string): void {
  if (expectedUpdatedAt && run.updated_at !== expectedUpdatedAt) {
    throw new StaleOperatorCommandError(run.id);
  }
}

function writeAudit(input: {
  factoryItemId?: string;
  factoryRunId?: string;
  operator: string;
  command: string;
  targetType: string;
  targetId: string;
  status?: string;
  payload?: unknown;
}, db: DatabaseSync): DashboardAuditEvent {
  return appendDashboardAuditEvent({
    factoryItemId: input.factoryItemId,
    factoryRunId: input.factoryRunId,
    operator: input.operator,
    command: input.command,
    targetType: input.targetType,
    targetId: input.targetId,
    status: input.status ?? "accepted",
    payload: input.payload,
  }, db);
}

export function createOrLinkFactoryItem(input: {
  factoryItemId?: string;
  title: string;
  description?: string;
  repo?: string;
  issueUrl?: string;
  source?: string;
  priority?: string;
  requestedBy?: string;
  owner?: string;
  operator?: string;
  externalRef?: string;
}, db: DatabaseSync = getDb()): { item: FactoryItem; auditEvent: DashboardAuditEvent; created: boolean } {
  const operator = input.operator ?? "hermes";
  const existing = input.factoryItemId ? getFactoryItem(input.factoryItemId, db) : null;
  const item = existing ?? createFactoryItem({
    id: input.factoryItemId,
    title: input.title,
    description: input.description,
    repo: input.repo,
    issueUrl: input.issueUrl,
    source: input.source ?? "hermes",
    priority: input.priority,
    requestedBy: input.requestedBy ?? operator,
    owner: input.owner,
  }, db);

  appendFactoryEvent({
    factoryItemId: item.id,
    eventType: existing ? "operator.factory_item.linked" : "operator.factory_item.created",
    actor: operator,
    payload: { external_ref: input.externalRef ?? null, source: input.source ?? "hermes" },
  }, db);
  const auditEvent = writeAudit({
    factoryItemId: item.id,
    operator,
    command: existing ? "intake.link" : "intake.create",
    targetType: "factory_item",
    targetId: item.id,
    payload: { title: item.title, external_ref: input.externalRef ?? null },
  }, db);
  return { item, auditEvent, created: !existing };
}

export function approveFactoryGate(input: {
  factoryItemId: string;
  factoryRunId?: string;
  gateType: string;
  evidenceUrl?: string;
  operator?: string;
  status?: Extract<FactoryGateStatus, "passed" | "waived">;
}, db: DatabaseSync = getDb()): OperatorCommandResult {
  const operator = input.operator ?? "hermes";
  const gateId = upsertFactoryGate({
    id: crypto.randomUUID(),
    factoryItemId: input.factoryItemId,
    factoryRunId: input.factoryRunId,
    gateType: input.gateType,
    status: input.status ?? "passed",
    evidenceUrl: input.evidenceUrl,
  }, db);
  appendFactoryEvent({
    factoryItemId: input.factoryItemId,
    factoryRunId: input.factoryRunId,
    eventType: "operator.gate.approved",
    actor: operator,
    payload: { gate_id: gateId, gate_type: input.gateType, evidence_url: input.evidenceUrl ?? null },
  }, db);
  const auditEvent = writeAudit({
    factoryItemId: input.factoryItemId,
    factoryRunId: input.factoryRunId,
    operator,
    command: "gate.approve",
    targetType: "factory_gate",
    targetId: gateId,
    payload: { gate_type: input.gateType, evidence_url: input.evidenceUrl ?? null },
  }, db);
  return { ok: true, command: "gate.approve", factoryItemId: input.factoryItemId, factoryRunId: input.factoryRunId, auditEvent };
}

function mutateFactoryRun(input: {
  factoryRunId: string;
  operator?: string;
  expectedUpdatedAt?: string;
  command: "run.pause" | "run.resume" | "run.retry";
  nextStatus: FactoryRun["status"];
  allowedStatuses: FactoryRun["status"][];
  reason?: string;
}, db: DatabaseSync = getDb()): OperatorCommandResult {
  const operator = input.operator ?? "hermes";
  db.exec("BEGIN IMMEDIATE");
  try {
    const run = getFactoryRun(input.factoryRunId, db);
    assertFreshRun(run, input.expectedUpdatedAt);
    if (!input.allowedStatuses.includes(run.status)) {
      throw new Error(`${input.command} cannot mutate run ${run.id} from status ${run.status}`);
    }

    const now = nowIso();
    const statusPlaceholders = input.allowedStatuses.map(() => "?").join(", ");
    const stalePredicate = input.expectedUpdatedAt ? " AND updated_at = ?" : "";
    const updateResult = db.prepare(`
      UPDATE factory_runs SET
        status = ?,
        error_summary = CASE WHEN ? = 'run.retry' THEN NULL ELSE error_summary END,
        completed_at = CASE WHEN ? = 'run.retry' THEN NULL ELSE completed_at END,
        updated_at = ?
      WHERE id = ? AND status IN (${statusPlaceholders})${stalePredicate}
    `).run(
      input.nextStatus,
      input.command,
      input.command,
      now,
      run.id,
      ...input.allowedStatuses,
      ...(input.expectedUpdatedAt ? [input.expectedUpdatedAt] : []),
    );
    if (updateResult.changes !== 1) {
      const current = getFactoryRun(run.id, db);
      if (input.expectedUpdatedAt && current.updated_at !== input.expectedUpdatedAt) {
        throw new StaleOperatorCommandError(run.id);
      }
      throw new Error(`${input.command} cannot mutate run ${run.id} from status ${current.status}`);
    }
    appendFactoryEvent({
      factoryItemId: run.factory_item_id,
      factoryRunId: run.id,
      eventType: `operator.${input.command}`,
      actor: operator,
      payload: { from_status: run.status, to_status: input.nextStatus, reason: input.reason ?? null },
    }, db);
    const auditEvent = writeAudit({
      factoryItemId: run.factory_item_id,
      factoryRunId: run.id,
      operator,
      command: input.command,
      targetType: "factory_run",
      targetId: run.id,
      payload: { from_status: run.status, to_status: input.nextStatus, reason: input.reason ?? null },
    }, db);
    db.exec("COMMIT");
    return { ok: true, command: input.command, factoryItemId: run.factory_item_id, factoryRunId: run.id, auditEvent };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function pauseFactoryRun(input: {
  factoryRunId: string;
  operator?: string;
  expectedUpdatedAt?: string;
  reason?: string;
}, db: DatabaseSync = getDb()): OperatorCommandResult {
  return mutateFactoryRun({
    factoryRunId: input.factoryRunId,
    operator: input.operator,
    expectedUpdatedAt: input.expectedUpdatedAt,
    command: "run.pause",
    nextStatus: "blocked",
    allowedStatuses: ["pending", "running"],
    reason: input.reason,
  }, db);
}

export function resumeFactoryRun(input: {
  factoryRunId: string;
  operator?: string;
  expectedUpdatedAt?: string;
  reason?: string;
}, db: DatabaseSync = getDb()): OperatorCommandResult {
  return mutateFactoryRun({
    factoryRunId: input.factoryRunId,
    operator: input.operator,
    expectedUpdatedAt: input.expectedUpdatedAt,
    command: "run.resume",
    nextStatus: "running",
    allowedStatuses: ["blocked"],
    reason: input.reason,
  }, db);
}

export function retryFactoryRun(input: {
  factoryRunId: string;
  operator?: string;
  expectedUpdatedAt?: string;
  reason?: string;
}, db: DatabaseSync = getDb()): OperatorCommandResult {
  return mutateFactoryRun({
    factoryRunId: input.factoryRunId,
    operator: input.operator,
    expectedUpdatedAt: input.expectedUpdatedAt,
    command: "run.retry",
    nextStatus: "pending",
    allowedStatuses: ["blocked", "failed", "canceled"],
    reason: input.reason,
  }, db);
}

export function listDashboardAuditEvents(input: {
  factoryItemId?: string;
  factoryRunId?: string;
  limit?: number;
}, db: DatabaseSync = getDb()): DashboardAuditEvent[] {
  const limit = Math.max(1, Math.min(input.limit ?? 50, 250));
  if (input.factoryRunId) {
    return db.prepare("SELECT * FROM dashboard_audit_events WHERE factory_run_id = ? ORDER BY created_at DESC LIMIT ?").all(input.factoryRunId, limit) as DashboardAuditEvent[];
  }
  if (input.factoryItemId) {
    return db.prepare("SELECT * FROM dashboard_audit_events WHERE factory_item_id = ? ORDER BY created_at DESC LIMIT ?").all(input.factoryItemId, limit) as DashboardAuditEvent[];
  }
  return db.prepare("SELECT * FROM dashboard_audit_events ORDER BY created_at DESC LIMIT ?").all(limit) as DashboardAuditEvent[];
}
