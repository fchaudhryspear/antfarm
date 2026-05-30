import { describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { DatabaseSync } from "node:sqlite";
import { migrateDb } from "../db.js";
import {
  approveFactoryGate,
  createOrLinkFactoryItem,
  pauseFactoryRun,
} from "../factory/operator.js";
import {
  createFactoryRun,
  recordDeploymentEvent,
  recordFactoryArtifact,
  recordRollbackPlan,
} from "../factory/store.js";
import {
  getFactoryDashboardAggregate,
  getFactoryDashboardSnapshot,
  getFactoryTenantMetadata,
  startDashboard,
} from "./dashboard.js";

function memoryDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  migrateDb(db);
  return db;
}

describe("factory operator dashboard snapshot", () => {
  it("binds to loopback and does not expose wildcard CORS by default", () => {
    const originalListen = http.Server.prototype.listen;
    const listenArgs: unknown[][] = [];
    (http.Server.prototype.listen as unknown) = function (this: http.Server, ...args: unknown[]) {
      listenArgs.push(args);
      return this;
    };

    try {
      const server = startDashboard(0);
      assert.equal(listenArgs[0][0], 0);
      assert.equal(listenArgs[0][1], "127.0.0.1");

      let headers: http.OutgoingHttpHeaders = {};
      const response = {
        writeHead(_status: number, responseHeaders: http.OutgoingHttpHeaders) {
          headers = responseHeaders;
        },
        end() {},
      } as http.ServerResponse;
      server.emit("request", { url: "/api/workflows" } as http.IncomingMessage, response);
      assert.equal(headers["Access-Control-Allow-Origin"], undefined);
    } finally {
      http.Server.prototype.listen = originalListen;
    }
  });

  it("maps ledger entities into dashboard query contract", () => {
    const db = memoryDb();
    const intake = createOrLinkFactoryItem({
      tenantId: "flobase",
      title: "Dashboard fixture workflow",
      repo: "fchaudhryspear/antfarm",
      source: "linear",
      priority: "P3",
      operator: "hermes",
      externalRef: "ADP-392",
    }, db);
    const run = createFactoryRun({
      tenantId: "flobase",
      factoryItemId: intake.item.id,
      workflowId: "agent-swarm-v3-dashboard",
      modelPolicy: "balanced",
      budget: { max_usd: 25 },
    }, db);
    pauseFactoryRun({ factoryRunId: run.id, expectedUpdatedAt: run.updated_at, reason: "dashboard fixture pause" }, db);
    approveFactoryGate({
      factoryItemId: intake.item.id,
      factoryRunId: run.id,
      gateType: "review_approved",
      evidenceUrl: "https://github.com/fchaudhryspear/antfarm/pull/7",
      operator: "hermes",
    }, db);
    recordFactoryArtifact({
      factoryItemId: intake.item.id,
      factoryRunId: run.id,
      artifactType: "pull_request",
      title: "PR #7",
      pathOrUrl: "https://github.com/fchaudhryspear/antfarm/pull/7",
    }, db);
    recordFactoryArtifact({
      factoryItemId: intake.item.id,
      factoryRunId: run.id,
      artifactType: "obsidian_mirror",
      title: "Obsidian synthesis",
      pathOrUrl: "obsidian://open?vault=Factory&file=ADP-392",
    }, db);
    const rollback = recordRollbackPlan({
      factoryItemId: intake.item.id,
      factoryRunId: run.id,
      environment: "production",
      strategy: "restore previous release",
      triggerConditions: ["deploy failed"],
      steps: ["restore"],
      verification: ["health check"],
      approvers: ["atlas"],
      status: "approved",
    }, db);
    recordDeploymentEvent({
      factoryItemId: intake.item.id,
      factoryRunId: run.id,
      rollbackPlanId: rollback.id,
      environment: "production",
      status: "succeeded",
      sideEffectingAction: true,
      evidenceUrl: "https://github.com/fchaudhryspear/antfarm/actions/runs/1",
    }, db);

    const snapshot = getFactoryDashboardSnapshot(db, { tenantId: "flobase" });
    assert.equal(snapshot.status, 200);
    assert.equal(snapshot.scope, "tenant");
    assert.equal(snapshot.tenantId, "flobase");
    assert.equal(snapshot.queue.length, 1);
    assert.equal(snapshot.activeRuns.length, 1);
    assert.equal(snapshot.items.length, 1);
    assert.equal(snapshot.items[0].item.id, intake.item.id);
    assert.equal(snapshot.items[0].latestRun?.status, "blocked");
    assert.equal(snapshot.items[0].gates.length, 2);
    assert.equal(snapshot.items[0].artifacts.length, 2);
    assert.equal(snapshot.items[0].auditEvents.length, 3);
    assert.equal(snapshot.items[0].production.deploymentEvents.length, 1);
    assert.equal(snapshot.items[0].recoveryControls?.canResume, true);
    assert.equal(snapshot.items[0].recoveryControls?.canRetry, true);
    assert.equal(snapshot.items[0].synthesisLinks.length, 1);
    assert.equal(snapshot.timeline.some((event) => event.source === "dashboard_audit_event"), true);
    assert.equal(snapshot.budget.maxUsd, 25);
  });

  it("defaults to tenant-scoped dashboard reads and denies unauthorized aggregate leakage", () => {
    const db = memoryDb();
    const flobase = createOrLinkFactoryItem({
      tenantId: "flobase",
      title: "Flobase tenant item",
      repo: "fchaudhryspear/antfarm",
      source: "linear",
      priority: "P2",
      operator: "simon",
      externalRef: "ADP-429-FLOBASE",
    }, db);
    createFactoryRun({
      tenantId: "flobase",
      factoryItemId: flobase.item.id,
      workflowId: "agent-swarm-v3-dashboard",
      status: "running",
      budget: { max_usd: 10 },
    }, db);

    const credologi = createOrLinkFactoryItem({
      tenantId: "credologi",
      title: "Credologi tenant item",
      repo: "fchaudhryspear/antfarm",
      source: "linear",
      priority: "P2",
      operator: "simon",
      externalRef: "ADP-429-CREDOLOGI",
    }, db);
    createFactoryRun({
      tenantId: "credologi",
      factoryItemId: credologi.item.id,
      workflowId: "agent-swarm-v3-dashboard",
      status: "running",
      budget: { max_usd: 90 },
    }, db);

    const missingTenant = getFactoryDashboardSnapshot(db);
    assert.equal(missingTenant.status, 400);
    assert.equal(missingTenant.error, "missing_tenant_scope");

    const unauthorizedTenant = getFactoryDashboardSnapshot(db, {
      tenantId: "credologi",
      actorRole: "operator",
      authorizedTenants: ["flobase"],
    });
    assert.equal(unauthorizedTenant.status, 404);
    assert.equal(unauthorizedTenant.error, "tenant_not_authorized");

    const flobaseSnapshot = getFactoryDashboardSnapshot(db, {
      tenantId: "flobase",
      actorRole: "operator",
      authorizedTenants: ["flobase"],
    });
    assert.equal(flobaseSnapshot.status, 200);
    assert.equal(flobaseSnapshot.items.length, 1);
    assert.equal(flobaseSnapshot.items[0].item.tenant_id, "flobase");
    assert.equal(flobaseSnapshot.items[0].item.title, "Flobase tenant item");
    assert.equal(flobaseSnapshot.timeline.every((event) => event.factoryItemId === flobase.item.id), true);
    assert.equal(flobaseSnapshot.budget.maxUsd, 10);

    const deniedAggregate = getFactoryDashboardAggregate(db, { actorRole: "operator" });
    assert.equal(deniedAggregate.status, 403);
    assert.equal(deniedAggregate.error, "aggregate_scope_requires_founder");

    const founderAggregate = getFactoryDashboardAggregate(db, { actorRole: "founder" });
    assert.equal(founderAggregate.status, 200);
    assert.equal(founderAggregate.scope, "aggregate_metadata");
    assert.equal("items" in founderAggregate, false);
    assert.equal("timeline" in founderAggregate, false);
    const flobaseMeta = founderAggregate.tenants.find((tenant) => tenant.id === "flobase");
    const credologiMeta = founderAggregate.tenants.find((tenant) => tenant.id === "credologi");
    assert.equal(flobaseMeta?.item_count, 1);
    assert.equal(credologiMeta?.item_count, 1);

    const tenantMetadata = getFactoryTenantMetadata(db, {
      tenantId: "flobase",
      actorRole: "operator",
      authorizedTenants: ["flobase"],
    });
    assert.equal(tenantMetadata.status, 200);
    assert.deepEqual(Object.keys(tenantMetadata.tenants[0]).sort(), ["compliance_class", "display_name", "id", "status"]);
    assert.equal(tenantMetadata.tenants[0].id, "flobase");

    const deniedMetadata = getFactoryTenantMetadata(db, {
      tenantId: "credologi",
      actorRole: "operator",
      authorizedTenants: ["flobase"],
    });
    assert.equal(deniedMetadata.status, 404);
    assert.equal(deniedMetadata.error, "tenant_not_authorized");
  });
});
