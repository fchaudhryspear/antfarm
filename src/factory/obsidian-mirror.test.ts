import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { migrateDb } from "../db.js";
import {
  appendFactoryEvent,
  createFactoryItem,
  createFactoryRun,
  recordFactoryArtifact,
  recordFactoryContextPack,
} from "./store.js";
import { writeObsidianFactoryMirror } from "./obsidian-mirror.js";

function memoryDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  migrateDb(db);
  return db;
}

describe("obsidian factory mirror", () => {
  it("writes a provenance-backed synthesis note and audit event", () => {
    const db = memoryDb();
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "obsidian-mirror-"));
    const item = createFactoryItem({
      id: "fi_obsidian",
      title: "Add Obsidian Mirror",
      repo: "example/repo",
      issueUrl: "https://linear.app/fasoc/issue/ADP-390",
    }, db);
    const run = createFactoryRun({ id: "fr_obsidian", factoryItemId: item.id, workflowId: "feature-dev-v1" }, db);
    recordFactoryContextPack({
      id: "cp_obsidian",
      factoryItemId: item.id,
      factoryRunId: run.id,
      stage: "review",
      agentRole: "codex",
      path: "/tmp/context-pack",
      checksum: "pack123",
      manifest: { sources: [{ relativePath: "src/factory/store.ts", checksum: "abc123" }] },
    }, db);
    recordFactoryArtifact({
      factoryItemId: item.id,
      factoryRunId: run.id,
      artifactType: "summary",
      title: "Run summary",
      pathOrUrl: "https://example.test/artifact",
    }, db);
    appendFactoryEvent({
      factoryItemId: item.id,
      factoryRunId: run.id,
      eventType: "agent.completed",
      payload: { token: "secret_should_not_render" },
    }, db);

    const result = writeObsidianFactoryMirror({ factoryItemId: item.id, outputRoot, actor: "codex" }, db);
    const note = fs.readFileSync(result.notePath, "utf-8");

    assert.match(note, /mirror_kind: synthesis/);
    assert.match(note, /runtime_truth: false/);
    assert.match(note, /factory_item_id: "fi_obsidian"/);
    assert.match(note, /workflow_run_id: "fr_obsidian"/);
    assert.match(note, /work_unit_id: null/);
    assert.match(note, /context_pack_id: "cp_obsidian"/);
    assert.match(note, /src\/factory\/store\.ts#abc123/);
    assert.doesNotMatch(note, /secret_should_not_render/);
    assert.equal(result.redactionStatus, "clean");

    const rows = db.prepare("SELECT * FROM obsidian_mirror_events WHERE factory_item_id = ?").all(item.id);
    assert.equal(rows.length, 1);
    const events = db.prepare("SELECT * FROM factory_events WHERE event_type = 'obsidian_mirror.written'").all();
    assert.equal(events.length, 1);
  });

  it("redacts obvious secrets before writing markdown", () => {
    const db = memoryDb();
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "obsidian-mirror-"));
    const item = createFactoryItem({
      id: "fi_secret",
      title: "Token api_key=abc123",
      description: "Bearer supersecrettoken",
    }, db);
    recordFactoryArtifact({
      factoryItemId: item.id,
      artifactType: "summary",
      title: "Sensitive URL",
      pathOrUrl: "https://example.test?token=artifactsecret",
    }, db);

    const result = writeObsidianFactoryMirror({ factoryItemId: item.id, outputRoot }, db);
    const note = fs.readFileSync(result.notePath, "utf-8");

    assert.equal(result.redactionStatus, "redacted");
    assert.match(note, /\[REDACTED\]/);
    assert.doesNotMatch(note, /abc123/);
    assert.doesNotMatch(note, /supersecrettoken/);
    assert.doesNotMatch(note, /artifactsecret/);
    assert.doesNotMatch(result.notePath, /abc123/);
  });

  it("redacts PII and finance identifiers before writing markdown", () => {
    const db = memoryDb();
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "obsidian-mirror-"));
    const item = createFactoryItem({
      id: "fi_sensitive_content",
      title: "Sensitive mirror content",
      description: "Contact person@example.com for acct 1234567890 and SSN 123-45-6789.",
    }, db);

    const result = writeObsidianFactoryMirror({ factoryItemId: item.id, outputRoot }, db);
    const note = fs.readFileSync(result.notePath, "utf-8");

    assert.equal(result.redactionStatus, "redacted");
    assert.match(note, /\[REDACTED_EMAIL]/);
    assert.match(note, /\[REDACTED_ACCOUNT_NUMBER]/);
    assert.match(note, /\[REDACTED_SSN]/);
    assert.doesNotMatch(note, /person@example\.com/);
    assert.doesNotMatch(note, /1234567890/);
    assert.doesNotMatch(note, /123-45-6789/);
  });
});
