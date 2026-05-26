import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { recordHeartbeatPing } from "./heartbeat-service.js";

function memoryDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE session_heartbeats (
      session_id TEXT PRIMARY KEY,
      step_id TEXT,
      run_id TEXT,
      last_ping_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'alive',
      created_at TEXT NOT NULL
    )
  `);
  return db;
}

describe("heartbeat service", () => {
  it("tolerates duplicate initial pings for the same session", () => {
    const db = memoryDb();
    try {
      assert.doesNotThrow(() => recordHeartbeatPing(db, "session-1", "step-1", "run-1", "2026-05-26T12:00:00.000Z"));
      assert.doesNotThrow(() => recordHeartbeatPing(db, "session-1", undefined, undefined, "2026-05-26T12:01:00.000Z"));

      const rows = db.prepare(
        "SELECT session_id, step_id, run_id, last_ping_at, status, created_at FROM session_heartbeats WHERE session_id = ?"
      ).all("session-1") as Array<{
        session_id: string;
        step_id: string | null;
        run_id: string | null;
        last_ping_at: string;
        status: string;
        created_at: string;
      }>;

      assert.equal(rows.length, 1);
      assert.equal(rows[0].session_id, "session-1");
      assert.equal(rows[0].step_id, "step-1");
      assert.equal(rows[0].run_id, "run-1");
      assert.equal(rows[0].last_ping_at, "2026-05-26T12:01:00.000Z");
      assert.equal(rows[0].status, "alive");
      assert.equal(rows[0].created_at, "2026-05-26T12:00:00.000Z");
    } finally {
      db.close();
    }
  });
});
