import fs from "node:fs";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import type { WorkflowAgent, WorkflowSpec } from "./types.js";

type ModelPolicy = {
  unknown_model?: "fail_validation" | "warn";
  inactive_statuses?: string[];
};

type ModelFamily = {
  canonical: string;
  aliases?: string[];
  status?: string;
  strengths?: string[];
  allowed_roles?: string[];
  allowed_workflow_stages?: string[];
};

export type RegistryModel = {
  id: string;
  family: string;
  provider: string;
  aliases?: string[];
  status?: string;
  strengths?: string[];
  fallback_chain: string[];
  eligible_roles?: string[];
  eligible_stages: string[];
  cost_per_1k_tokens: number;
  deprecated: boolean;
};

export type ModelRegistry = {
  version: number;
  policy?: ModelPolicy;
  models?: RegistryModel[];
  families?: Record<string, ModelFamily>;
};

export type ModelValidationError = {
  model: string;
  usage: string;
  message: string;
  suggestion?: string;
};

export type ModelValidationResult = {
  valid: boolean;
  errors: ModelValidationError[];
};

const MODEL_REGISTRY_PATH = fileURLToPath(new URL("../../config/model_registry.yaml", import.meta.url));

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function includesToken(tokens: string[] | undefined, token: string): boolean {
  if (!tokens || tokens.length === 0) return true;
  return tokens.includes("*") || tokens.map(normalize).includes(normalize(token));
}

function inferRole(agent: WorkflowAgent): string {
  const explicitRole = (agent as WorkflowAgent & { role?: string }).role;
  if (explicitRole?.trim()) return explicitRole;

  const id = agent.id.toLowerCase();
  if (id.includes("planner") || id.includes("prioritizer") || id.includes("reviewer")
      || id.includes("investigator") || id.includes("triager") || id.includes("architect")
      || id.includes("compiler") || id.includes("strategist")) return "analysis";
  if (id.includes("verifier")) return "verification";
  if (id.includes("tester") || id.includes("smoke-test") || id.includes("load-test")) return "testing";
  if (id.includes("scanner") || id.includes("security-auditor")) return "scanning";
  if (id === "pr" || id.includes("consolidate-pr")) return "pr";
  return "coding";
}

function inferWorkflowStage(workflowId: string | undefined): string {
  if (!workflowId) return "unknown";
  const id = workflowId.toLowerCase();
  if (id.includes("requirements")) return "requirements";
  if (id.includes("architecture")) return "architecture";
  if (id.includes("code-review")) return "review";
  if (id.includes("code-fix")) return "fix";
  if (id.includes("implement")) return "implement";
  if (id.includes("qa")) return "qa";
  if (id.includes("release")) return "release";
  if (id.includes("smoke")) return "smoke";
  if (id.includes("pipeline")) return "pipeline";
  if (id.includes("e2e-project-review")) return "e2e-review";
  return "unknown";
}

export function loadModelRegistry(registryPath = process.env.ANTFARM_MODEL_REGISTRY ?? MODEL_REGISTRY_PATH): ModelRegistry {
  const raw = fs.readFileSync(registryPath, "utf-8");
  const parsed = YAML.parse(raw) as ModelRegistry;
  const schemaErrors = validateModelRegistryShape(parsed);
  if (schemaErrors.length > 0) {
    throw new Error(`model_registry.yaml invalid at ${registryPath}:\n${schemaErrors.join("\n")}`);
  }
  return parsed;
}

export function validateModelRegistryShape(registry: unknown): string[] {
  const errors: string[] = [];
  if (!registry || typeof registry !== "object" || Array.isArray(registry)) {
    return ["registry root must be an object"];
  }

  const data = registry as ModelRegistry;
  if (typeof data.version !== "number") errors.push("version must be a number");
  if (!Array.isArray(data.models) && (!data.families || typeof data.families !== "object")) {
    errors.push("registry must define models[] or legacy families{}");
  }

  if (Array.isArray(data.models)) {
    const ids = new Set<string>();
    for (const [index, model] of data.models.entries()) {
      const prefix = `models[${index}]`;
      if (!model || typeof model !== "object" || Array.isArray(model)) {
        errors.push(`${prefix} must be an object`);
        continue;
      }
      for (const key of ["id", "family", "provider"] as const) {
        if (typeof model[key] !== "string" || model[key].trim().length === 0) {
          errors.push(`${prefix}.${key} is required`);
        }
      }
      if (typeof model.id === "string") {
        if (ids.has(normalize(model.id))) errors.push(`${prefix}.id duplicates another model id`);
        ids.add(normalize(model.id));
      }
      if (!Array.isArray(model.fallback_chain) || !model.fallback_chain.every((item) => typeof item === "string")) {
        errors.push(`${prefix}.fallback_chain must be a string array`);
      }
      if (!Array.isArray(model.eligible_stages) || model.eligible_stages.length === 0
        || !model.eligible_stages.every((item) => typeof item === "string" && item.trim().length > 0)) {
        errors.push(`${prefix}.eligible_stages must be a non-empty string array`);
      }
      if (typeof model.cost_per_1k_tokens !== "number" || Number.isNaN(model.cost_per_1k_tokens) || model.cost_per_1k_tokens < 0) {
        errors.push(`${prefix}.cost_per_1k_tokens must be a non-negative number`);
      }
      if (typeof model.deprecated !== "boolean") errors.push(`${prefix}.deprecated must be boolean`);
      if (model.eligible_roles !== undefined
        && (!Array.isArray(model.eligible_roles) || !model.eligible_roles.every((item) => typeof item === "string"))) {
        errors.push(`${prefix}.eligible_roles must be a string array when present`);
      }
      if (model.aliases !== undefined
        && (!Array.isArray(model.aliases) || !model.aliases.every((item) => typeof item === "string"))) {
        errors.push(`${prefix}.aliases must be a string array when present`);
      }
    }
  }
  return errors;
}

