import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { FactoryItem } from "./store.js";
import { redactText, type RedactionRulesetVersion } from "./redaction.js";

export type ContextPackSource = {
  originalPath: string;
  relativePath: string;
  copiedPath: string;
  checksum: string;
  bytes: number;
};

export type ContextPackPriorArtifact = {
  artifact_type: string;
  title: string;
  path_or_url: string;
  checksum?: string | null;
};

export type ContextPackManifest = {
  schema_version: "1.0";
  factory_item: {
    id: string;
    title: string;
    description: string;
    repo: string | null;
    issue_url: string | null;
    priority: string;
    lifecycle_stage: string;
  };
  factory_run_id: string | null;
  workflow_id: string | null;
  stage: string;
  agent_role: string;
  task: string;
  repo_path: string | null;
  constraints: Record<string, string>;
  sources: ContextPackSource[];
  prior_artifacts: ContextPackPriorArtifact[];
  pack_checksum: string;
  redaction_ruleset_version: RedactionRulesetVersion;
  redactions: string[];
};

export type GeneratedContextPack = {
  path: string;
  checksum: string;
  manifest: ContextPackManifest;
};

export type GenerateContextPackInput = {
  factoryItem: FactoryItem;
  factoryRunId?: string;
  workflowId?: string;
  stage: string;
  agentRole: string;
  task: string;
  repoPath?: string;
  sourceFiles?: string[];
  priorArtifacts?: ContextPackPriorArtifact[];
  constraints?: Record<string, string>;
  outputRoot?: string;
  redactionRulesetVersion?: RedactionRulesetVersion;
};

function sha256(value: Buffer | string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`);
  return `{${entries.join(",")}}`;
}

function normalizeForManifest(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

function assertInsideRepo(repoPath: string, absPath: string): string {
  const relative = path.relative(repoPath, absPath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Context pack source must be inside repo_path: ${absPath}`);
  }
  return normalizeForManifest(relative);
}

function resolveSources(repoPath: string | undefined, sourceFiles: string[] | undefined): ContextPackSource[] {
  if (!sourceFiles?.length) return [];
  if (!repoPath) throw new Error("repoPath is required when sourceFiles are provided");

  const repoAbs = path.resolve(repoPath);
  const seen = new Set<string>();
  const sources: ContextPackSource[] = [];
  for (const file of sourceFiles) {
    const absPath = path.resolve(repoAbs, file);
    const stat = fs.statSync(absPath);
    if (!stat.isFile()) throw new Error(`Context pack source is not a file: ${absPath}`);
    const relativePath = assertInsideRepo(repoAbs, absPath);
    if (seen.has(relativePath)) continue;
    seen.add(relativePath);
    const content = fs.readFileSync(absPath);
    sources.push({
      originalPath: absPath,
      relativePath,
      copiedPath: normalizeForManifest(path.join("sources", relativePath)),
      checksum: sha256(content),
      bytes: content.length,
    });
  }
  return sources.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function buildPrompt(params: {
  manifestWithoutChecksum: Omit<ContextPackManifest, "pack_checksum">;
}): string {
  const manifest = params.manifestWithoutChecksum;
  const sourceLines = manifest.sources.length > 0
    ? manifest.sources.map((source) => `- ${source.relativePath} (${source.checksum})`).join("\n")
    : "- none";
  const artifactLines = manifest.prior_artifacts.length > 0
    ? manifest.prior_artifacts.map((artifact) => `- ${artifact.artifact_type}: ${artifact.title} -> ${artifact.path_or_url}`).join("\n")
    : "- none";
  const constraintLines = Object.keys(manifest.constraints).length > 0
    ? Object.entries(manifest.constraints).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `- ${key}: ${value}`).join("\n")
    : "- none";

  return [
    "# Factory Context Pack",
    "",
    `Factory Item: ${manifest.factory_item.id}`,
    `Title: ${manifest.factory_item.title}`,
    `Stage: ${manifest.stage}`,
    `Agent Role: ${manifest.agent_role}`,
    `Workflow: ${manifest.workflow_id ?? "n/a"}`,
    "",
    "## Task",
    manifest.task,
    "",
    "## Constraints",
    constraintLines,
    "",
    "## Source Files",
    sourceLines,
    "",
    "## Prior Artifacts",
    artifactLines,
    "",
    "## Operating Rules",
    "- Treat this context pack as the exact task context for the run.",
    "- Use source files and prior artifacts listed in manifest.json as the provenance set.",
    "- If additional repo evidence is needed, record the reason in the agent output.",
    "",
  ].join("\n");
}

