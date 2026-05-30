import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "../db.js";
import { resolveBundledWorkflowsDir } from "../installer/paths.js";
import YAML from "yaml";

import type { RunInfo, StepInfo } from "../installer/status.js";
import { getRunEvents } from "../installer/events.js";
import { getMedicStatus, getRecentMedicChecks } from "../medic/medic.js";
import {
  getProductionGateState,
  type DashboardAuditEvent,
  type FactoryItem,
  type FactoryRun,
} from "../factory/store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DASHBOARD_HOST = "127.0.0.1";
const FOUNDER_ROLES = new Set(["founder", "admin"]);

interface WorkflowDef {
  id: string;
  name: string;
  steps: Array<{ id: string; agent: string }>;
}

function loadWorkflows(): WorkflowDef[] {
  const dir = resolveBundledWorkflowsDir();
  const results: WorkflowDef[] = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const ymlPath = path.join(dir, entry.name, "workflow.yml");
      if (!fs.existsSync(ymlPath)) continue;
      const parsed = YAML.parse(fs.readFileSync(ymlPath, "utf-8"));
      results.push({
        id: parsed.id ?? entry.name,
        name: parsed.name ?? entry.name,
        steps: (parsed.steps ?? []).map((s: any) => ({ id: s.id, agent: s.agent })),
      });
    }
  } catch { /* empty */ }
  return results;
}

function getRuns(workflowId?: string): Array<RunInfo & { steps: StepInfo[] }> {
  const db = getDb();
  const runs = workflowId
    ? db.prepare("SELECT * FROM runs WHERE workflow_id = ? ORDER BY created_at DESC").all(workflowId) as RunInfo[]
    : db.prepare("SELECT * FROM runs ORDER BY created_at DESC").all() as RunInfo[];
  return runs.map((r) => {
    const steps = db.prepare("SELECT * FROM steps WHERE run_id = ? ORDER BY step_index ASC").all(r.id) as StepInfo[];
    return { ...r, steps };
  });
}

function getRunById(id: string): (RunInfo & { steps: StepInfo[] }) | null {
  const db = getDb();
  const run = db.prepare("SELECT * FROM runs WHERE id = ?").get(id) as RunInfo | undefined;
  if (!run) return null;
  const steps = db.prepare("SELECT * FROM steps WHERE run_id = ? ORDER BY step_index ASC").all(run.id) as StepInfo[];
  return { ...run, steps };
}

export type FactoryDashboardScope = {
  tenantId?: string;
  actorRole?: string;
  authorizedTenants?: string[];
};

function safeTenantId(value?: string | null): string | null {
  const tenantId = value?.trim();
  if (!tenantId) return null;
  if (!/^[a-z0-9_:-]+$/i.test(tenantId)) return null;
  return tenantId;
}

function parseAuthorizedTenants(value?: string | null): string[] {
  return (value ?? "")
    .split(",")
    .map((tenant) => safeTenantId(tenant))
    .filter((tenant): tenant is string => tenant !== null);
}

function isFounderRole(actorRole?: string): boolean {
  return FOUNDER_ROLES.has((actorRole ?? "").trim().toLowerCase());
}

function scopeStatus(scope: FactoryDashboardScope): { status: 200 | 400 | 403 | 404; reason?: string; tenantId?: string } {
  const tenantId = safeTenantId(scope.tenantId);
  if (!tenantId) return { status: 400, reason: "missing_tenant_scope" };
  const authorizedTenants = scope.authorizedTenants ?? [tenantId];
  if (!authorizedTenants.includes(tenantId) && !isFounderRole(scope.actorRole)) {
    return { status: 404, reason: "tenant_not_authorized" };
  }
  return { status: 200, tenantId };
}

function tenantWhereClause(tenantId: string): { sql: string; params: [string] } {
  return { sql: "WHERE tenant_id = ?", params: [tenantId] };
}