function modelToFamily(model: RegistryModel): ModelFamily {
  return {
    canonical: model.id,
    aliases: model.aliases,
    status: model.deprecated ? "deprecated" : (model.status ?? "active"),
    strengths: model.strengths,
    allowed_roles: model.eligible_roles,
    allowed_workflow_stages: model.eligible_stages,
  };
}

export function resolveModelFamily(model: string, registry: ModelRegistry): ModelFamily | null {
  const needle = normalize(model);
  for (const registered of registry.models ?? []) {
    const candidates = [registered.id, ...(registered.aliases ?? [])].map(normalize);
    if (candidates.includes(needle)) return modelToFamily(registered);
  }
  for (const family of Object.values(registry.families ?? {})) {
    const candidates = [family.canonical, ...(family.aliases ?? [])].map(normalize);
    if (candidates.includes(needle)) return family;
  }
  return null;
}

function validateModelUsage(params: {
  model: string | undefined;
  usage: string;
  role: string;
  stage: string;
  registry: ModelRegistry;
}): ModelValidationError[] {
  if (!params.model?.trim()) return [];

  const family = resolveModelFamily(params.model, params.registry);
  if (!family) {
    if (params.registry.policy?.unknown_model === "warn") return [];
    return [{
      model: params.model,
      usage: params.usage,
      message: `Unknown model "${params.model}" for ${params.usage}`,
      suggestion: "Add the model to config/model_registry.yaml or use a registered alias.",
    }];
  }

  const inactiveStatuses = params.registry.policy?.inactive_statuses ?? ["deprecated"];
  if (family.status && inactiveStatuses.map(normalize).includes(normalize(family.status))) {
    return [{
      model: params.model,
      usage: params.usage,
      message: `Model "${params.model}" is marked ${family.status}`,
      suggestion: `Use an active model family instead of ${family.canonical}.`,
    }];
  }

  const errors: ModelValidationError[] = [];
  if (!includesToken(family.allowed_roles, params.role)) {
    errors.push({
      model: params.model,
      usage: params.usage,
      message: `Model "${params.model}" is not allowed for role "${params.role}"`,
      suggestion: `Update allowed_roles for ${family.canonical} or choose a role-eligible model.`,
    });
  }
  if (!includesToken(family.allowed_workflow_stages, params.stage)) {
    errors.push({
      model: params.model,
      usage: params.usage,
      message: `Model "${params.model}" is not allowed for workflow stage "${params.stage}"`,
      suggestion: `Update allowed_workflow_stages for ${family.canonical} or choose a stage-eligible model.`,
    });
  }
  return errors;
}

export function validateWorkflowModels(workflow: WorkflowSpec, registry = loadModelRegistry()): ModelValidationResult {
  const workflowId = workflow.id ?? (workflow as WorkflowSpec & { name?: string }).name ?? "unknown-workflow";
  const stage = inferWorkflowStage(workflowId);
  const errors: ModelValidationError[] = [];

  errors.push(...validateModelUsage({
    model: workflow.polling?.model,
    usage: `${workflowId}.polling.model`,
    role: "polling",
    stage: "polling",
    registry,
  }));

  for (const agent of workflow.agents ?? []) {
    errors.push(...validateModelUsage({
      model: agent.model,
      usage: `${workflowId}.agents.${agent.id}.model`,
      role: inferRole(agent),
      stage,
      registry,
    }));
    errors.push(...validateModelUsage({
      model: agent.pollingModel,
      usage: `${workflowId}.agents.${agent.id}.pollingModel`,
      role: "polling",
      stage: "polling",
      registry,
    }));
  }

  for (const step of workflow.steps ?? []) {
    const stepWithModel = step as typeof step & { model?: string; pollingModel?: string };
    errors.push(...validateModelUsage({
      model: stepWithModel.model,
      usage: `${workflowId}.steps.${step.id}.model`,
      role: inferRole({ id: step.agent, workspace: { baseDir: "", files: {} } }),
      stage,
      registry,
    }));
    errors.push(...validateModelUsage({
      model: stepWithModel.pollingModel,
      usage: `${workflowId}.steps.${step.id}.pollingModel`,
      role: "polling",
      stage: "polling",
      registry,
    }));
  }

  return { valid: errors.length === 0, errors };
}

export function assertWorkflowModelsValid(workflow: WorkflowSpec): void {
  const result = validateWorkflowModels(workflow);
  if (result.valid) return;
  const details = result.errors
    .map((err) => `- ${err.usage}: ${err.message}${err.suggestion ? ` (${err.suggestion})` : ""}`)
    .join("\n");
  throw new Error(`workflow.yml model registry validation failed for "${workflow.id}":\n${details}`);
}
