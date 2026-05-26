import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildWorkPrompt, cronNeedsRecreate } from "./agent-cron.js";

const AGENT_CRON_SOURCE = path.resolve(import.meta.dirname, "../../src/installer/agent-cron.ts");
const GATEWAY_API_SOURCE = path.resolve(import.meta.dirname, "../../src/installer/gateway-api.ts");

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

describe("workflow cron deletion matching", () => {
  it("uses exact-name deletion for single-cron reconciliation", () => {
    const source = fs.readFileSync(AGENT_CRON_SOURCE, "utf-8");

    assert.match(source, /deleteAgentCronJobByName\(cronName\)/);
    assert.doesNotMatch(source, /deleteAgentCronJobs\(cronName\)/);
  });

  it("keeps prefix deletion exactness isolated in gateway helpers", () => {
    const source = fs.readFileSync(GATEWAY_API_SOURCE, "utf-8");

    assert.match(source, /export async function deleteAgentCronJobByName\(name: string\)/);
    assert.match(source, /job\.name === name/);
    assert.match(source, /job\.name\.startsWith\(namePrefix\)/);
  });
});

describe("workflow cron reconciliation drift detection", () => {
  const desiredCron = {
    name: "antfarm/code-fix/developer",
    schedule: { kind: "every", everyMs: 60_000, anchorMs: 0 },
    sessionTarget: "isolated",
    agentId: "code-fix_developer",
    payload: {
      kind: "agentTurn",
      message: "poll for work",
      model: "default",
      timeoutSeconds: 1800,
    },
    delivery: { mode: "none" as const },
    enabled: true,
  };

  it("accepts an existing cron that already matches the desired behavior", () => {
    assert.equal(cronNeedsRecreate({ ...desiredCron }, desiredCron), false);
  });

  it("recreates when schedule, prompt, timeout, enabled, or routing fields drift", () => {
    const staleCrons = [
      { ...desiredCron, schedule: { ...desiredCron.schedule, everyMs: 300_000 } },
      { ...desiredCron, schedule: { ...desiredCron.schedule, anchorMs: 60_000 } },
      { ...desiredCron, payload: { ...desiredCron.payload, message: "old prompt" } },
      { ...desiredCron, payload: { ...desiredCron.payload, timeoutSeconds: 600 } },
      { ...desiredCron, enabled: false },
      { ...desiredCron, sessionTarget: "main" },
      { ...desiredCron, agentId: "code-fix_reviewer" },
      { ...desiredCron, delivery: { mode: "announce" as const } },
    ];

    for (const staleCron of staleCrons) {
      assert.equal(cronNeedsRecreate(staleCron, desiredCron), true);
    }
  });
});
