import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

export type RtbfState = "active" | "rtbf_requested" | "rtbf_reversible" | "rtbf_finalized";

function hmac(secret: string, value: string): string {
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

function signProof(secret: string, payload: unknown): string {
  return hmac(secret, JSON.stringify(payload));
}

export function subjectIdHash(tenantLookupPepper: string, naturalSubjectId: string): string {
  return `subh_${hmac(tenantLookupPepper, naturalSubjectId)}`;
}

export function hashedAuditPayload(envelopeSecret: string, fields: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [`${key}_hash`, hmac(envelopeSecret, value)]),
  );
}

export function upsertSubjectRegistry(input: {
  db: DatabaseSync;
  tenantId: string;
  tenantLookupPepper: string;
  naturalSubjectId: string;
  envelopeKeyId: string;
}): string {
  const subjectHash = subjectIdHash(input.tenantLookupPepper, input.naturalSubjectId);
  input.db.prepare(`
    INSERT INTO factory_subject_registry (
      tenant_id, subject_id_hash, envelope_key_id, rtbf_state, created_at, updated_at
    ) VALUES (?, ?, ?, 'active', datetime('now'), datetime('now'))
    ON CONFLICT(tenant_id, subject_id_hash) DO UPDATE SET
      envelope_key_id = excluded.envelope_key_id,
      updated_at = excluded.updated_at
  `).run(input.tenantId, subjectHash, input.envelopeKeyId);
  return subjectHash;
}

export function requestRtbf(input: {
  db: DatabaseSync;
  id: string;
  tenantId: string;
  subjectIdHash: string;
  requestedBy: string;
}): void {
  input.db.prepare(`
    INSERT INTO factory_rtbf_requests (
      id, tenant_id, subject_id_hash, state, requested_by, requested_at
    ) VALUES (?, ?, ?, 'requested', ?, datetime('now'))
  `).run(input.id, input.tenantId, input.subjectIdHash, input.requestedBy);
  input.db.prepare(`
    UPDATE factory_subject_registry
    SET rtbf_state = 'rtbf_requested', rtbf_requested_at = datetime('now'), updated_at = datetime('now')
    WHERE tenant_id = ? AND subject_id_hash = ?
  `).run(input.tenantId, input.subjectIdHash);
}

export function transitionRtbf(input: {
  db: DatabaseSync;
  requestId: string;
  tenantId: string;
  subjectIdHash: string;
  nextState: "reversible" | "finalized";
  actor: string;
  proofSigningSecret: string;
  kmsDeletionEvidence: Record<string, string>;
}): string {
  const registry = input.db.prepare(`
    SELECT rtbf_state, legal_hold FROM factory_subject_registry WHERE tenant_id = ? AND subject_id_hash = ?
  `).get(input.tenantId, input.subjectIdHash) as { rtbf_state: RtbfState; legal_hold: number } | undefined;
  if (!registry) throw new Error("unknown subject");
  if (registry.legal_hold) throw new Error("legal hold blocks RTBF transition");
  if (input.nextState === "finalized" && registry.rtbf_state !== "rtbf_reversible") {
    throw new Error("finalization requires reversible window");
  }

  const requestState = input.nextState;
  const expectedRequestState = input.nextState === "reversible" ? "requested" : "reversible";
  const request = input.db.prepare(`
    SELECT state FROM factory_rtbf_requests WHERE id = ? AND tenant_id = ? AND subject_id_hash = ?
  `).get(input.requestId, input.tenantId, input.subjectIdHash) as { state: string } | undefined;
  if (!request) throw new Error("unknown RTBF request");
  if (request.state !== expectedRequestState) throw new Error("RTBF request state mismatch");

  const registryState = input.nextState === "reversible" ? "rtbf_reversible" : "rtbf_finalized";
  const proof = {
    request_id: input.requestId,
    tenant_id: input.tenantId,
    subject_id_hash: input.subjectIdHash,
    state: requestState,
    kms_deletion_evidence: input.kmsDeletionEvidence,
  };
  const proofId = `proof_${crypto.randomUUID()}`;
  const signature = signProof(input.proofSigningSecret, proof);
  input.db.exec("BEGIN IMMEDIATE");
  try {
    input.db.prepare(`
      UPDATE factory_rtbf_requests
      SET state = ?, reversible_at = CASE WHEN ? = 'reversible' THEN datetime('now') ELSE reversible_at END,
        finalized_at = CASE WHEN ? = 'finalized' THEN datetime('now') ELSE finalized_at END,
        deletion_proof_id = ?
      WHERE id = ? AND tenant_id = ? AND subject_id_hash = ?
    `).run(requestState, requestState, requestState, proofId, input.requestId, input.tenantId, input.subjectIdHash);
    input.db.prepare(`
      UPDATE factory_subject_registry
      SET rtbf_state = ?,
        rtbf_reversible_at = CASE WHEN ? = 'rtbf_reversible' THEN datetime('now') ELSE rtbf_reversible_at END,
        rtbf_finalized_at = CASE WHEN ? = 'rtbf_finalized' THEN datetime('now') ELSE rtbf_finalized_at END,
        deletion_proof_id = ?,
        updated_at = datetime('now')
      WHERE tenant_id = ? AND subject_id_hash = ?
    `).run(registryState, registryState, registryState, proofId, input.tenantId, input.subjectIdHash);
    input.db.prepare(`
      INSERT INTO factory_tenant_audit_log (
        id, tenant_id, event_type, event_chain_type, actor, actor_role, actor_class,
        payload_json, subject_id_hash, signature, created_at
      ) VALUES (?, ?, 'rtbf_state_transition', 'rtbf_workflow', ?, 'founder', 'founder', ?, ?, ?, datetime('now'))
    `).run(proofId, input.tenantId, input.actor, JSON.stringify(proof), input.subjectIdHash, signature);
    input.db.exec("COMMIT");
  } catch (error) {
    input.db.exec("ROLLBACK");
    throw error;
  }
  return proofId;
}
