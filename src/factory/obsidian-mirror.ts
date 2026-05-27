import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { getDb } from "../db.js";
import { redactText } from "./redaction.js";
import { appendFactoryEvent, getFactoryItemStatus } from "./store.js";

export type ObsidianMirrorResult = {
  id: string;
  notePath: string;
  checksum: string;
  sourceRefs: string[];
  redactionStatus: "clean" | "redacted";
};

export type WriteObsidianMirrorInput = {
  factoryItemId: string;
  outputRoot: string;
  actor?: string;
  noteTitle?: string;
};

const SECRET_PATTERNS: RegExp[] = [
  /\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*["']?[^"'\s`]+/gi,
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/g,
  /\bsk-[A-Za-z0-9]{12,}\b/g,
  /\blin_api_[A-Za-z0-9]{12,}\b/g,
];

function nowIso(): string {
  return new Date().toISOString();
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function slugify(value: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug || "factory-item";
}

function redact(value: string): { text: string; redacted: boolean } {
  let text = value;
  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, (match) => {
      const [key] = match.split(/[:=]/);
      return /[:=]/.test(match) ? `${key.trim()}: [REDACTED]` : "[REDACTED]";
    });
  }
  text = redactText(text, "finance_v1").text;
  text = redactText(text, "pii_v1").text;
  return { text, redacted: text !== value };
}

function redactMany(values: string[]): { values: string[]; redacted: boolean } {
  let redacted = false;
  const sanitized = values.map((value) => {
    const result = redact(value);
    redacted ||= result.redacted;
    return result.text;
  });
  return { values: sanitized, redacted };
}

function yamlScalar(value: string | null): string {
  if (value === null || value === "") return "null";
  return JSON.stringify(value);
}

function yamlList(values: string[]): string {
  if (values.length === 0) return "[]";
  return `\n${values.map((value) => `  - ${JSON.stringify(value)}`).join("\n")}`;
}

function parseManifestSources(manifestJson: string): string[] {
  try {
    const manifest = JSON.parse(manifestJson) as { sources?: Array<{ relativePath?: string; checksum?: string }> };
    return (manifest.sources ?? [])
      .map((source) => source.relativePath ? `${source.relativePath}${source.checksum ? `#${source.checksum}` : ""}` : null)
      .filter((value): value is string => Boolean(value));
  } catch {
    return [];
  }
}

export function writeObsidianFactoryMirror(
  input: WriteObsidianMirrorInput,
  db: DatabaseSync = getDb(),
): ObsidianMirrorResult {
  const status = getFactoryItemStatus(input.factoryItemId, db);
  if (!status.item) throw new Error(`Factory item not found: ${input.factoryItemId}`);

  const contextPackIds = status.contextPacks.map((pack) => pack.id);
  const workflowRunIds = status.runs.map((run) => run.id);
  const rawSourceRefs = [
    ...status.contextPacks.flatMap((pack) => parseManifestSources(pack.manifest_json)),
    ...status.artifacts.map((artifact) => String(artifact.path_or_url)),
  ].sort();
  const sourceRefRedaction = redactMany([...new Set(rawSourceRefs)]);
  const sourceRefs = sourceRefRedaction.values;

  const latestRun = status.runs.at(-1);
  const latestContextPack = status.contextPacks.at(-1);
  const title = input.noteTitle ?? status.item.title;
  const safeTitle = redact(title).text;
  const generatedAt = nowIso();
  const body = [
    `# ${safeTitle}`,
    "",
    "> Synthesis mirror only. Antfarm remains the runtime source of truth.",
    "",
    "## Request",
    "",
    status.item.description || "n/a",
    "",
    "## Provenance",
    "",
    `- factory_item_id: ${status.item.id}`,
    `- workflow_run_id: ${latestRun?.id ?? "n/a"}`,
    "- work_unit_id: n/a",
    `- context_pack_id: ${latestContextPack?.id ?? "n/a"}`,
    `- source_refs: ${sourceRefs.length}`,
    "",
    "## Status",
    "",
    `- lifecycle_stage: ${status.item.lifecycle_stage}`,
    `- status: ${status.item.status}`,
    `- priority: ${status.item.priority}`,
    `- repo: ${status.item.repo ?? "n/a"}`,
    `- issue_url: ${status.item.issue_url ?? "n/a"}`,
    "",
    "## Runs",
    "",
    ...status.runs.map((run) => `- ${run.id}: ${run.workflow_id} (${run.status})`),
    ...(status.runs.length ? [] : ["- none"]),
    "",
    "## Context Packs",
    "",
    ...status.contextPacks.map((pack) => `- ${pack.id}: ${pack.stage}/${pack.agent_role} (${pack.checksum})`),
    ...(status.contextPacks.length ? [] : ["- none"]),
    "",
    "## Artifacts",
    "",
    ...status.artifacts.map((artifact) => `- ${artifact.artifact_type}: ${artifact.title} -> ${artifact.path_or_url}`),
    ...(status.artifacts.length ? [] : ["- none"]),
    "",
    "## Recent Events",
    "",
    ...status.events.slice(-10).map((event) => `- ${event.created_at}: ${event.event_type}`),
    ...(status.events.length ? [] : ["- none"]),
    "",
  ].join("\n");

  const redacted = redact(body);
  const redactionStatus = redacted.redacted || sourceRefRedaction.redacted ? "redacted" : "clean";
  const checksum = sha256(redacted.text);
  const frontmatter = [
    "---",
    "mirror_schema: obsidian_factory_item_v1",
    "mirror_kind: synthesis",
    "runtime_truth: false",
    `generated_at: ${yamlScalar(generatedAt)}`,
    `factory_item_id: ${yamlScalar(status.item.id)}`,
    `workflow_run_id: ${yamlScalar(latestRun?.id ?? null)}`,
    "work_unit_id: null",
    `context_pack_id: ${yamlScalar(latestContextPack?.id ?? null)}`,
    `workflow_run_ids:${yamlList(workflowRunIds)}`,
    `context_pack_ids:${yamlList(contextPackIds)}`,
    `source_refs:${yamlList(sourceRefs)}`,
    `note_checksum: ${yamlScalar(checksum)}`,
    `redaction_status: ${redactionStatus}`,
    "---",
    "",
  ].join("\n");
  const note = `${frontmatter}${redacted.text}`;
  const notePath = path.join(path.resolve(input.outputRoot), "Factory Items", `${slugify(safeTitle)}-${status.item.id}.md`);

  fs.mkdirSync(path.dirname(notePath), { recursive: true });
  fs.writeFileSync(notePath, note, "utf-8");

  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO obsidian_mirror_events (
      id, factory_item_id, factory_run_id, context_pack_id, note_path,
      note_checksum, source_refs_json, redaction_status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    status.item.id,
    latestRun?.id ?? null,
    latestContextPack?.id ?? null,
    notePath,
    checksum,
    JSON.stringify(sourceRefs),
    redactionStatus,
    generatedAt,
  );
  appendFactoryEvent({
    factoryItemId: status.item.id,
    factoryRunId: latestRun?.id,
    eventType: "obsidian_mirror.written",
    actor: input.actor ?? "factory",
    payload: { note_path: notePath, note_checksum: checksum, redaction_status: redactionStatus },
  }, db);

  return {
    id,
    notePath,
    checksum,
    sourceRefs,
    redactionStatus,
  };
}
