import { describe, it } from "node:test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

describe("getDb", () => {
  it("does not invalidate a retained handle when called again later", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "antfarm-db-"));
    const dbModuleUrl = `${pathToFileURL(path.join(import.meta.dirname, "db.js")).href}?retained-handle-${Date.now()}`;
    const script = `
      const originalNow = Date.now;
      const { getDb } = await import(${JSON.stringify(dbModuleUrl)});
      const first = getDb();
      Date.now = () => originalNow() + 6000;
      const second = getDb();
      if (second !== first) throw new Error("getDb returned a replacement handle");
      const row = first.prepare("SELECT 1 AS value").get();
      if (row.value !== 1) throw new Error("retained handle query failed");
      first.close();
    `;

    try {
      execFileSync(process.execPath, ["--input-type=module", "--eval", script], {
        env: { ...process.env, HOME: home },
        stdio: "pipe",
      });
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});
