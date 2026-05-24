const DOMAINS = new Set([
  "security",
  "backend",
  "performance",
  "testing",
  "code-quality",
  "frontend",
  "devops",
  "ux",
  "documentation",
  "product",
]);

const SEVERITIES = new Set(["critical", "high", "medium", "low"]);
const FINDING_ID = /^[A-Z]{2,4}-\d{3}$/;
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

export type StructuredFindingsValidationResult =
  | { valid: true }
  | { valid: false; errors: string[] };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasString(obj: Record<string, unknown>, key: string): boolean {
  return typeof obj[key] === "string" && String(obj[key]).trim().length > 0;
}

function isIntegerScore(value: unknown): boolean {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 100;
}

function validateFinding(finding: unknown, index: number): string[] {
  const prefix = `findings[${index}]`;
  const errors: string[] = [];
  if (!isObject(finding)) return [`${prefix} must be an object`];

  for (const key of ["finding_id", "domain", "severity", "file", "description", "review_agent"]) {
    if (!hasString(finding, key)) errors.push(`${prefix}.${key} is required`);
  }

  if (hasString(finding, "finding_id") && !FINDING_ID.test(String(finding.finding_id))) {
    errors.push(`${prefix}.finding_id must match ${FINDING_ID.source}`);
  }
  if (hasString(finding, "domain") && !DOMAINS.has(String(finding.domain))) {
    errors.push(`${prefix}.domain must be one of ${Array.from(DOMAINS).join(", ")}`);
  }
  if (hasString(finding, "severity") && !SEVERITIES.has(String(finding.severity))) {
    errors.push(`${prefix}.severity must be one of critical, high, medium, low`);
  }
  if (typeof finding.confidence !== "number" || finding.confidence < 0 || finding.confidence > 1) {
    errors.push(`${prefix}.confidence must be a number from 0 to 1`);
  }
  if (finding.line_range !== undefined) {
    if (!Array.isArray(finding.line_range) || finding.line_range.length !== 2 || !finding.line_range.every(Number.isInteger)) {
      errors.push(`${prefix}.line_range must be [start, end] integers when present`);
    }
  }
  return errors;
}

export function validateStructuredFindingsJson(jsonText: string): StructuredFindingsValidationResult {
  let data: unknown;
  try {
    data = JSON.parse(jsonText);
  } catch (err) {
    return { valid: false, errors: [`invalid JSON: ${err instanceof Error ? err.message : String(err)}`] };
  }

  if (!isObject(data)) return { valid: false, errors: ["root must be an object"] };

  const errors: string[] = [];
  for (const key of ["version", "repo_name", "repo_path", "generated_by", "generated_at"]) {
    if (!hasString(data, key)) errors.push(`${key} is required`);
  }
  if (data.version !== "1.0") errors.push('version must be "1.0"');
  if (data.generated_by !== "swarm-code-review-v3") errors.push('generated_by must be "swarm-code-review-v3"');
  if (hasString(data, "generated_at")
    && (!ISO_DATE_TIME.test(String(data.generated_at)) || Number.isNaN(Date.parse(String(data.generated_at))))) {
    errors.push("generated_at must be an ISO 8601 date-time");
  }
  if (!isIntegerScore(data.overall_score)) errors.push("overall_score must be an integer from 0 to 100");

  if (!isObject(data.domain_scores)) {
    errors.push("domain_scores must be an object");
  } else {
    for (const [domain, score] of Object.entries(data.domain_scores)) {
      if (!DOMAINS.has(domain)) errors.push(`domain_scores.${domain} is not a known domain`);
      if (!isIntegerScore(score)) errors.push(`domain_scores.${domain} must be an integer from 0 to 100`);
    }
  }

  if (!Array.isArray(data.findings)) {
    errors.push("findings must be an array");
  } else {
    data.findings.forEach((finding, index) => errors.push(...validateFinding(finding, index)));
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}
