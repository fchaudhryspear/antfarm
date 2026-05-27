import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { getDb } from "../db.js";

export type FactoryItemStatus = "queued" | "running" | "blocked" | "done" | "canceled";
export type FactoryRunStatus = "pending" | "running" | "blocked" | "completed" | "failed" | "canceled";
export type FactoryGateStatus = "pending" | "passed" | "failed" | "waived";
export type RollbackPlanStatus = "draft" | "approved" | "retired";
export type DeploymentStatus = "succeeded" | "failed" | "blocked";
export type SmokeTestStatus = "passed" | "failed";
export type MonitoringStatus = "clean" | "alert";
export type ProductionGateRoute =
  | "smoke_test"
  | "monitor"
  | "release_complete"
  | "rollback_required"
  | "release_blocked"
  | "manual_review";
export type ProductionFailureCause =
  | "deploy_failed"
  | "smoke_test_failed"
  | "monitoring_alert"
  | "rollback_plan_missing"
  | null;

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
  redaction_ruleset_version: string | null;
  created_at: string;
};

export type RollbackPlan = {
  id: string;
  factory_item_id: string;
  factory_run_id: string | null;
  environment: string;
  strategy: string;
  trigger_conditions_json: string;
  steps_json: string;
  verification_json: string;
  approvers_json: string;
  status: RollbackPlanStatus;
  created_at: string;
  updated_at: string;
};

export type DeploymentEvent = {
  id: string;
  factory_item_id: string;
  factory_run_id: string | null;
  rollback_plan_id: string | null;
  retry_of_deployment_event_id: string | null;
  environment: string;
  commit_sha: string | null;
  version: string | null;
  status: DeploymentStatus;
  side_effecting_action: number;
  manual_approval_id: string | null;
  failure_cause: ProductionFailureCause;
  next_route: ProductionGateRoute;
  evidence_url: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
};

export type SmokeTestRun = {
  id: string;
  factory_item_id: string;
  factory_run_id: string | null;
  deployment_event_id: string | null;
  suite_name: string;
  status: SmokeTestStatus;
  failure_cause: ProductionFailureCause;
  next_route: ProductionGateRoute;
  evidence_url: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
};

export type MonitoringObservation = {
  id: string;
  factory_item_id: string;
  factory_run_id: string | null;
  deployment_event_id: string | null;
  status: MonitoringStatus;
  window_minutes: number;
  failure_cause: ProductionFailureCause;
  next_route: ProductionGateRoute;
  evidence_url: string | null;
  observed_at: string;
  created_at: string;
};

export type DashboardAuditEvent = {
  id: string;
  factory_item_id: string | null;
  factory_run_id: string | null;
  operator: string;
  command: string;
  target_type: string;
  target_id: string;
  status: string;
  payload_json: string;
  created_at: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function jsonOrNull(value: unknown): string | null {
  return value === undefined || value === null ? null : JSON.stringify(value);
}

function requireNonEmptyArray(name: string, value: string[]): void {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => item.trim().length === 0)) {
    throw new Error(`RollbackPlan requires at least one ${name}`);
  }
}

function routeForFailedProductionGate(rollbackPlanId?: string | null): ProductionGateRoute {
  return rollbackPlanId ? "rollback_required" : "release_blocked";
}

