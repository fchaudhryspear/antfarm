import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

export type DashboardSession = {
  id: string;
  actor: string;
  actorRole: string;
  authorizedTenants: string[];
};

export function createDashboardSession(input: {
  db: DatabaseSync;
  actor: string;
  actorRole: string;
  authorizedTenants: string[];
  token: string;
  ttlSeconds?: number;
}): DashboardSession {
  const id = crypto.randomUUID();
  const now = new Date();
  const expires = new Date(now.getTime() + (input.ttlSeconds ?? 3600) * 1000);
  input.db.prepare(`
    INSERT INTO factory_dashboard_sessions (
      id, actor, actor_role, authorized_tenants_json, token_hash, issued_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.actor,
    input.actorRole,
    JSON.stringify([...new Set(input.authorizedTenants)].sort()),
    crypto.createHash("sha256").update(input.token).digest("hex"),
    now.toISOString(),
    expires.toISOString(),
  );
  return { id, actor: input.actor, actorRole: input.actorRole, authorizedTenants: input.authorizedTenants };
}

export function getDashboardSessionByToken(db: DatabaseSync, token: string): DashboardSession | null {
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const row = db.prepare(`
    SELECT id, actor, actor_role, authorized_tenants_json, expires_at
    FROM factory_dashboard_sessions
    WHERE token_hash = ?
  `).get(tokenHash) as {
    id: string;
    actor: string;
    actor_role: string;
    authorized_tenants_json: string;
    expires_at: string;
  } | undefined;
  if (!row) return null;
  if (Date.parse(row.expires_at) <= Date.now()) return null;

  let authorizedTenants: string[];
  try {
    const parsed = JSON.parse(row.authorized_tenants_json);
    if (!Array.isArray(parsed) || parsed.some((tenant) => typeof tenant !== "string")) return null;
    authorizedTenants = parsed;
  } catch {
    return null;
  }

  return {
    id: row.id,
    actor: row.actor,
    actorRole: row.actor_role,
    authorizedTenants,
  };
}

export function enforceTenantRead(input: {
  db: DatabaseSync;
  session: DashboardSession;
  tenantId?: string;
  resourceTenantId?: string;
  bodyTargetTenantId?: string;
}): { status: 200 | 400 | 403 | 404 } {
  if (!input.tenantId) return audit(input, 400, "missing_tenant_scope");
  if (input.bodyTargetTenantId && input.bodyTargetTenantId !== input.tenantId) return audit(input, 403, "url_body_tenant_mismatch");
  if (!input.session.authorizedTenants.includes(input.tenantId)) return audit(input, 404, "tenant_not_authorized");
  if (input.resourceTenantId && input.resourceTenantId !== input.tenantId) return audit(input, 404, "resource_tenant_mismatch");
  return { status: 200 };
}

export function enforceTenantMutation(input: {
  db: DatabaseSync;
  session: DashboardSession;
  tenantId?: string;
  bodyTargetTenantId?: string;
}): { status: 200 | 400 | 403 } {
  if (!input.tenantId) return audit(input, 400, "missing_tenant_scope");
  if (input.bodyTargetTenantId && input.bodyTargetTenantId !== input.tenantId) return audit(input, 403, "url_body_tenant_mismatch");
  if (!input.session.authorizedTenants.includes(input.tenantId)) return audit(input, 403, "tenant_not_authorized_for_mutation");
  return { status: 200 };
}

function audit<T extends 400 | 403 | 404>(input: { db: DatabaseSync; session: DashboardSession; tenantId?: string }, status: T, reason: string): { status: T } {
  input.db.prepare(`
    INSERT INTO factory_tenant_audit_log (
      id, tenant_id, event_type, actor, actor_role, actor_class, payload_json, created_at
    ) VALUES (?, ?, 'dashboard_scope_denied', ?, ?, 'operator', ?, datetime('now'))
  `).run(
    crypto.randomUUID(),
    input.tenantId ?? null,
    input.session.actor,
    input.session.actorRole,
    JSON.stringify({ reason, http_status: status, authorized_tenants: input.session.authorizedTenants }),
  );
  return { status };
}
