import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

const piiPatterns: Array<[string, RegExp]> = [
  ["email", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
  ["phone", /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/],
  ["ssn", /\b\d{3}-\d{2}-\d{4}\b/],
  ["routing_number", /\b(?:routing|aba)\s*(?:number|#)?\s*[:=]?\s*\d{9}\b/i],
  ["account_number", /\b(?:account|acct)\s*(?:number|#)?\s*[:=]?\s*\d{6,17}\b/i],
  ["address", /\b\d{1,6}\s+[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+){0,4}\s+(?:St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Ln|Lane|Blvd|Boulevard)\b/i],
  ["lease_id", /\b(?:lease|tenant)\s*(?:id|#)?\s*[:=]?\s*[A-Z0-9-]{6,}\b/i],
  ["transaction_id", /\b(?:transaction|txn|ach)\s*(?:id|#)?\s*[:=]?\s*[A-Z0-9-]{8,}\b/i],
];

export type SafeNotificationPayload = {
  tenant_id: string;
  work_item_id: string;
  subject_handle?: string;
  dashboard_url?: string;
  audit_url?: string;
  message: string;
};

export function opaqueSubjectHandle(tenantId: string, subjectIdentifier: string): string {
  return `sub_${crypto.createHash("sha256").update(`${tenantId}:${subjectIdentifier}`).digest("hex").slice(0, 16)}`;
}

export function validateNotificationPayload(payload: SafeNotificationPayload): void {
  const body = JSON.stringify(payload);
  const failures = piiPatterns.filter(([, pattern]) => pattern.test(body)).map(([name]) => name);
  if (failures.length) {
    throw new Error(`notification payload contains raw PII: ${failures.join(",")}`);
  }
}

export function recordNotificationDeletionAttempt(input: {
  db: DatabaseSync;
  tenantId: string;
  notificationId: string;
  channel: "telegram" | "hermes";
  success: boolean;
  error?: string;
}): void {
  input.db.prepare(`
    INSERT INTO factory_tenant_audit_log (
      id, tenant_id, event_type, actor, actor_role, actor_class, payload_json, created_at
    ) VALUES (?, ?, 'notification_delete_attempt', 'system', 'runtime', 'system', ?, datetime('now'))
  `).run(
    crypto.randomUUID(),
    input.tenantId,
    JSON.stringify({
      notification_id: input.notificationId,
      channel: input.channel,
      success: input.success,
      error: input.error ?? null,
    }),
  );
}