function rollbackPlanForDeployment(deploymentEventId: string | undefined, db: DatabaseSync): string | null {
  if (!deploymentEventId) return null;
  const deployment = db.prepare("SELECT rollback_plan_id FROM deployment_events WHERE id = ?").get(deploymentEventId) as { rollback_plan_id: string | null } | undefined;
  if (!deployment) throw new Error("deploymentEventId does not reference a deployment event");
  return deployment.rollback_plan_id;
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
  redactionRulesetVersion?: string;
}, db: DatabaseSync = getDb()): FactoryContextPack {
  const id = input.id ?? crypto.randomUUID();
  db.prepare(`
    INSERT INTO factory_context_packs (
      id, factory_item_id, factory_run_id, stage, agent_role, path, checksum,
      manifest_json, redaction_ruleset_version, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.factoryItemId,
    input.factoryRunId ?? null,
    input.stage,
    input.agentRole,
    input.path,
    input.checksum,
    JSON.stringify(input.manifest),
    input.redactionRulesetVersion ?? (input.manifest as { redaction_ruleset_version?: string }).redaction_ruleset_version ?? null,
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

export function appendDashboardAuditEvent(input: {
  id?: string;
  factoryItemId?: string;
  factoryRunId?: string;
  operator: string;
  command: string;
  targetType: string;
  targetId: string;
  status: string;
  payload?: unknown;
}, db: DatabaseSync = getDb()): DashboardAuditEvent {
  const id = input.id ?? crypto.randomUUID();
  db.prepare(`
    INSERT INTO dashboard_audit_events (
      id, factory_item_id, factory_run_id, operator, command, target_type,
      target_id, status, payload_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.factoryItemId ?? null,
    input.factoryRunId ?? null,
    input.operator,
    input.command,
    input.targetType,
    input.targetId,
    input.status,
    JSON.stringify(input.payload ?? {}),
    nowIso(),
  );
  return db.prepare("SELECT * FROM dashboard_audit_events WHERE id = ?").get(id) as DashboardAuditEvent;
}

export function recordRollbackPlan(input: {
  id?: string;
  factoryItemId: string;
  factoryRunId?: string;
  environment: string;
  strategy: string;
  triggerConditions: string[];
  steps: string[];
  verification: string[];
  approvers: string[];
  status?: RollbackPlanStatus;
}, db: DatabaseSync = getDb()): RollbackPlan {
  if (input.environment.trim().length === 0) throw new Error("RollbackPlan requires environment");
  if (input.strategy.trim().length === 0) throw new Error("RollbackPlan requires strategy");
  requireNonEmptyArray("trigger condition", input.triggerConditions);
  requireNonEmptyArray("rollback step", input.steps);
  requireNonEmptyArray("verification step", input.verification);
  requireNonEmptyArray("approver", input.approvers);

  const id = input.id ?? crypto.randomUUID();
  const now = nowIso();
  db.prepare(`
    INSERT INTO rollback_plans (
      id, factory_item_id, factory_run_id, environment, strategy,
      trigger_conditions_json, steps_json, verification_json, approvers_json,
      status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.factoryItemId,
    input.factoryRunId ?? null,
    input.environment,
    input.strategy,
    JSON.stringify(input.triggerConditions),
    JSON.stringify(input.steps),
    JSON.stringify(input.verification),
    JSON.stringify(input.approvers),
    input.status ?? "draft",
    now,
    now,
  );
  appendFactoryEvent({
    factoryItemId: input.factoryItemId,
    factoryRunId: input.factoryRunId,
    eventType: "production.rollback_plan.recorded",
    payload: { rollback_plan_id: id, environment: input.environment, status: input.status ?? "draft" },
  }, db);
  return db.prepare("SELECT * FROM rollback_plans WHERE id = ?").get(id) as RollbackPlan;
}

export function recordDeploymentEvent(input: {
  id?: string;
  factoryItemId: string;
  factoryRunId?: string;
  rollbackPlanId?: string;
  retryOfDeploymentEventId?: string;
  environment: string;
  commitSha?: string;
  version?: string;
  status: DeploymentStatus;
  sideEffectingAction?: boolean;
  manualApprovalId?: string;
  evidenceUrl?: string;
  startedAt?: string;
  completedAt?: string;
}, db: DatabaseSync = getDb()): DeploymentEvent {
  const sideEffectingAction = input.sideEffectingAction === false ? 0 : 1;
  if (input.retryOfDeploymentEventId) {
    const prior = db.prepare("SELECT * FROM deployment_events WHERE id = ?").get(input.retryOfDeploymentEventId) as DeploymentEvent | undefined;
    if (!prior) throw new Error("retryOfDeploymentEventId does not reference a deployment event");
    if ((prior.side_effecting_action === 1 || sideEffectingAction === 1) && !input.manualApprovalId) {
      throw new Error("Side-effecting deployment retries require manual approval; auto-retry is not allowed");
    }
  }

  const id = input.id ?? crypto.randomUUID();
  const now = nowIso();
  const failureCause: ProductionFailureCause = input.status === "failed" ? "deploy_failed" : null;
  const nextRoute: ProductionGateRoute =
    input.status === "succeeded" ? "smoke_test"
      : input.status === "failed" ? routeForFailedProductionGate(input.rollbackPlanId)
        : "manual_review";

  db.prepare(`
    INSERT INTO deployment_events (
      id, factory_item_id, factory_run_id, rollback_plan_id, retry_of_deployment_event_id,
      environment, commit_sha, version, status, side_effecting_action,
      manual_approval_id, failure_cause, next_route, evidence_url,
      started_at, completed_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.factoryItemId,
    input.factoryRunId ?? null,
    input.rollbackPlanId ?? null,
    input.retryOfDeploymentEventId ?? null,
    input.environment,
    input.commitSha ?? null,
    input.version ?? null,
    input.status,
    sideEffectingAction,
    input.manualApprovalId ?? null,
    failureCause,
    nextRoute,
    input.evidenceUrl ?? null,
    input.startedAt ?? now,
    input.completedAt ?? now,
    now,
  );
  upsertFactoryGate({
    factoryItemId: input.factoryItemId,
    factoryRunId: input.factoryRunId,
    gateType: "production_deploy",
    status: input.status === "succeeded" ? "passed" : "failed",
    evidenceUrl: input.evidenceUrl,
  }, db);
  appendFactoryEvent({
    factoryItemId: input.factoryItemId,
    factoryRunId: input.factoryRunId,
    eventType: `production.deploy.${input.status}`,
    payload: { deployment_event_id: id, failure_cause: failureCause, next_route: nextRoute },
  }, db);
  return db.prepare("SELECT * FROM deployment_events WHERE id = ?").get(id) as DeploymentEvent;
}

export function recordSmokeTestRun(input: {
  id?: string;
  factoryItemId: string;
  factoryRunId?: string;
  deploymentEventId?: string;
  rollbackPlanId?: string;
  suiteName: string;
  status: SmokeTestStatus;
  evidenceUrl?: string;
  startedAt?: string;
  completedAt?: string;
}, db: DatabaseSync = getDb()): SmokeTestRun {
  const id = input.id ?? crypto.randomUUID();
  const now = nowIso();
  const rollbackPlanId = input.rollbackPlanId ?? rollbackPlanForDeployment(input.deploymentEventId, db);
  const failureCause: ProductionFailureCause = input.status === "failed" ? "smoke_test_failed" : null;
  const nextRoute: ProductionGateRoute = input.status === "passed" ? "monitor" : routeForFailedProductionGate(rollbackPlanId);
  db.prepare(`
    INSERT INTO smoke_test_runs (
      id, factory_item_id, factory_run_id, deployment_event_id, suite_name,
      status, failure_cause, next_route, evidence_url, started_at, completed_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.factoryItemId,
    input.factoryRunId ?? null,
    input.deploymentEventId ?? null,
    input.suiteName,
    input.status,
    failureCause,
    nextRoute,
    input.evidenceUrl ?? null,
    input.startedAt ?? now,
    input.completedAt ?? now,
    now,
  );
  upsertFactoryGate({
    factoryItemId: input.factoryItemId,
    factoryRunId: input.factoryRunId,
    gateType: "production_smoke",
    status: input.status === "passed" ? "passed" : "failed",
    evidenceUrl: input.evidenceUrl,
  }, db);
  appendFactoryEvent({
    factoryItemId: input.factoryItemId,
    factoryRunId: input.factoryRunId,
    eventType: `production.smoke.${input.status}`,
    payload: { smoke_test_run_id: id, failure_cause: failureCause, next_route: nextRoute },
  }, db);
  return db.prepare("SELECT * FROM smoke_test_runs WHERE id = ?").get(id) as SmokeTestRun;
}

export function recordMonitoringObservation(input: {
  id?: string;
  factoryItemId: string;
  factoryRunId?: string;
  deploymentEventId?: string;
  rollbackPlanId?: string;
  status: MonitoringStatus;
  windowMinutes?: number;
  evidenceUrl?: string;
  observedAt?: string;
}, db: DatabaseSync = getDb()): MonitoringObservation {
  const id = input.id ?? crypto.randomUUID();
  const now = nowIso();
  const rollbackPlanId = input.rollbackPlanId ?? rollbackPlanForDeployment(input.deploymentEventId, db);
  const failureCause: ProductionFailureCause = input.status === "alert" ? "monitoring_alert" : null;
  const nextRoute: ProductionGateRoute = input.status === "clean" ? "release_complete" : routeForFailedProductionGate(rollbackPlanId);
  db.prepare(`
    INSERT INTO monitoring_observations (
      id, factory_item_id, factory_run_id, deployment_event_id, status,
      window_minutes, failure_cause, next_route, evidence_url, observed_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.factoryItemId,
    input.factoryRunId ?? null,
    input.deploymentEventId ?? null,
    input.status,
    input.windowMinutes ?? 15,
    failureCause,
    nextRoute,
    input.evidenceUrl ?? null,
    input.observedAt ?? now,
    now,
  );
  upsertFactoryGate({
    factoryItemId: input.factoryItemId,
    factoryRunId: input.factoryRunId,
    gateType: "production_monitor",
    status: input.status === "clean" ? "passed" : "failed",
    evidenceUrl: input.evidenceUrl,
  }, db);
  appendFactoryEvent({
    factoryItemId: input.factoryItemId,
    factoryRunId: input.factoryRunId,
    eventType: `production.monitor.${input.status}`,
    payload: { monitoring_observation_id: id, failure_cause: failureCause, next_route: nextRoute },
  }, db);
  return db.prepare("SELECT * FROM monitoring_observations WHERE id = ?").get(id) as MonitoringObservation;
}

export function getProductionGateState(factoryItemId: string, db: DatabaseSync = getDb()): {
  rollbackPlans: RollbackPlan[];
  deploymentEvents: DeploymentEvent[];
  smokeTestRuns: SmokeTestRun[];
  monitoringObservations: MonitoringObservation[];
} {
  return {
    rollbackPlans: db.prepare("SELECT * FROM rollback_plans WHERE factory_item_id = ? ORDER BY created_at ASC").all(factoryItemId) as RollbackPlan[],
    deploymentEvents: db.prepare("SELECT * FROM deployment_events WHERE factory_item_id = ? ORDER BY created_at ASC").all(factoryItemId) as DeploymentEvent[],
    smokeTestRuns: db.prepare("SELECT * FROM smoke_test_runs WHERE factory_item_id = ? ORDER BY created_at ASC").all(factoryItemId) as SmokeTestRun[],
    monitoringObservations: db.prepare("SELECT * FROM monitoring_observations WHERE factory_item_id = ? ORDER BY created_at ASC").all(factoryItemId) as MonitoringObservation[],
  };
}

export function getFactoryItemStatus(factoryItemId: string, db: DatabaseSync = getDb()): {
  item: FactoryItem | null;
  runs: FactoryRun[];
  agentRuns: FactoryAgentRun[];
  contextPacks: FactoryContextPack[];
  gates: Array<Record<string, unknown>>;
  artifacts: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
  auditEvents: DashboardAuditEvent[];
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
    auditEvents: db.prepare("SELECT * FROM dashboard_audit_events WHERE factory_item_id = ? ORDER BY created_at ASC").all(factoryItemId) as DashboardAuditEvent[],
  };
}
