import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const rossAgents = fs.readFileSync(
  path.resolve(import.meta.dirname, "../../agents/ross/AGENTS.md"),
  "utf-8",
);

describe("Ross model boundary", () => {
  it("forbids unauthorized model rename behavior", () => {
    assert.match(rossAgents, /must not rename/i);
    assert.match(rossAgents, /config\/model_registry\.yaml/);
    assert.match(rossAgents, /boundary violation/i);
  });
});
