import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readOpenClawConfig, writeOpenClawConfig } from "./openclaw-config.js";

const originalConfigPath = process.env.OPENCLAW_CONFIG_PATH;

describe("OpenClaw config writes", () => {
  it("backs up the original JSON5 config before rewriting", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "antfarm-openclaw-config-"));
    try {
      const configPath = path.join(dir, "openclaw.json5");
      const original = `{
  // local gateway notes
  gateway: {
    port: 19876,
  },
}\n`;
      await fs.writeFile(configPath, original, "utf-8");
      process.env.OPENCLAW_CONFIG_PATH = configPath;

      const { path: resolvedPath, config } = await readOpenClawConfig();
      config.cron = { sessionRetention: "24h" };
      await writeOpenClawConfig(resolvedPath, config);

      assert.equal(await fs.readFile(`${configPath}.antfarm-backup`, "utf-8"), original);
      assert.match(await fs.readFile(configPath, "utf-8"), /"sessionRetention": "24h"/);
    } finally {
      if (originalConfigPath === undefined) {
        delete process.env.OPENCLAW_CONFIG_PATH;
      } else {
        process.env.OPENCLAW_CONFIG_PATH = originalConfigPath;
      }
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("keeps the first backup when config is written repeatedly", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "antfarm-openclaw-config-"));
    try {
      const configPath = path.join(dir, "openclaw.json5");
      const original = "{\n  // keep this note\n  gateway: { port: 19876 },\n}\n";
      await fs.writeFile(configPath, original, "utf-8");
      process.env.OPENCLAW_CONFIG_PATH = configPath;

      const { path: resolvedPath, config } = await readOpenClawConfig();
      config.cron = { sessionRetention: "24h" };
      await writeOpenClawConfig(resolvedPath, config);
      config.cron = { sessionRetention: "48h" };
      await writeOpenClawConfig(resolvedPath, config);

      assert.equal(await fs.readFile(`${configPath}.antfarm-backup`, "utf-8"), original);
      assert.match(await fs.readFile(configPath, "utf-8"), /"sessionRetention": "48h"/);
    } finally {
      if (originalConfigPath === undefined) {
        delete process.env.OPENCLAW_CONFIG_PATH;
      } else {
        process.env.OPENCLAW_CONFIG_PATH = originalConfigPath;
      }
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
