import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { removeSubagentAllowlist } from "./subagent-allowlist.js";

describe("removeSubagentAllowlist", () => {
  it("does not create agent-to-agent config while removing entries", () => {
    const config = {};

    removeSubagentAllowlist(config, ["workflow_agent"]);

    assert.deepEqual(config, {});
  });

  it("removes entries from an existing allowlist without changing enabled state", () => {
    const config = {
      tools: {
        agentToAgent: {
          enabled: false,
          allow: ["workflow_agent", "other_agent"],
        },
      },
    };

    removeSubagentAllowlist(config, ["workflow_agent"]);

    assert.deepEqual(config.tools.agentToAgent, {
      enabled: false,
      allow: ["other_agent"],
    });
  });
});
