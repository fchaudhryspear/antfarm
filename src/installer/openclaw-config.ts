import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import JSON5 from "json5";
import { resolveOpenClawConfigPath } from "./paths.js";

export type OpenClawConfig = {
  gateway?: {
    port?: number;
    auth?: {
      mode?: "token" | "password";
      token?: string;
      password?: string;
    };
  };
  cron?: {
    sessionRetention?: string | false;
  };
  session?: {
    maintenance?: {
      mode?: "enforce" | "warn";
      pruneAfter?: string | number;
      pruneDays?: number;
      maxEntries?: number;
      rotateBytes?: number | string;
    };
  };
  agents?: {
    defaults?: {
      model?: string | { primary?: string };
      subagents?: {
        allowAgents?: string[];
      };
    };
    list?: Array<Record<string, unknown>>;
  };
};

export async function readOpenClawConfig(): Promise<{ path: string; config: OpenClawConfig }> {
  const path = resolveOpenClawConfigPath();
  try {
    const raw = await fs.readFile(path, "utf-8");
    const config = JSON5.parse(raw) as OpenClawConfig;
    return { path, config };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to read OpenClaw config at ${path}: ${message}`);
  }
}

export async function writeOpenClawConfig(
  path: string,
  config: OpenClawConfig,
): Promise<void> {
  try {
    await fs.copyFile(path, `${path}.antfarm-backup`, fsConstants.COPYFILE_EXCL);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") {
      throw err;
    }
  }
  const content = `${JSON.stringify(config, null, 2)}\n`;
  await fs.writeFile(path, content, "utf-8");
}
