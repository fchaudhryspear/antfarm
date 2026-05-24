import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateStructuredFindingsJson } from "./validate-structured-findings.js";

const validPayload = {
  version: "1.0",
  repo_name: "example",
  repo_path: "/tmp/example",
  generated_by: "swarm-code-review-v3",
  generated_at: "2026-05-24T00:00:00.000Z",
  overall_score: 82,
  domain_scores: { security: 80, backend: 84 },
  findings: [{
    finding_id: "SEC-001",
    domain: "security",
    severity: "high",
    file: "src/auth.ts",
    line_range: [10, 12],
    description: "Token validation accepts unsigned values.",
    suggested_approach: "Require signature verification at the boundary.",
    review_agent: "security-auditor",
    confidence: 0.92,
  }],
};

describe("validateStructuredFindingsJson", () => {
  it("accepts a valid structured findings payload", () => {
    assert.deepEqual(validateStructuredFindingsJson(JSON.stringify(validPayload)), { valid: true });
  });

  it("rejects invalid JSON", () => {
    const result = validateStructuredFindingsJson("{not json");
    assert.equal(result.valid, false);
  });

  it("rejects malformed findings", () => {
    const result = validateStructuredFindingsJson(JSON.stringify({
      ...validPayload,
      findings: [{ ...validPayload.findings[0], finding_id: "bad", confidence: 2 }],
    }));
    assert.equal(result.valid, false);
    if (!result.valid) {
      assert.ok(result.errors.some((error) => error.includes("finding_id")));
      assert.ok(result.errors.some((error) => error.includes("confidence")));
    }
  });

  it("rejects date-only generated_at values", () => {
    const result = validateStructuredFindingsJson(JSON.stringify({
      ...validPayload,
      generated_at: "2026-05-24",
    }));
    assert.equal(result.valid, false);
    if (!result.valid) {
      assert.ok(result.errors.some((error) => error.includes("generated_at")));
    }
  });
});
