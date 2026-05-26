import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildWorkPrompt } from "./agent-cron.js";

const AGENT_CRON_SOURCE = path.resolve(import.meta.dirname, "../../src/installer/agent-cron.ts");

describe("buildWorkPrompt", () => {
  it("documents the Antfarm CLI heredoc/pipe preflight whitelist", () => {
    const prompt = buildWorkPrompt("feature-dev", "developer");
    assert.ok(prompt.includes("Preflight whitelist"));
    assert.match(prompt, /node .*dist\/cli\/cli\.js step complete "\$STEP_ID"/);
  });

  it("does not install an unconditional timeout failure trap", () => {
    const prompt = buildWorkPrompt("feature-dev", "developer");
    assert.doesNotMatch(prompt, /SESSION_TIMEOUT_HOOK/);
    assert.doesNotMatch(prompt, /trap .*EXIT/);
    assert.doesNotMatch(prompt, /grep -oP/);
    assert.doesNotMatch(prompt, /Session timeout/);
  });
});

describe("workflow cron lifecycle CLI calls", () => {
  it("uses argv-based process execution for pause and resume cron job ids", () => {
    const source = fs.readFileSync(AGENT_CRON_SOURCE, "utf-8");

    assert.doesNotMatch(source, /execSync\(`openclaw cron (?:disable|enable) \$\{job\.id\}`/);
    assert.match(source, /execFileSync\("openclaw", \["cron", "disable", job\.id\]/);
    assert.match(source, /execFileSync\("openclaw", \["cron", "enable", job\.id\]/);
  });
});
