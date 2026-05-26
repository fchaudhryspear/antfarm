import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..", "..");
const htmlPath = join(root, "landing", "index.html");
const readmePath = join(root, "README.md");
const installPath = join(root, "scripts", "install.sh");
const mutablePaths = [htmlPath, readmePath, installPath];
const scriptPath = join(root, "scripts", "inject-version.js");

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const version = pkg.version;

describe("inject-version", () => {
  let backups;

  beforeEach(() => {
    backups = new Map(
      mutablePaths.map((path) => [
        path,
        existsSync(path) ? readFileSync(path, "utf8") : null,
      ])
    );
  });

  afterEach(() => {
    for (const [path, content] of backups) {
      if (content === null) {
        rmSync(path, { force: true });
      } else {
        writeFileSync(path, content, "utf8");
      }
    }
  });

  it("replaces {{VERSION}} with the package version", () => {
    // Ensure placeholder exists
    let html = readFileSync(htmlPath, "utf8");
    if (!html.includes("{{VERSION}}")) {
      html = html.replace(
        /(class="version-badge">v)[^<]*/,
        "$1{{VERSION}}"
      );
      writeFileSync(htmlPath, html, "utf8");
    }

    execFileSync("node", [scriptPath], { cwd: root });

    const result = readFileSync(htmlPath, "utf8");
    assert.ok(
      result.includes(`v${version}`),
      `Expected HTML to contain v${version}`
    );
    assert.ok(
      !result.includes("{{VERSION}}"),
      "Placeholder should be replaced"
    );
  });

  it("is idempotent — running twice produces identical output", () => {
    execFileSync("node", [scriptPath], { cwd: root });
    const first = readFileSync(htmlPath, "utf8");

    execFileSync("node", [scriptPath], { cwd: root });
    const second = readFileSync(htmlPath, "utf8");

    assert.equal(first, second, "Output should be identical after two runs");
  });

  it("injects the correct semver from package.json", () => {
    execFileSync("node", [scriptPath], { cwd: root });
    const html = readFileSync(htmlPath, "utf8");
    const match = html.match(/class="version-badge">v([^<]+)</);
    assert.ok(match, "Version badge should exist in HTML");
    assert.equal(match[1], version, "Version should match package.json");
  });

  it("updates README and install script URLs without leaking changes", () => {
    const staleVersion = "0.5.1-beta.1";
    const staleUrl = `raw.githubusercontent.com/snarktank/antfarm/v${staleVersion}/`;
    const expectedUrl = `raw.githubusercontent.com/snarktank/antfarm/v${version}/`;

    writeFileSync(readmePath, `curl https://${staleUrl}scripts/install.sh\n`, "utf8");
    writeFileSync(installPath, `curl https://${staleUrl}dist/cli/cli.js\n`, "utf8");

    execFileSync("node", [scriptPath], { cwd: root });

    assert.match(readFileSync(readmePath, "utf8"), new RegExp(expectedUrl));
    assert.doesNotMatch(readFileSync(readmePath, "utf8"), new RegExp(staleUrl));
    assert.match(readFileSync(installPath, "utf8"), new RegExp(expectedUrl));
    assert.doesNotMatch(readFileSync(installPath, "utf8"), new RegExp(staleUrl));
  });
});
