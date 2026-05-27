import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { getDb } from "../db.js";

const EVENTS_DIR = path.join(os.homedir(), ".openclaw", "antfarm");
const EVENTS_FILE = path.join(EVENTS_DIR, "events.jsonl");
const MAX_EVENTS_SIZE = 10 * 1024 * 1024; // 10MB

export type EventType =
  | "run.started" | "run.completed" | "run.failed"
  | "step.pending" | "step.running" | "step.done" | "step.completed" | "step.skipped" | "step.failed" | "step.timeout" | "step.cancelled"
  | "story.started" | "story.done" | "story.verified" | "story.retry" | "story.failed"
  | "pipeline.advanced";

export interface AntfarmEvent {
  ts: string;
  event: EventType;
  runId: string;
  workflowId?: string;
  /** Human-readable step name (e.g. "plan", "implement"), NOT the internal UUID. */
  stepId?: string;
  agentId?: string;
  storyId?: string;
  storyTitle?: string;
  detail?: string;
}

export function emitEvent(evt: AntfarmEvent): void {
  try {
    fs.mkdirSync(EVENTS_DIR, { recursive: true });
    // Rotate if too large
    try {
      const stats = fs.statSync(EVENTS_FILE);
      if (stats.size > MAX_EVENTS_SIZE) {
        const rotated = EVENTS_FILE + ".1";
        try { fs.unlinkSync(rotated); } catch {}
        fs.renameSync(EVENTS_FILE, rotated);
      }
    } catch {}
    fs.appendFileSync(EVENTS_FILE, JSON.stringify(evt) + "\n");
  } catch {
    // best-effort, never throw
  }
  syncFactoryLedger(evt);
  fireWebhook(evt);
}

function syncFactoryLedger(evt: AntfarmEvent): void {
  try {
    const db = getDb();
    const row = db.prepare(`
      SELECT id, factory_item_id, tenant_id
      FROM factory_runs
      WHERE antfarm_run_id = ?
      LIMIT 1
    `).get(evt.runId) as { id: string; factory_item_id: string; tenant_id: string | null } | undefined;
    if (!row?.tenant_id) return;

    if (evt.event === "run.completed") {
      db.prepare(`
        UPDATE factory_runs
        SET status = 'completed', completed_at = ?, updated_at = ?
        WHERE id = ?
      `).run(evt.ts, evt.ts, row.id);
      db.prepare(`
        UPDATE factory_items
        SET status = 'done', lifecycle_stage = 'completed', updated_at = ?
        WHERE id = ?
      `).run(evt.ts, row.factory_item_id);
    } else if (evt.event === "run.failed") {
      db.prepare(`
        UPDATE factory_runs
        SET status = 'failed', completed_at = ?, error_summary = ?, updated_at = ?
        WHERE id = ?
      `).run(evt.ts, evt.detail ?? "run failed", evt.ts, row.id);
      db.prepare(`
        UPDATE factory_items
        SET status = 'blocked', lifecycle_stage = 'failed', updated_at = ?
        WHERE id = ?
      `).run(evt.ts, row.factory_item_id);
    }

    db.prepare(`
      INSERT INTO factory_events (
        id, tenant_id, factory_item_id, factory_run_id, event_type, actor, payload_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      row.tenant_id,
      row.factory_item_id,
      row.id,
      evt.event,
      "antfarm-runtime",
      JSON.stringify({
        workflow_id: evt.workflowId ?? null,
        step_id: evt.stepId ?? null,
        agent_id: evt.agentId ?? null,
        story_id: evt.storyId ?? null,
        detail: evt.detail ?? null,
      }),
      evt.ts,
    );
  } catch {
    // best-effort ledger sync; do not break workflow progress.
  }
}

// In-memory cache: runId -> notify_url | null
const notifyUrlCache = new Map<string, string | null>();

function getNotifyUrl(runId: string): string | null {
  if (notifyUrlCache.has(runId)) return notifyUrlCache.get(runId)!;
  try {
    const db = getDb();
    const row = db.prepare("SELECT notify_url FROM runs WHERE id = ?").get(runId) as { notify_url: string | null } | undefined;
    const url = row?.notify_url ?? null;
    notifyUrlCache.set(runId, url);
    return url;
  } catch {
    return null;
  }
}

function fireWebhook(evt: AntfarmEvent): void {
  const raw = getNotifyUrl(evt.runId);
  if (!raw) return;
  try {
    let url = raw;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const hashIdx = url.indexOf("#auth=");
    if (hashIdx !== -1) {
      headers["Authorization"] = decodeURIComponent(url.slice(hashIdx + 6));
      url = url.slice(0, hashIdx);
    }
    fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(evt),
      signal: AbortSignal.timeout(5000),
    }).catch(() => {});
  } catch {
    // fire-and-forget
  }
}

// Read recent events (last N)
export function getRecentEvents(limit = 50): AntfarmEvent[] {
  try {
    const content = fs.readFileSync(EVENTS_FILE, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    const events: AntfarmEvent[] = [];
    for (const line of lines) {
      try { events.push(JSON.parse(line) as AntfarmEvent); } catch {}
    }
    return events.slice(-limit);
  } catch {
    return [];
  }
}

// Read events for a specific run (supports prefix match)
export function getRunEvents(runId: string, limit = 200): AntfarmEvent[] {
  try {
    const content = fs.readFileSync(EVENTS_FILE, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    const events: AntfarmEvent[] = [];
    for (const line of lines) {
      try {
        const evt = JSON.parse(line) as AntfarmEvent;
        if (evt.runId === runId || evt.runId.startsWith(runId)) events.push(evt);
      } catch {}
    }
    return events.slice(-limit);
  } catch {
    return [];
  }
}
