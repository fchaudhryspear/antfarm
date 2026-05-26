import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { migrateDb } from "../db.js";
import { createDashboardSession, enforceTenantMutation, enforceTenantRead } from "./dashboard-isolation.js";
import { opaqueSubjectHandle, recordNotificationDeletionAttempt, validateNotificationPayload } from "./notification-policy.js";
import { recordDeploymentEvent, recordSmokeTestStub } from "./production-gates.js";
import { assertModelEligible, redactText } from "./redaction.js";
import { hashedAuditPayload, requestRtbf, subjectIdHash, transitionRtbf, upsertSubjectRegistry } from "./rtbf.js";
import { evaluatePolicy, loadTenantConfig } from "./tenant-policy.js";

function memoryDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  migrateDb(db);
  return db;
}

describe("v3.1 tenant policy", () => {
  it("validates tenant and compliance configs", () => {
    const tenants = loadTenantConfig();
    assert.equal(tenants.get("flobase")?.complianceClass, "finance");
    assert.equal(tenants.get("utility_valet")?.redactionRuleset, "default_v1");
  });

  it("denies unknown actions and insufficient fallback authority", () => {
    assert.equal(evaluatePolicy({ tenantId: "flobase", complianceClass: "finance", action: "unknown", actorAuthority: "founder" }).allowed, false);
    const decision = evaluatePolicy({ tenantId: "flobase", complianceClass: "finance", action: "rtbf_requests", timeoutFallbackAuthority: "day2_ops" });
    assert.equal(decision.allowed, false);
    assert.equal(decision.requiredAuthority, "founder");
    assert.equal(evaluatePolicy({ tenantId: "flobase", complianceClass: "finance", action: "rtbf_requests", actorAuthority: "founder" }).allowed, true);
    assert.equal(evaluatePolicy({ tenantId: "flobase", complianceClass: "finance", action: "incident_response_taken", incidentPreAuthorized: true }).allowed, true);
  });
});

describe("v3.1 redaction and model gates", () => {
  it("redacts finance data without over-redacting default rules", () => {
    const finance = redactText("acct 1234567890 routing 021000021 txn id ACH-12345678 paid $1,250.00", "finance_v1");
    assert.match(finance.text, /\[REDACTED_ACCOUNT_NUMBER]/);
    assert.match(finance.text, /\[REDACTED_ROUTING_NUMBER]/);
    assert.match(finance.text, /\[REDACTED_TRANSACTION_ID]/);
    assert.match(finance.text, /\[REDACTED_AMOUNT]/);

    const def = redactText("paid $1,250.00", "default_v1");
    assert.equal(def.text, "paid $1,250.00");
  });

  it("blocks disallowed finance transaction-path models", () => {
    assert.throws(() => assertModelEligible({ complianceClass: "finance", action: "model_call", model: "openrouter/free" }));
    assert.doesNotThrow(() => assertModelEligible({ complianceClass: "finance", action: "model_call", model: "local/qwen2.5-coder:32b" }));
  });
});

describe("v3.1 dashboard isolation", () => {
  it("returns adversarial HTTP statuses and audit rows", () => {
    const db = memoryDb();
    const session = createDashboardSession({ db, actor: "day2", actorRole: "day2_ops", authorizedTenants: ["flobase"], token: "token" });
    assert.equal(enforceTenantRead({ db, session }).status, 400);
    assert.equal(enforceTenantRead({ db, session, tenantId: "credologi" }).status, 404);
    assert.equal(enforceTenantMutation({ db, session, tenantId: "credologi" }).status, 403);
    assert.equal(enforceTenantRead({ db, session, tenantId: "flobase", bodyTargetTenantId: "credologi" }).status, 403);
    assert.equal(enforceTenantRead({ db, session, tenantId: "flobase", resourceTenantId: "credologi" }).status, 404);
    const row = db.prepare("SELECT COUNT(*) AS n FROM factory_tenant_audit_log WHERE event_type = 'dashboard_scope_denied'").get() as { n: number };
    assert.equal(row.n, 5);
  });
});

