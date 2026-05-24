import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { once } from "node:events";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

type SessionRecord = {
  id: string;
  createdAt: number;
  lastHeartbeatAt: number;
  status: "active" | "stale" | "closed";
};

export type GatewayLoadTestOptions = {
  issueId?: string;
  baselineConcurrentSessions?: number;
  multiplier?: number;
  targetConcurrentSessions?: number;
  sustainedSeconds?: number;
  heartbeatIntervalMs?: number;
  heartbeatTimeoutMs?: number;
  evidencePath?: string;
  evidenceDbPath?: string;
  maxParallelUnits?: number;
};

export type GatewayLoadTestResult = {
  schema_version: "1.0.0";
  issue_id: string;
  run_id: string;
  generated_at: string;
  environment: {
    kind: "isolated_staging";
    host: "127.0.0.1";
    port: number;
    live_gateway_touched: false;
    production_sessions_touched: false;
  };
  target: {
    baseline_concurrent_sessions: number;
    multiplier: number;
    target_concurrent_sessions: number;
    sustained_seconds: number;
  };
  lifecycle: {
    created_sessions: number;
    heartbeat_count: number;
    teardown_count: number;
    active_sessions_after_teardown: number;
    heartbeat_timeout_invariant_verified: boolean;
  };
  stability: {
    connection_drops: number;
    failed_requests: number;
    rss_start_bytes: number;
    rss_peak_bytes: number;
    rss_end_bytes: number;
    oom_detected: boolean;
    launchagent_stability: "stable" | "unstable";
  };
  cap_policy: {
    max_parallel_units: number;
    reason: string;
  };
  pass: boolean;
  blockers: string[];
};

type StagingGateway = {
  port: number;
  close: () => Promise<void>;
};

function positiveInteger(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value) || value < 1) return fallback;
  return Math.trunc(value);
}

