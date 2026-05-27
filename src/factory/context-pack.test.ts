import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { migrateDb } from "../db.js";
import { generateContextPack } from "./context-pack.js";
import { createFactoryItem, createFactoryRun, recordFactoryAgentRun, recordFactoryContextPack } from "./store.js";

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "antfarm-context-pack-"));
}

function memoryDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  migrateDb(db);
  return db;
}

describe("context pack generator", () => {
  it("creates deterministic pack files and manifest provenance", () => {
    const root = tempDir();
    const repo = path.join(root, "repo");
    const outputRoot = path.join(root, "packs");
    fs.mkdirSync(path.join(repo, "src"), { recursive: true });
    fs.writeFileSync(path.join(repo, "src", "b.ts"), "export const b = 2;\n");
    fs.writeFileSync(path.join(repo, "src", "a.ts"), "export const a = 1;\n");

    const db = memoryDb();
    const item = createFactoryItem({ id: "fi_1", title: "Build context packs", repo: "example/repo" }, db);
    const run = createFactoryRun({ id: "fr_1", factoryItemId: item.id, workflowId: "feature-dev-v1" }, db);

    const first = generateContextPack({
      factoryItem: item,
      factoryRunId: run.id,
      workflowId: run.workflow_id,
      stage: "requirements",
      agentRole: "product-strategist",
      task: "Define the feature",
      repoPath: repo,
      sourceFiles: ["src/b.ts", "src/a.ts"],
      priorArtifacts: [{ artifact_type: "decision", title: "Boundary", path_or_url: "obsidian://boundary" }],
      constraints: { source_of_truth: "antfarm" },
      outputRoot,
    });
    const second = generateContextPack({
      factoryItem: item,
      factoryRunId: run.id,
      workflowId: run.workflow_id,
      stage: "requirements",
      agentRole: "product-strategist",
      task: "Define the feature",
      repoPath: repo,
      sourceFiles: ["src/a.ts", "src/b.ts"],
      priorArtifacts: [{ artifact_type: "decision", title: "Boundary", path_or_url: "obsidian://boundary" }],
      constraints: { source_of_truth: "antfarm" },
      outputRoot,
    });

    assert.equal(first.checksum, second.checksum);
    assert.deepEqual(first.manifest.sources.map((source) => source.relativePath), ["src/a.ts", "src/b.ts"]);
    assert.ok(fs.existsSync(path.join(first.path, "manifest.json")));
    assert.ok(fs.existsSync(path.join(first.path, "prompt.md")));
    assert.ok(fs.existsSync(path.join(first.path, "sources", "src", "a.ts")));

    const contextPack = recordFactoryContextPack({
      factoryItemId: item.id,
      factoryRunId: run.id,
      stage: first.manifest.stage,
      agentRole: first.manifest.agent_role,
      path: first.path,
      checksum: first.checksum,
      manifest: first.manifest,
    }, db);
    const agentRun = recordFactoryAgentRun({
      factoryRunId: run.id,
      contextPackId: contextPack.id,
      agentRole: "analysis",
      agentName: "product-strategist",
    }, db);
    assert.equal(agentRun.context_pack_id, contextPack.id);
  });

  it("redacts prior artifact metadata from agent-facing pack files", () => {
    const root = tempDir();
    const outputRoot = path.join(root, "packs");
    const db = memoryDb();
    const item = createFactoryItem({ id: "fi_redact_artifact", title: "Redact artifact metadata" }, db);

    const pack = generateContextPack({
      factoryItem: item,
      stage: "requirements",
      agentRole: "product-strategist",
      task: "Define the feature",
      priorArtifacts: [{
        artifact_type: "summary",
        title: "person@example.com",
        path_or_url: "https://example.test/a?token=artifactsecret",
      }],
      outputRoot,
      redactionRulesetVersion: "pii_v1",
    });

    const manifest = fs.readFileSync(path.join(pack.path, "manifest.json"), "utf-8");
    const prompt = fs.readFileSync(path.join(pack.path, "prompt.md"), "utf-8");
    const priorArtifactManifest = fs.readFileSync(path.join(pack.path, "prior-artifacts", "manifest.json"), "utf-8");

    assert.equal(pack.manifest.prior_artifacts[0].title, "[REDACTED_EMAIL]");
    assert.match(pack.manifest.prior_artifacts[0].path_or_url, /\[REDACTED_SECRET]/);
    assert.deepEqual(pack.manifest.redactions, ["email", "secret"]);
    for (const content of [manifest, prompt, priorArtifactManifest]) {
      assert.doesNotMatch(content, /person@example\.com/);
      assert.doesNotMatch(content, /artifactsecret/);
    }
  });

  it("rejects symlinked source files that resolve outside repo_path", () => {
    const root = tempDir();
    const repo = path.join(root, "repo");
    const outputRoot = path.join(root, "packs");
    const outsideSecret = path.join(root, "outside-secret.txt");
    fs.mkdirSync(repo, { recursive: true });
    fs.writeFileSync(outsideSecret, "external secret\n");
    fs.symlinkSync(outsideSecret, path.join(repo, "linked-secret"));

    const db = memoryDb();
    const item = createFactoryItem({ id: "fi_symlink_escape", title: "Reject symlink escape" }, db);

    assert.throws(
      () => generateContextPack({
        factoryItem: item,
        stage: "requirements",
        agentRole: "product-strategist",
        task: "Define the feature",
        repoPath: repo,
        sourceFiles: ["linked-secret"],
        outputRoot,
      }),
      /Context pack source must be inside repo_path/,
    );
  });
});