export function generateContextPack(input: GenerateContextPackInput): GeneratedContextPack {
  const sources = resolveSources(input.repoPath, input.sourceFiles);
  const ruleset = input.redactionRulesetVersion ?? "default_v1";
  const constraints = Object.fromEntries(Object.entries(input.constraints ?? {}).sort(([a], [b]) => a.localeCompare(b)));
  const priorArtifacts = [...(input.priorArtifacts ?? [])].sort((a, b) =>
    `${a.artifact_type}:${a.title}:${a.path_or_url}`.localeCompare(`${b.artifact_type}:${b.title}:${b.path_or_url}`)
  );

  const redactedDescription = redactText(input.factoryItem.description, ruleset);
  const redactedTask = redactText(input.task, ruleset);
  const redactions = [...new Set([...redactedDescription.redactions, ...redactedTask.redactions])].sort();

  const manifestWithoutChecksum: Omit<ContextPackManifest, "pack_checksum"> = {
    schema_version: "1.0",
    factory_item: {
      id: input.factoryItem.id,
      title: input.factoryItem.title,
      description: redactedDescription.text,
      repo: input.factoryItem.repo,
      issue_url: input.factoryItem.issue_url,
      priority: input.factoryItem.priority,
      lifecycle_stage: input.factoryItem.lifecycle_stage,
    },
    factory_run_id: input.factoryRunId ?? null,
    workflow_id: input.workflowId ?? null,
    stage: input.stage,
    agent_role: input.agentRole,
    task: redactedTask.text,
    repo_path: input.repoPath ? path.resolve(input.repoPath) : null,
    constraints,
    sources,
    prior_artifacts: priorArtifacts,
    redaction_ruleset_version: ruleset,
    redactions,
  };

  const prompt = buildPrompt({ manifestWithoutChecksum });
  const priorArtifactManifest = stableStringify(priorArtifacts);
  const packChecksum = sha256(`${stableStringify(manifestWithoutChecksum)}\n${prompt}\n${priorArtifactManifest}`);
  const manifest: ContextPackManifest = { ...manifestWithoutChecksum, pack_checksum: packChecksum };

  const root = input.outputRoot
    ? path.resolve(input.outputRoot)
    : path.join(input.repoPath ? path.resolve(input.repoPath) : path.join(os.homedir(), ".openclaw", "antfarm"), ".factory", "context-packs");
  const packPath = path.join(root, input.factoryItem.id, input.stage, input.agentRole, packChecksum.slice(0, 16));

  fs.rmSync(packPath, { recursive: true, force: true });
  fs.mkdirSync(path.join(packPath, "sources"), { recursive: true });
  fs.mkdirSync(path.join(packPath, "prior-artifacts"), { recursive: true });

  for (const source of sources) {
    const dest = path.join(packPath, source.copiedPath);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(source.originalPath, dest);
  }

  fs.writeFileSync(path.join(packPath, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
  fs.writeFileSync(path.join(packPath, "prompt.md"), prompt, "utf-8");
  fs.writeFileSync(path.join(packPath, "prior-artifacts", "manifest.json"), `${JSON.stringify(priorArtifacts, null, 2)}\n`, "utf-8");

  return { path: packPath, checksum: packChecksum, manifest };
}
