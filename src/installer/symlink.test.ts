import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { ensureCliSymlink, removeCliSymlink } from "./symlink.js";

const originalHome = process.env.HOME;
const tempHomes: string[] = [];

function useTempHome(): string {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "antfarm-symlink-test-"));
  tempHomes.push(home);
  process.env.HOME = home;
  return home;
}

function cliPath(home: string): string {
  return path.join(home, ".local", "bin", "antfarm");
}

afterEach(() => {
  process.env.HOME = originalHome;
  for (const home of tempHomes.splice(0)) {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

describe("removeCliSymlink", () => {
  it("leaves a regular antfarm executable untouched", () => {
    const home = useTempHome();
    const linkPath = cliPath(home);
    fs.mkdirSync(path.dirname(linkPath), { recursive: true });
    fs.writeFileSync(linkPath, "#!/bin/sh\nexec node custom.js\n");

    removeCliSymlink();

    assert.equal(fs.readFileSync(linkPath, "utf-8"), "#!/bin/sh\nexec node custom.js\n");
  });

  it("removes a symlink created by Antfarm", () => {
    const home = useTempHome();
    const linkPath = cliPath(home);
    ensureCliSymlink();

    assert.equal(fs.lstatSync(linkPath).isSymbolicLink(), true);

    removeCliSymlink();

    assert.equal(fs.existsSync(linkPath), false);
  });

  it("leaves unrelated symlinks untouched", () => {
    const home = useTempHome();
    const linkPath = cliPath(home);
    const targetPath = path.join(home, "custom-antfarm");
    fs.mkdirSync(path.dirname(linkPath), { recursive: true });
    fs.writeFileSync(targetPath, "#!/bin/sh\n");
    fs.symlinkSync(targetPath, linkPath);

    removeCliSymlink();

    assert.equal(fs.lstatSync(linkPath).isSymbolicLink(), true);
    assert.equal(fs.readlinkSync(linkPath), targetPath);
  });
});