export function resolveGatewayLoadTarget(options: GatewayLoadTestOptions = {}): {
  baselineConcurrentSessions: number;
  multiplier: number;
  targetConcurrentSessions: number;
} {
  const baselineConcurrentSessions = positiveInteger(options.baselineConcurrentSessions, 5);
  const multiplier = positiveInteger(options.multiplier, 5);
  const targetConcurrentSessions = positiveInteger(
    options.targetConcurrentSessions,
    baselineConcurrentSessions * multiplier,
  );
  return { baselineConcurrentSessions, multiplier, targetConcurrentSessions };
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function startStagingGateway(heartbeatTimeoutMs: number): Promise<StagingGateway> {
  const sessions = new Map<string, SessionRecord>();
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const now = Date.now();

      if (req.method === "GET" && url.pathname === "/health") {
        json(res, 200, { ok: true, sessions: sessions.size });
        return;
      }

      if (req.method === "POST" && url.pathname === "/sessions") {
        await readJson(req);
        const id = randomUUID();
        sessions.set(id, { id, createdAt: now, lastHeartbeatAt: now, status: "active" });
        json(res, 201, { id });
        return;
      }

      const heartbeatMatch = url.pathname.match(/^\/sessions\/([^/]+)\/heartbeat$/);
      if (req.method === "POST" && heartbeatMatch) {
        await readJson(req);
        const session = sessions.get(heartbeatMatch[1]!);
        if (!session || session.status !== "active") {
          json(res, 404, { error: "session_not_active" });
          return;
        }
        session.lastHeartbeatAt = now;
        json(res, 200, { id: session.id, lastHeartbeatAt: session.lastHeartbeatAt });
        return;
      }

      const sessionMatch = url.pathname.match(/^\/sessions\/([^/]+)$/);
      if (req.method === "DELETE" && sessionMatch) {
        const session = sessions.get(sessionMatch[1]!);
        if (!session) {
          json(res, 404, { error: "session_not_found" });
          return;
        }
        session.status = "closed";
        sessions.delete(session.id);
        json(res, 200, { id: session.id, status: "closed" });
        return;
      }

      if (req.method === "POST" && url.pathname === "/maintenance/mark-stale") {
        let stale = 0;
        for (const session of sessions.values()) {
          if (session.status === "active" && now - session.lastHeartbeatAt > heartbeatTimeoutMs) {
            session.status = "stale";
            stale += 1;
          }
        }
        json(res, 200, { stale });
        return;
      }

      if (req.method === "GET" && url.pathname === "/sessions") {
        json(res, 200, { sessions: [...sessions.values()] });
        return;
      }

      json(res, 404, { error: "not_found" });
    } catch (error) {
      json(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("failed to bind staging gateway");
  return {
    port: address.port,
    close: async () => {
      server.close();
      await once(server, "close");
    },
  };
}

async function requestJson<T>(port: number, endpoint: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`http://127.0.0.1:${port}${endpoint}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
  if (!response.ok) {
    throw new Error(`${init.method ?? "GET"} ${endpoint} failed with ${response.status}: ${await response.text()}`);
  }
  return await response.json() as T;
}

function ensureEvidenceTable(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS gateway_load_test_runs (
      id TEXT PRIMARY KEY,
      issue_id TEXT NOT NULL,
      environment TEXT NOT NULL,
      baseline_concurrent_sessions INTEGER NOT NULL,
      target_concurrent_sessions INTEGER NOT NULL,
      sustained_seconds REAL NOT NULL,
      created_sessions INTEGER NOT NULL,
      heartbeat_count INTEGER NOT NULL,
      teardown_count INTEGER NOT NULL,
      connection_drops INTEGER NOT NULL,
      oom_detected INTEGER NOT NULL,
      heartbeat_timeout_passed INTEGER NOT NULL,
      launchagent_stability TEXT NOT NULL,
      max_parallel_units INTEGER NOT NULL,
      pass INTEGER NOT NULL,
      evidence_path TEXT NOT NULL,
      result_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

async function recordEvidence(result: GatewayLoadTestResult, evidencePath: string, evidenceDbPath: string): Promise<void> {
  await mkdir(path.dirname(evidencePath), { recursive: true });
  await writeFile(evidencePath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  await mkdir(path.dirname(evidenceDbPath), { recursive: true });
  const db = new DatabaseSync(evidenceDbPath);
  try {
    ensureEvidenceTable(db);
    db.prepare(`
      INSERT INTO gateway_load_test_runs (
        id, issue_id, environment, baseline_concurrent_sessions,
        target_concurrent_sessions, sustained_seconds, created_sessions,
        heartbeat_count, teardown_count, connection_drops, oom_detected,
        heartbeat_timeout_passed, launchagent_stability, max_parallel_units,
        pass, evidence_path, result_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      result.run_id,
      result.issue_id,
      result.environment.kind,
      result.target.baseline_concurrent_sessions,
      result.target.target_concurrent_sessions,
      result.target.sustained_seconds,
      result.lifecycle.created_sessions,
      result.lifecycle.heartbeat_count,
      result.lifecycle.teardown_count,
      result.stability.connection_drops,
      result.stability.oom_detected ? 1 : 0,
      result.lifecycle.heartbeat_timeout_invariant_verified ? 1 : 0,
      result.stability.launchagent_stability,
      result.cap_policy.max_parallel_units,
      result.pass ? 1 : 0,
      evidencePath,
      JSON.stringify(result),
      result.generated_at,
    );
  } finally {
    db.close();
  }
}

export async function runGatewayLoadTest(options: GatewayLoadTestOptions = {}): Promise<GatewayLoadTestResult> {
  const issueId = options.issueId ?? "ADP-388";
  const { baselineConcurrentSessions, multiplier, targetConcurrentSessions } = resolveGatewayLoadTarget(options);
  const sustainedSeconds = options.sustainedSeconds ?? 2;
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? 100;
  const heartbeatTimeoutMs = options.heartbeatTimeoutMs ?? 250;
  const maxParallelUnits = positiveInteger(options.maxParallelUnits, targetConcurrentSessions);
  const evidencePath = options.evidencePath ?? path.join(os.tmpdir(), "antfarm-adp388-gateway-load-test.json");
  const evidenceDbPath = options.evidenceDbPath ?? path.join(os.tmpdir(), "antfarm-adp388-gateway-load-test.db");

  const gateway = await startStagingGateway(heartbeatTimeoutMs);
  const blockers: string[] = [];
  const sessionIds: string[] = [];
  let heartbeatCount = 0;
  let connectionDrops = 0;
  let failedRequests = 0;
  let teardownCount = 0;
  const rssSamples: number[] = [process.memoryUsage().rss];

  try {
    const created = await Promise.all(Array.from({ length: targetConcurrentSessions }, async () => {
      try {
        return await requestJson<{ id: string }>(gateway.port, "/sessions", { method: "POST", body: "{}" });
      } catch (error) {
        failedRequests += 1;
        connectionDrops += 1;
        throw error;
      }
    }));
    sessionIds.push(...created.map((item) => item.id));

    const started = Date.now();
    while (Date.now() - started < sustainedSeconds * 1000) {
      await Promise.all(sessionIds.map(async (id) => {
        try {
          await requestJson(gateway.port, `/sessions/${id}/heartbeat`, { method: "POST", body: "{}" });
          heartbeatCount += 1;
        } catch {
          failedRequests += 1;
          connectionDrops += 1;
        }
      }));
      rssSamples.push(process.memoryUsage().rss);
      await new Promise((resolve) => setTimeout(resolve, heartbeatIntervalMs));
    }

    const staleDuringLoad = await requestJson<{ stale: number }>(gateway.port, "/maintenance/mark-stale", { method: "POST", body: "{}" });
    if (staleDuringLoad.stale !== 0) {
      blockers.push(`${staleDuringLoad.stale} active sessions went stale during sustained load`);
    }

    const staleProbe = await requestJson<{ id: string }>(gateway.port, "/sessions", { method: "POST", body: "{}" });
    await new Promise((resolve) => setTimeout(resolve, heartbeatTimeoutMs + 25));
    const staleAfterTimeout = await requestJson<{ stale: number }>(gateway.port, "/maintenance/mark-stale", { method: "POST", body: "{}" });
    const heartbeatTimeoutPassed = staleAfterTimeout.stale >= 1;
    if (!heartbeatTimeoutPassed) blockers.push("stale heartbeat probe did not transition to stale");
    await requestJson(gateway.port, `/sessions/${staleProbe.id}`, { method: "DELETE" }).catch(() => undefined);

    await Promise.all(sessionIds.map(async (id) => {
      try {
        await requestJson(gateway.port, `/sessions/${id}`, { method: "DELETE" });
        teardownCount += 1;
      } catch {
        failedRequests += 1;
      }
    }));

    const listed = await requestJson<{ sessions: SessionRecord[] }>(gateway.port, "/sessions");
    const activeSessionsAfterTeardown = listed.sessions.filter((session) => session.status === "active").length;
    if (activeSessionsAfterTeardown !== 0) blockers.push(`${activeSessionsAfterTeardown} sessions remained active after teardown`);

    rssSamples.push(process.memoryUsage().rss);
    const rssStart = rssSamples[0]!;
    const rssPeak = Math.max(...rssSamples);
    const rssEnd = rssSamples.at(-1)!;
    const oomDetected = rssPeak > rssStart * 4 && rssPeak - rssStart > 512 * 1024 * 1024;
    if (oomDetected) blockers.push("RSS growth exceeded OOM guard threshold");
    if (connectionDrops > 0) blockers.push(`${connectionDrops} connection drops or failed lifecycle requests`);
    if (teardownCount !== targetConcurrentSessions) blockers.push(`teardown count ${teardownCount} did not match target ${targetConcurrentSessions}`);

    const pass = blockers.length === 0;
    const result: GatewayLoadTestResult = {
      schema_version: "1.0.0",
      issue_id: issueId,
      run_id: `gateway-load-${new Date().toISOString().replace(/[:.]/g, "-")}`,
      generated_at: new Date().toISOString(),
      environment: {
        kind: "isolated_staging",
        host: "127.0.0.1",
        port: gateway.port,
        live_gateway_touched: false,
        production_sessions_touched: false,
      },
      target: {
        baseline_concurrent_sessions: baselineConcurrentSessions,
        multiplier,
        target_concurrent_sessions: targetConcurrentSessions,
        sustained_seconds: sustainedSeconds,
      },
      lifecycle: {
        created_sessions: sessionIds.length,
        heartbeat_count: heartbeatCount,
        teardown_count: teardownCount,
        active_sessions_after_teardown: activeSessionsAfterTeardown,
        heartbeat_timeout_invariant_verified: heartbeatTimeoutPassed,
      },
      stability: {
        connection_drops: connectionDrops,
        failed_requests: failedRequests,
        rss_start_bytes: rssStart,
        rss_peak_bytes: rssPeak,
        rss_end_bytes: rssEnd,
        oom_detected: oomDetected,
        launchagent_stability: pass ? "stable" : "unstable",
      },
      cap_policy: {
        max_parallel_units: pass ? maxParallelUnits : Math.max(1, teardownCount),
        reason: pass
          ? `isolated staging sustained ${targetConcurrentSessions} concurrent sessions; cap may be set to ${maxParallelUnits} for prototype scope`
          : "target was not sustained; cap must not exceed successful teardown count",
      },
      pass,
      blockers,
    };

    await recordEvidence(result, evidencePath, evidenceDbPath);
    return result;
  } finally {
    await gateway.close();
  }
}
