import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildPollingPrompt } from "../dist/installer/agent-cron.js";

describe("buildPollingPrompt", () => {
  it("contains the step claim command with correct agent id", () => {
    const prompt = buildPollingPrompt("feature-dev", "developer");
    assert.ok(prompt.includes('step claim "feature-dev_developer"'));
  });

  it("instructs to reply HEARTBEAT_OK on NO_WORK", () => {
    const prompt = buildPollingPrompt("feature-dev", "developer");
    assert.ok(prompt.includes("HEARTBEAT_OK"));
    assert.ok(prompt.includes("NO_WORK"));
  });

  it("does NOT contain workspace/AGENTS.md/SOUL.md content", () => {
    const prompt = buildPollingPrompt("feature-dev", "developer");
    assert.ok(!prompt.includes("AGENTS.md"));
    assert.ok(!prompt.includes("SOUL.md"));
  });

  it("works with different workflow/agent ids", () => {
    const prompt = buildPollingPrompt("bug-fix", "fixer");
    assert.ok(prompt.includes('step claim "bug-fix_fixer"'));
  });

  it("includes instructions for parsing step claim JSON output", () => {
    const prompt = buildPollingPrompt("feature-dev", "developer");
    assert.ok(prompt.includes("stepId"), "should mention stepId field");
    assert.ok(prompt.includes("runId"), "should mention runId field");
    assert.ok(prompt.includes("input"), "should mention input field");
    assert.ok(prompt.includes("parse"), "should instruct to parse JSON");
  });

  it("includes sessions_spawn invocation with correct agentId", () => {
    const prompt = buildPollingPrompt("feature-dev", "developer");
    assert.ok(prompt.includes("sessions_spawn"), "should mention sessions_spawn");
    assert.ok(prompt.includes('"feature-dev_developer"'), "should include full agentId");
  });

  it("includes the full work prompt with step complete/fail instructions", () => {
    const prompt = buildPollingPrompt("feature-dev", "developer");
    assert.ok(prompt.includes("step complete"), "should include step complete from work prompt");
    assert.ok(prompt.includes("step fail"), "should include step fail from work prompt");
    assert.ok(prompt.includes("---START WORK PROMPT---"), "should delimit work prompt");
    assert.ok(prompt.includes("---END WORK PROMPT---"), "should delimit work prompt");
  });

  it("includes a step-resolution guard for spawned workers", () => {
    const prompt = buildPollingPrompt("feature-dev", "developer");
    assert.ok(prompt.includes("Step-resolution guard"), "should include guard instructions");
    assert.ok(prompt.includes("ANTFARM_STEP_RESOLVED"), "should include resolved marker");
    assert.ok(prompt.includes("trap antfarm_step_exit_guard EXIT"), "should install exit trap");
    assert.ok(
      prompt.includes("Session ended without calling step complete or step fail"),
      "should auto-fail unresolved sessions"
    );
    assert.ok(
      prompt.includes('step complete "$STEP_ID" && touch "$ANTFARM_STEP_RESOLVED"'),
      "completion command should mark the step as resolved"
    );
    assert.ok(
      prompt.includes('step fail "$STEP_ID" "description of what went wrong" && touch "$ANTFARM_STEP_RESOLVED"'),
      "failure command should mark the step as resolved"
    );
  });

  it("specifies the full model for the spawned task", () => {
    const prompt = buildPollingPrompt("feature-dev", "developer", "claude-opus-4-6");
    assert.ok(prompt.includes('"claude-opus-4-6"'), "should specify model for spawn");
  });

  it("uses default model when workModel not provided", () => {
    const prompt = buildPollingPrompt("feature-dev", "developer");
    assert.ok(prompt.includes('"default"'), "should use default model");
  });

  it("instructs to include claimed JSON in spawned task", () => {
    const prompt = buildPollingPrompt("feature-dev", "developer");
    assert.ok(prompt.includes("CLAIMED STEP JSON"), "should instruct to append claimed JSON");
  });
});
