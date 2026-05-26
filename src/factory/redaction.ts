export type RedactionRulesetVersion = "default_v1" | "finance_v1" | "pii_v1";
export type ComplianceClass = "default" | "finance" | "pii";

type Pattern = { name: string; regex: RegExp; replacement: string };

const commonPatterns: Pattern[] = [
  { name: "secret", regex: /\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*["']?[\w./+=-]{8,}/gi, replacement: "[REDACTED_SECRET]" },
  { name: "email", regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, replacement: "[REDACTED_EMAIL]" },
  { name: "phone", regex: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g, replacement: "[REDACTED_PHONE]" },
];

const financePatterns: Pattern[] = [
  { name: "routing_number", regex: /\b(?:routing|aba)\s*(?:number|#)?\s*[:=]?\s*\d{9}\b/gi, replacement: "[REDACTED_ROUTING_NUMBER]" },
  { name: "account_number", regex: /\b(?:account|acct)\s*(?:number|#)?\s*[:=]?\s*\d{6,17}\b/gi, replacement: "[REDACTED_ACCOUNT_NUMBER]" },
  { name: "transaction_id", regex: /\b(?:transaction|txn|ach)\s*(?:id|#)?\s*[:=]?\s*[A-Z0-9-]{8,}\b/gi, replacement: "[REDACTED_TRANSACTION_ID]" },
  { name: "currency_amount", regex: /\$\s?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{2})?\b/g, replacement: "[REDACTED_AMOUNT]" },
];

const piiPatterns: Pattern[] = [
  { name: "ssn", regex: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: "[REDACTED_SSN]" },
  { name: "address", regex: /\b\d{1,6}\s+[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+){0,4}\s+(?:St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Ln|Lane|Blvd|Boulevard)\b/gi, replacement: "[REDACTED_ADDRESS]" },
  { name: "lease_id", regex: /\b(?:lease|tenant)\s*(?:id|#)?\s*[:=]?\s*[A-Z0-9-]{6,}\b/gi, replacement: "[REDACTED_LEASE_ID]" },
];

export function rulesetForComplianceClass(complianceClass: ComplianceClass): RedactionRulesetVersion {
  if (complianceClass === "finance") return "finance_v1";
  if (complianceClass === "pii") return "pii_v1";
  return "default_v1";
}

export function redactText(input: string, ruleset: RedactionRulesetVersion): { text: string; redactions: string[] } {
  let text = input;
  const applied = new Set<string>();
  const patterns = [
    ...commonPatterns,
    ...(ruleset === "finance_v1" ? financePatterns : []),
    ...(ruleset === "pii_v1" ? piiPatterns : []),
  ];
  for (const pattern of patterns) {
    const next = text.replace(pattern.regex, () => {
      applied.add(pattern.name);
      return pattern.replacement;
    });
    text = next;
  }
  return { text, redactions: [...applied].sort() };
}

const disallowedFinanceModels = new Set([
  "openrouter/free",
  "xai/grok-beta",
  "unknown",
  "untrusted",
]);

const financeSensitiveActions = new Set([
  "context_pack_generate",
  "model_call",
  "prompt_render",
  "transaction_path_work",
]);

export function assertModelEligible(input: {
  complianceClass: ComplianceClass;
  action: string;
  model: string;
}): void {
  if (input.complianceClass !== "finance") return;
  if (!financeSensitiveActions.has(input.action)) return;
  const lowered = input.model.toLowerCase();
  if (disallowedFinanceModels.has(lowered) || lowered.includes("free") || lowered.includes("untrusted")) {
    throw new Error(`model denied for finance transaction-path work: ${input.model}`);
  }
}