describe("v3.1 notification and production gate recording", () => {
  it("rejects raw PII notification payloads and records deletion attempts", () => {
    const db = memoryDb();
    assert.throws(() => validateNotificationPayload({
      tenant_id: "flobase",
      work_item_id: "ADP-422",
      message: "email test@example.com",
    }));
    const handle = opaqueSubjectHandle("flobase", "test@example.com");
    validateNotificationPayload({ tenant_id: "flobase", work_item_id: "ADP-422", subject_handle: handle, message: "See dashboard." });
    recordNotificationDeletionAttempt({ db, tenantId: "flobase", notificationId: "tg_1", channel: "telegram", success: true });
    const row = db.prepare("SELECT COUNT(*) AS n FROM factory_tenant_audit_log WHERE event_type = 'notification_delete_attempt'").get() as { n: number };
    assert.equal(row.n, 1);
  });

  it("records manual v3.1 deployment and smoke-test stub results", () => {
    const db = memoryDb();
    const deployId = recordDeploymentEvent({ db, tenantId: "flobase", environment: "controlled", service: "flobase-prototype", status: "manual_recorded" });
    recordSmokeTestStub({ db, tenantId: "flobase", deploymentEventId: deployId, suite: "v3.1-manual-smoke", status: "passed" });
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM factory_deployment_events").get() as { n: number }).n, 1);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM factory_smoke_test_runs").get() as { n: number }).n, 1);
  });
});

describe("v3.1 audit enforcement and RTBF", () => {
  it("rejects malformed tenant audit rows and raw PII audit payloads", () => {
    const db = memoryDb();
    assert.throws(() => db.prepare(`
      INSERT INTO factory_tenant_audit_log (id, event_type, tenant_id, payload_json, created_at)
      VALUES ('bad_missing_tenant', 'rtbf_state_transition', NULL, '{}', datetime('now'))
    `).run());
    assert.throws(() => db.prepare(`
      INSERT INTO factory_tenant_audit_log (id, event_type, tenant_id, payload_json, created_at)
      VALUES ('bad_unknown', 'surprise_event', 'flobase', '{}', datetime('now'))
    `).run());
    assert.throws(() => db.prepare(`
      INSERT INTO factory_tenant_audit_log (id, event_type, tenant_id, event_chain_type, payload_json, created_at)
      VALUES ('bad_pii', 'rtbf_state_transition', 'flobase', 'rtbf_workflow', '{"email":"person@example.com"}', datetime('now'))
    `).run());
  });

  it("rejects raw PII in factory_events payloads", () => {
    const db = memoryDb();
    db.prepare(`
      INSERT INTO factory_items (id, title, description, created_at, updated_at, tenant_id)
      VALUES ('fi_pii', 'PII test', '', datetime('now'), datetime('now'), 'flobase')
    `).run();
    assert.throws(() => db.prepare(`
      INSERT INTO factory_events (id, factory_item_id, event_type, payload_json, created_at, tenant_id)
      VALUES ('fe_pii', 'fi_pii', 'workflow.note', '{"account":"123456789"}', datetime('now'), 'flobase')
    `).run());
  });

  it("tracks finance RTBF without storing natural subject identifiers", () => {
    const db = memoryDb();
    const subjectHash = upsertSubjectRegistry({
      db,
      tenantId: "flobase",
      tenantLookupPepper: "tenant-pepper",
      naturalSubjectId: "person@example.com",
      envelopeKeyId: "kms://tenant/flobase/subject/opaque",
    });
    assert.equal(subjectHash, subjectIdHash("tenant-pepper", "person@example.com"));
    assert.ok(!subjectHash.includes("person"));
    requestRtbf({ db, id: "rtbf_1", tenantId: "flobase", subjectIdHash: subjectHash, requestedBy: "faisal" });
    const reversibleProof = transitionRtbf({
      db,
      requestId: "rtbf_1",
      tenantId: "flobase",
      subjectIdHash: subjectHash,
      nextState: "reversible",
      actor: "faisal",
      proofSigningSecret: "proof-secret",
      kmsDeletionEvidence: { key_state: "disabled", backup_state: "retained_reversible" },
    });
    const finalizedProof = transitionRtbf({
      db,
      requestId: "rtbf_1",
      tenantId: "flobase",
      subjectIdHash: subjectHash,
      nextState: "finalized",
      actor: "faisal",
      proofSigningSecret: "proof-secret",
      kmsDeletionEvidence: { key_state: "deleted", backup_state: "destroyed" },
    });
    assert.notEqual(reversibleProof, finalizedProof);
    const proofRows = db.prepare("SELECT payload_json, subject_id_hash FROM factory_tenant_audit_log WHERE event_type = 'rtbf_state_transition'").all() as Array<{ payload_json: string; subject_id_hash: string }>;
    assert.equal(proofRows.length, 2);
    assert.equal(proofRows.every((row) => row.subject_id_hash === subjectHash), true);
    assert.equal(proofRows.some((row) => row.payload_json.includes("person@example.com")), false);
  });

  it("keeps future PII tenant hashing testable and opaque", () => {
    const first = subjectIdHash("future-pii-pepper", "lease-123456");
    const second = subjectIdHash("future-pii-pepper-rotated", "lease-123456");
    assert.notEqual(first, second);
    assert.deepEqual(Object.keys(hashedAuditPayload("envelope", { lease: "lease-123456" })), ["lease_hash"]);
  });
});
