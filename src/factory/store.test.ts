import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { migrateDb } from "../db.js";
import {
  appendFactoryEvent,
  createFactoryItem,
  createFactoryRun,
  getFactoryItemStatus,
  recordFactoryAgentRun,
  recordFactoryArtifact,
  recordFactoryContextPack,
  upsertFactoryGate,
} from "./store.js";

function memoryDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  migrateDb(db);
  return db;
}

describe("factory store", () => {
  it("creates a factory item and ledger records", () => {
    const db = memoryDb();
    const item = createFactoryItem({
      tenantId: "flobase",
      title: "Add billing export",
      repo: "example/repo",
      issueUrl: "https://linear.app/fasoc/issue/ADP-385",
      source: "linear",
      priority: "P1",
      requestedBy: "faisal",
    }, db);

    const run = createFactoryRun({
      tenantId: "flobase",
      factoryItemId: item.id,
      workflowId: "swarm-code-review-v3",
      modelPolicy: "default",
      budget: { max_usd: 10 },
    }, db);
    const contextPack = recordFactoryContextPack({
      tenantId: "flobase",
      factoryItemId: item.id,
      factoryRunId: run.id,
      stage: "review",
      agentRole: "code-quality",
      path: "/tmp/context-pack",
      checksum: "abc123",
      manifest: { pack_checksum: "abc123" },
    }, db);
    const agentRun = recordFactoryAgentRun({
      tenantId: "flobase",
      factoryRunId: run.id,
      contextPackId: contextPack.id,
      agentRole: "analysis",
      agentName: "code-quality",
      status: "completed",
      model: "ollama-cloud/qwen3.5:397b-cloud",
      tokenUsage: { input: 100, output: 50 },
      resultSummary: "No blockers.",
    }, db);
    recordFactoryArtifact({
      tenantId: "flobase",
      factoryItemId: item.id,
      factoryRunId: run.id,
      agentRunId: agentRun.id,
      artifactType: "review",
      title: "Code review",
      pathOrUrl: "/tmp/review.md",
    }, db);
    upsertFactoryGate({
      factoryItemId: item.id,
      factoryRunId: run.id,
      gateType: "tests_passed",
      status: "passed",
      evidenceUrl: "https://ci.example/run/1",
    }, db);
    appendFactoryEvent({
      tenantId: "flobase",
      factoryItemId: item.id,
      factoryRunId: run.id,
      eventType: "gate.passed",
      actor: "codex",
      payload: { gate: "tests_passed" },
    }, db);

    const status = getFactoryItemStatus(item.id, db);
    assert.equal(status.item?.title, "Add billing export");
    assert.equal(status.item?.tenant_id, "flobase");
    assert.equal(status.runs.length, 1);
    assert.equal(status.runs[0].tenant_id, "flobase");
    assert.equal(status.contextPacks.length, 1);
    assert.equal(status.contextPacks[0].tenant_id, "flobase");
    assert.equal(status.agentRuns.length, 1);
    assert.equal(status.agentRuns[0].tenant_id, "flobase");
    assert.equal(status.agentRuns[0].context_pack_id, contextPack.id);
    assert.equal(status.artifacts.length, 1);
    assert.equal(status.artifacts[0].tenant_id, "flobase");
    assert.equal(status.gates.length, 1);
    assert.equal(status.events.length, 2);
    assert.ok(status.events.every((event) => event.tenant_id === "flobase"));
  });
});
