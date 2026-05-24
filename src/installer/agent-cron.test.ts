import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildWorkPrompt } from "./agent-cron.js";

describe("buildWorkPrompt", () => {
  it("documents the Antfarm CLI heredoc/pipe preflight whitelist", () => {
    const prompt = buildWorkPrompt("feature-dev", "developer");
    assert.ok(prompt.includes("Preflight whitelist"));
    assert.match(prompt, /node .*dist\/cli\/cli\.js step complete "\$STEP_ID"/);
  });
});
