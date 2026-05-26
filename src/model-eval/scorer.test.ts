import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { scoreStepOutput } from "./scorer.js";

describe("scoreStepOutput compilation scoring", () => {
  it("compiles Python files with argv-safe file names", () => {
    const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), "antfarm-scorer-"));
    try {
      const fileName = 'safe";touch injected;.py';
      fs.writeFileSync(path.join(repoPath, fileName), "value = 1\n");

      const result = scoreStepOutput(
        `STATUS: done\nCHANGES: changed\nFILES_MODIFIED: ${fileName}`,
        "agent",
        "coding",
        repoPath
      );

      assert.equal(result.scores.compilation, 5);
      assert.equal(fs.existsSync(path.join(repoPath, "injected")), false);
    } finally {
      fs.rmSync(repoPath, { recursive: true, force: true });
    }
  });

  it("fails compilation for modified TypeScript files with syntax errors", () => {
    const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), "antfarm-scorer-"));
    try {
      fs.mkdirSync(path.join(repoPath, "src"));
      fs.writeFileSync(path.join(repoPath, "package.json"), JSON.stringify({
        type: "module",
        devDependencies: { typescript: "^5.9.3" },
      }));
      fs.writeFileSync(path.join(repoPath, "tsconfig.json"), JSON.stringify({
        compilerOptions: {
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          strict: true,
          skipLibCheck: true,
        },
        include: ["src/**/*.ts"],
      }));
      fs.writeFileSync(path.join(repoPath, "src", "broken.ts"), "export const value: string = ;\n");

      const result = scoreStepOutput(
        "STATUS: done\nCHANGES: changed\nFILES_MODIFIED: src/broken.ts",
        "agent",
        "coding",
        repoPath
      );

      assert.equal(result.scores.compilation, 1);
      assert.ok(result.flags.includes("compile_fail_typescript"));
    } finally {
      fs.rmSync(repoPath, { recursive: true, force: true });
    }
  });
});
