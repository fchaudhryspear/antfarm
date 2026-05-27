import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..", "..");

describe("package manifest release policy", () => {
  it("keeps release file injection out of normal build and test scripts", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

    const injectorCommand = /node\s+scripts\/inject-version\.js/;

    assert.doesNotMatch(pkg.scripts.build, injectorCommand);
    assert.doesNotMatch(pkg.scripts.test, injectorCommand);
    assert.equal(pkg.scripts["release:inject-version"], "node scripts/inject-version.js");
  });

  it("is private because antfarm is distributed from GitHub, not npm", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    const readme = readFileSync(join(root, "README.md"), "utf8");
    const agents = readFileSync(join(root, "AGENTS.md"), "utf8");

    assert.match(readme, /not the npm registry/i);
    assert.match(agents, /Do NOT run `npm install antfarm`/);
    assert.equal(pkg.private, true);
  });

  it("cleans dist before emitting release artifacts", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

    assert.match(pkg.scripts.build, /^rm -rf dist && npm run typecheck &&/);
  });

  it("builds before npm start executes dist output", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

    assert.equal(pkg.scripts.start, "npm run build && node dist/cli/cli.js");
  });

  it("points the built package bin at an existing dist-relative target", () => {
    const distPkg = JSON.parse(readFileSync(join(root, "dist", "package.json"), "utf8"));

    assert.equal(distPkg.bin.antfarm, "cli/cli.js");
    const binPath = join(root, "dist", distPkg.bin.antfarm);
    assert.ok(existsSync(binPath), "dist package bin path should resolve");
    assert.ok(statSync(binPath).mode & 0o111, "dist package bin target should be executable");
  });

  it("lets staging load-test JSON flush before process exit", () => {
    const script = readFileSync(join(root, "scripts/gateway-staging-load-test.mjs"), "utf8");

    assert.match(script, /process\.exitCode = result\.pass \? 0 : 1/);
    assert.doesNotMatch(script, /process\.exit\(/);
  });

  it("declares the minimum Node runtime for unflagged node:sqlite", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
    const readme = readFileSync(join(root, "README.md"), "utf8");

    assert.equal(pkg.engines.node, ">=22.13.0");
    assert.equal(lock.packages[""].engines.node, pkg.engines.node);
    assert.match(readme, /Requires Node\.js >= 22\.13\.0/);
  });
});
