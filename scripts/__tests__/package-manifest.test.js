import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..", "..");

describe("package manifest release policy", () => {
  it("is private because antfarm is distributed from GitHub, not npm", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    const readme = readFileSync(join(root, "README.md"), "utf8");
    const agents = readFileSync(join(root, "AGENTS.md"), "utf8");

    assert.match(readme, /not the npm registry/i);
    assert.match(agents, /Do NOT run `npm install antfarm`/);
    assert.equal(pkg.private, true);
  });
});