export function getFactoryTenantMetadata(db = getDb(), scope: FactoryDashboardScope = {}) {
  const tenantId = safeTenantId(scope.tenantId);
  if (!tenantId && !isFounderRole(scope.actorRole)) {
    return { status: 400 as const, error: "missing_tenant_scope" };
  }

  const authorizedTenants = scope.authorizedTenants ?? (tenantId ? [tenantId] : []);
  const rows = tenantId
    ? db.prepare(`
      SELECT id, display_name, compliance_class, status
      FROM factory_tenants
      WHERE id = ?
      ORDER BY id ASC
    `).all(tenantId)
    : db.prepare(`
      SELECT id, display_name, compliance_class, status
      FROM factory_tenants
      ORDER BY id ASC
    `).all();

  const tenants = (rows as Array<Record<string, unknown>>).filter((tenant) => {
    const id = String(tenant.id);
    return isFounderRole(scope.actorRole) || authorizedTenants.includes(id);
  });

  if (tenantId && tenants.length === 0) return { status: 404 as const, error: "tenant_not_authorized" };
  return {
    status: 200 as const,
    scope: tenantId ? "tenant" : "aggregate_metadata",
    tenants,
  };
}

export function getFactoryDashboardAggregate(db = getDb(), scope: FactoryDashboardScope = {}) {
  if (!isFounderRole(scope.actorRole)) {
    return { status: 403 as const, error: "aggregate_scope_requires_founder" };
  }

  const tenantRows = db.prepare(`
    SELECT t.id, t.display_name, t.compliance_class, t.status,
      COUNT(fi.id) AS item_count,
      SUM(CASE WHEN fi.status = 'queued' THEN 1 ELSE 0 END) AS queued_count,
      SUM(CASE WHEN fi.status = 'running' THEN 1 ELSE 0 END) AS running_count,
      SUM(CASE WHEN fi.status = 'blocked' THEN 1 ELSE 0 END) AS blocked_count,
      SUM(CASE WHEN fi.status = 'done' THEN 1 ELSE 0 END) AS done_count
    FROM factory_tenants t
    LEFT JOIN factory_items fi ON fi.tenant_id = t.id
    GROUP BY t.id, t.display_name, t.compliance_class, t.status
    ORDER BY t.id ASC
  `).all() as Array<Record<string, unknown>>;

  const activeRuns = db.prepare(`
    SELECT COALESCE(tenant_id, 'unscoped') AS tenant_id, COUNT(*) AS active_run_count
    FROM factory_runs
    WHERE status IN ('pending', 'running', 'blocked')
    GROUP BY COALESCE(tenant_id, 'unscoped')
  `).all() as Array<{ tenant_id: string; active_run_count: number }>;
  const activeRunCounts = new Map(activeRuns.map((row) => [row.tenant_id, row.active_run_count]));

  return {
    status: 200 as const,
    scope: "aggregate_metadata",
    generatedAt: new Date().toISOString(),
    tenants: tenantRows.map((tenant) => ({
      id: tenant.id,
      display_name: tenant.display_name,
      compliance_class: tenant.compliance_class,
      status: tenant.status,
      item_count: Number(tenant.item_count ?? 0),
      queued_count: Number(tenant.queued_count ?? 0),
      running_count: Number(tenant.running_count ?? 0),
      blocked_count: Number(tenant.blocked_count ?? 0),
      done_count: Number(tenant.done_count ?? 0),
      active_run_count: Number(activeRunCounts.get(String(tenant.id)) ?? 0),
    })),
  };
}

