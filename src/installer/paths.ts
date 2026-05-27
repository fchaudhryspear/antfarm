import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Bundled workflows ship with antfarm (in the repo's workflows/ directory)
export function resolveBundledWorkflowsDir(): string {
  // From dist/installer/paths.js -> ../../workflows
  return path.resolve(__dirname, "..", "..", "workflows");
}

export function resolveBundledWorkflowDir(workflowId: string): string {
  return resolveWorkflowChildDir(resolveBundledWorkflowsDir(), workflowId);
}

export function resolveOpenClawStateDir(): string {
  const env = process.env.OPENCLAW_STATE_DIR?.trim();
  if (env) {
    return env;
  }
  return path.join(os.homedir(), ".openclaw");
}

export function resolveOpenClawConfigPath(): string {
  const env = process.env.OPENCLAW_CONFIG_PATH?.trim();
  if (env) {
    return env;
  }
  return path.join(resolveOpenClawStateDir(), "openclaw.json");
}

export function resolveAntfarmRoot(): string {
  return path.join(resolveOpenClawStateDir(), "antfarm");
}

export function resolveWorkflowRoot(): string {
  return path.join(resolveAntfarmRoot(), "workflows");
}

export function resolveWorkflowDir(workflowId: string): string {
  return resolveWorkflowChildDir(resolveWorkflowRoot(), workflowId);
}

export function resolveWorkflowWorkspaceRoot(): string {
  return path.join(resolveOpenClawStateDir(), "workspaces", "workflows");
}

export function resolveWorkflowWorkspaceDir(workflowId: string): string {
  return resolveWorkflowChildDir(resolveWorkflowWorkspaceRoot(), workflowId);
}

export function resolveRunRoot(): string {
  return path.join(resolveAntfarmRoot(), "runs");
}

export function resolveAntfarmCli(): string {
  // From dist/installer/paths.js -> ../../dist/cli/cli.js
  return path.resolve(__dirname, "..", "cli", "cli.js");
}

function resolveWorkflowChildDir(root: string, workflowId: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(workflowId)) {
    throw new Error(`Invalid workflow id "${workflowId}": use letters, numbers, dots, underscores, or hyphens only`);
  }

  const resolvedRoot = path.resolve(root);
  const resolvedChild = path.resolve(resolvedRoot, workflowId);
  const relative = path.relative(resolvedRoot, resolvedChild);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Invalid workflow id "${workflowId}": resolved path escapes workflow root`);
  }
  return resolvedChild;
}
