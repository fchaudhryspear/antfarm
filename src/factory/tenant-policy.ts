import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { rulesetForComplianceClass, type ComplianceClass } from "./redaction.js";

export type Authority = "day2_ops" | "founder" | "system";
export type PolicyDecision = { allowed: boolean; reason: string; requiredAuthority?: Authority };

export const actionTypes = [
  "context_pack_generate",
  "model_call",
  "prompt_render",
  "dashboard_read",
  "dashboard_mutation",
  "rtbf_requests",
  "model_registry_update",
  "tenant_config_update",
  "vault_route_update",
  "incident_response_taken",
  "notification_send",
] as const;

export type ActionType = typeof actionTypes[number];

const authorityRank: Record<Authority, number> = { system: 0, day2_ops: 1, founder: 2 };

export function loadTenantConfig(configDir = path.resolve("config")): Map<string, { complianceClass: ComplianceClass; redactionRuleset: string }> {
  const tenantsYaml = YAML.parse(fs.readFileSync(path.join(configDir, "tenants.yaml"), "utf8"));
  const complianceYaml = YAML.parse(fs.readFileSync(path.join(configDir, "tenant_compliance.yaml"), "utf8"));
  const tenants = tenantsYaml.tenants ?? {};
  const compliance = complianceYaml.tenants ?? {};
  const result = new Map<string, { complianceClass: ComplianceClass; redactionRuleset: string }>();
  for (const [tenantId, tenant] of Object.entries(tenants) as Array<[string, { compliance_class: ComplianceClass }]>) {
    const policy = compliance[tenantId];
    if (!policy) throw new Error(`missing compliance config for tenant: ${tenantId}`);
    if (tenant.compliance_class !== policy.compliance_class) {
      throw new Error(`compliance_class mismatch for ${tenantId}: tenants.yaml=${tenant.compliance_class} tenant_compliance.yaml=${policy.compliance_class}`);
    }
    const expectedRuleset = rulesetForComplianceClass(tenant.compliance_class);
    if (policy.redaction_ruleset !== expectedRuleset) {
      throw new Error(`redaction ruleset mismatch for ${tenantId}: expected ${expectedRuleset}`);
    }
    result.set(tenantId, { complianceClass: tenant.compliance_class, redactionRuleset: policy.redaction_ruleset });
  }
  return result;
}

function requiredAuthority(action: ActionType, complianceClass: ComplianceClass): Authority {
  if (action === "model_registry_update" || action === "tenant_config_update" || action === "vault_route_update") return "founder";
  if (action === "rtbf_requests") return "founder";
  if (complianceClass === "finance" && (action === "model_call" || action === "prompt_render")) return "founder";
  return "day2_ops";
}

export function evaluatePolicy(input: {
  tenantId?: string;
  complianceClass?: ComplianceClass;
  action: string;
  actorAuthority?: Authority;
  timeoutFallbackAuthority?: Authority;
  incidentPreAuthorized?: boolean;
}): PolicyDecision {
  if (!input.tenantId) return { allowed: false, reason: "missing tenant denied" };
  if (!input.complianceClass) return { allowed: false, reason: "unknown tenant denied" };
  if (!actionTypes.includes(input.action as ActionType)) return { allowed: false, reason: "unknown action denied" };
  if (input.incidentPreAuthorized && input.action === "incident_response_taken") {
    return { allowed: true, reason: "bounded incident pre-authorization", requiredAuthority: "day2_ops" };
  }
  const required = requiredAuthority(input.action as ActionType, input.complianceClass);
  const authority = input.actorAuthority ?? input.timeoutFallbackAuthority;
  if (!authority) return { allowed: false, reason: "missing authority denied", requiredAuthority: required };
  if (authorityRank[authority] < authorityRank[required]) {
    return { allowed: false, reason: "insufficient authority denied", requiredAuthority: required };
  }
  return { allowed: true, reason: "allowed", requiredAuthority: required };
}