export function getFactoryDashboardSnapshot(db = getDb(), scope: FactoryDashboardScope = {}) {
  const scopeResult = scopeStatus(scope);
  if (scopeResult.status !== 200) {
    return { status: scopeResult.status, error: scopeResult.reason };
  }
  const tenantId = scopeResult.tenantId!;
  const tenantFilter = tenantWhereClause(tenantId);

  const items = db.prepare(`SELECT * FROM factory_items ${tenantFilter.sql} ORDER BY updated_at DESC`).all(...tenantFilter.params) as FactoryItem[];
  const queue = items.filter((item) => ["queued", "blocked", "running"].includes(item.status));
  const activeRuns = db.prepare(`
    SELECT fr.*, fi.title AS factory_item_title, fi.repo AS factory_item_repo
    FROM factory_runs fr
    JOIN factory_items fi ON fi.id = fr.factory_item_id
    WHERE fi.tenant_id = ? AND fr.status IN ('pending', 'running', 'blocked')
    ORDER BY fr.updated_at DESC
  `).all(tenantId) as Array<FactoryRun & { factory_item_title: string; factory_item_repo: string | null }>;

  const itemDetails = items.map((item) => {
    const runs = db.prepare("SELECT * FROM factory_runs WHERE factory_item_id = ? ORDER BY created_at DESC").all(item.id) as FactoryRun[];
    const latestRun = runs[0] ?? null;
    const agentRuns = db.prepare(`
      SELECT ar.* FROM factory_agent_runs ar
      JOIN factory_runs fr ON fr.id = ar.factory_run_id
      WHERE fr.factory_item_id = ?
      ORDER BY ar.created_at DESC
    `).all(item.id);
    const contextPacks = db.prepare("SELECT * FROM factory_context_packs WHERE factory_item_id = ? ORDER BY created_at DESC").all(item.id);
    const artifacts = db.prepare("SELECT * FROM factory_artifacts WHERE factory_item_id = ? ORDER BY created_at DESC").all(item.id);
    const gates = db.prepare("SELECT * FROM factory_gates WHERE factory_item_id = ? ORDER BY created_at DESC").all(item.id);
    const events = db.prepare("SELECT * FROM factory_events WHERE factory_item_id = ? ORDER BY created_at DESC LIMIT 40").all(item.id);
    const auditEvents = db.prepare("SELECT * FROM dashboard_audit_events WHERE factory_item_id = ? ORDER BY created_at DESC LIMIT 40").all(item.id) as DashboardAuditEvent[];
    const production = getProductionGateState(item.id, db);
    return {
      item,
      latestRun,
      runs,
      agentRuns,
      contextPacks,
      artifacts,
      gates,
      events,
      auditEvents,
      production,
      recoveryControls: latestRun ? {
        canPause: ["pending", "running"].includes(latestRun.status),
        canResume: latestRun.status === "blocked",
        canRetry: ["blocked", "failed", "canceled"].includes(latestRun.status),
        expectedUpdatedAt: latestRun.updated_at,
        commands: {
          pause: `antfarm factory operator pause-run --factory-run-id ${latestRun.id} --expected-updated-at ${latestRun.updated_at}`,
          resume: `antfarm factory operator resume-run --factory-run-id ${latestRun.id} --expected-updated-at ${latestRun.updated_at}`,
          retry: `antfarm factory operator retry-run --factory-run-id ${latestRun.id} --expected-updated-at ${latestRun.updated_at}`,
        },
      } : null,
      synthesisLinks: artifacts.filter((artifact: any) => artifact.artifact_type === "obsidian_mirror" || String(artifact.title ?? "").toLowerCase().includes("obsidian")),
    };
  });

  const budget = activeRuns.reduce((acc, run) => {
    if (!run.budget_json) return acc;
    try {
      const parsed = JSON.parse(run.budget_json);
      if (typeof parsed.max_usd === "number") acc.maxUsd += parsed.max_usd;
    } catch { /* ignore malformed historical rows */ }
    return acc;
  }, { maxUsd: 0 });

  return {
    status: 200 as const,
    scope: "tenant",
    tenantId,
    generatedAt: new Date().toISOString(),
    queue,
    activeRuns,
    items: itemDetails,
    timeline: itemDetails.flatMap((detail) => [
      ...detail.events.map((event: any) => ({ kind: event.event_type, source: "factory_event", factoryItemId: detail.item.id, createdAt: event.created_at, payload: event.payload_json })),
      ...detail.auditEvents.map((event) => ({ kind: event.command, source: "dashboard_audit_event", factoryItemId: detail.item.id, createdAt: event.created_at, payload: event.payload_json })),
    ]).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 80),
    budget,
  };
}

function json(res: http.ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function serveHTML(res: http.ServerResponse) {
  const htmlPath = path.join(__dirname, "index.html");
  // In dist, index.html won't exist—serve from src
  const srcHtmlPath = path.resolve(__dirname, "..", "..", "src", "server", "index.html");
  const filePath = fs.existsSync(htmlPath) ? htmlPath : srcHtmlPath;
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(fs.readFileSync(filePath, "utf-8"));
}

export function startDashboard(port = 3333, host = DEFAULT_DASHBOARD_HOST): http.Server {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);
    const p = url.pathname;

    if (p === "/api/workflows") {
      return json(res, loadWorkflows());
    }

    const eventsMatch = p.match(/^\/api\/runs\/([^/]+)\/events$/);
    if (eventsMatch) {
      return json(res, getRunEvents(eventsMatch[1]));
    }

    const storiesMatch = p.match(/^\/api\/runs\/([^/]+)\/stories$/);
    if (storiesMatch) {
      const db = getDb();
      const stories = db.prepare(
        "SELECT * FROM stories WHERE run_id = ? ORDER BY story_index ASC"
      ).all(storiesMatch[1]);
      return json(res, stories);
    }

    const runMatch = p.match(/^\/api\/runs\/(.+)$/);
    if (runMatch) {
      const run = getRunById(runMatch[1]);
      return run ? json(res, run) : json(res, { error: "not found" }, 404);
    }

    if (p === "/api/runs") {
      const wf = url.searchParams.get("workflow") ?? undefined;
      return json(res, getRuns(wf));
    }

    if (p === "/api/factory/tenant-metadata") {
      const body = getFactoryTenantMetadata(getDb(), {
        tenantId: url.searchParams.get("tenant_id") ?? undefined,
        actorRole: url.searchParams.get("actor_role") ?? undefined,
        authorizedTenants: parseAuthorizedTenants(url.searchParams.get("authorized_tenants")),
      });
      return json(res, body, body.status);
    }

    if (p === "/api/factory/dashboard") {
      if (url.searchParams.get("scope") === "aggregate") {
        const body = getFactoryDashboardAggregate(getDb(), {
          actorRole: url.searchParams.get("actor_role") ?? undefined,
        });
        return json(res, body, body.status);
      }
      const body = getFactoryDashboardSnapshot(getDb(), {
        tenantId: url.searchParams.get("tenant_id") ?? undefined,
        actorRole: url.searchParams.get("actor_role") ?? undefined,
        authorizedTenants: parseAuthorizedTenants(url.searchParams.get("authorized_tenants")),
      });
      return json(res, body, body.status);
    }

    // Medic API
    if (p === "/api/medic/status") {
      return json(res, await getMedicStatus());
    }

    if (p === "/api/medic/checks") {
      const limit = parseInt(url.searchParams.get("limit") ?? "20", 10);
      return json(res, getRecentMedicChecks(limit));
    }

    // Serve fonts
    if (p.startsWith("/fonts/")) {
      const fontName = path.basename(p);
      const fontPath = path.resolve(__dirname, "..", "..", "assets", "fonts", fontName);
      const srcFontPath = path.resolve(__dirname, "..", "..", "src", "..", "assets", "fonts", fontName);
      const resolvedFont = fs.existsSync(fontPath) ? fontPath : srcFontPath;
      if (fs.existsSync(resolvedFont)) {
        res.writeHead(200, { "Content-Type": "font/woff2", "Cache-Control": "public, max-age=31536000" });
        return res.end(fs.readFileSync(resolvedFont));
      }
    }

    // Serve logo
    if (p === "/logo.jpeg") {
      const logoPath = path.resolve(__dirname, "..", "..", "assets", "logo.jpeg");
      const srcLogoPath = path.resolve(__dirname, "..", "..", "src", "..", "assets", "logo.jpeg");
      const resolvedLogo = fs.existsSync(logoPath) ? logoPath : srcLogoPath;
      if (fs.existsSync(resolvedLogo)) {
        res.writeHead(200, { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400" });
        return res.end(fs.readFileSync(resolvedLogo));
      }
    }

    // Serve frontend
    serveHTML(res);
  });

  server.listen(port, host, () => {
    console.log(`Antfarm Dashboard: http://${host}:${port}`);
  });

  return server;
}
