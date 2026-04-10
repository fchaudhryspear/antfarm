#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { resolveWorkflowDir } from '../installer/paths.js';

interface WorkflowAgent { id: string; workspace?: { baseDir?: string; files?: Record<string, string> }; }
interface WorkflowStep { id: string; agent?: string; input?: string; expects?: string | string[]; }
interface WorkflowSpec {
  id: string;
  context?: Record<string, unknown>;
  agents?: WorkflowAgent[];
  steps?: WorkflowStep[];
}
interface LintIssue { file: string; line?: number; ruleId: string; message: string; }
interface LintResult { workflowId: string; issues: LintIssue[]; warnings: LintIssue[]; ok: boolean; }

const STALE_MODELS = ['glm-5:cloud', 'deepseek', 'mb_mixtral'];
const CANONICAL_CONTEXT_VARS = new Set(['task', 'repo_path', 'repo_name', 'branch', 'prd_path', 'arch_path', 'feature_request', 'exclude_patterns', 'scope', 'focus_areas', 'review_mode', 'diff_base', 'findings', 'findings_format', 'build_cmd', 'test_cmd', 'safe_consolidate', 'verify', 'staging_url', 'deploy_cmd', 'smoke_test_cmd', 'version', 'previous_version', 'baseline_test_count', 'tech_stack', 'target_users', 'url', 's3_bucket', 'cloudfront_dist_id', 'frontend_build_cmd', 'frontend_build_dir', 'priority', 'max_fixes_per_domain', 'fix_directive', 'review_directive', 'release_directive']);

function lineOf(text: string, needle: string): number | undefined {
  const idx = text.indexOf(needle);
  if (idx < 0) return undefined;
  return text.slice(0, idx).split('\n').length;
}

function extractTemplateVars(text: string): string[] {
  const vars = new Set<string>();
  const re = /\{\{\s*([^}]+?)\s*\}\}/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    vars.add(m[1].trim());
  }
  return [...vars];
}

function runWorkflowLint(workflowId: string): LintResult {
  const workflowDir = resolveWorkflowDir(workflowId);
  const workflowPath = path.join(workflowDir, 'workflow.yml');
  const workflowRaw = fs.readFileSync(workflowPath, 'utf8');
  const workflow = parseYaml(workflowRaw) as WorkflowSpec;
  const issues: LintIssue[] = [];
  const warnings: LintIssue[] = [];

  // Rule: no-tilde-paths
  if (/~\//.test(workflowRaw)) {
    issues.push({ file: 'workflow.yml', line: lineOf(workflowRaw, '~/'), ruleId: 'no-tilde-paths', message: 'Use absolute paths, not ~/' });
  }

  // Rule: repo-path-required
  if (!(workflow.context && Object.prototype.hasOwnProperty.call(workflow.context, 'repo_path'))) {
    issues.push({ file: 'workflow.yml', ruleId: 'repo-path-required', message: 'repo_path context var required' });
  }

  // Rule: no-stale-models
  for (const bad of STALE_MODELS) {
    const idx = workflowRaw.indexOf(bad);
    if (idx >= 0) {
      issues.push({ file: 'workflow.yml', line: lineOf(workflowRaw, bad), ruleId: 'no-stale-models', message: `${bad} is stale or unreliable` });
    }
  }

  // Rule: no-undefined-vars
  const stepIds = new Set((workflow.steps ?? []).map(s => s.id));
  const contextVars = new Set([...(workflow.context ? Object.keys(workflow.context) : []), ...CANONICAL_CONTEXT_VARS]);
  for (const step of workflow.steps ?? []) {
    const input = step.input ?? '';
    for (const rawVar of extractTemplateVars(input)) {
      const v = rawVar.replace(/\s*\|.*$/, '');
      if (v.startsWith('steps.')) {
        const parts = v.split('.');
        if (parts.length < 3 || !stepIds.has(parts[1])) {
          issues.push({ file: 'workflow.yml', line: lineOf(workflowRaw, rawVar), ruleId: 'no-undefined-vars', message: `Template var ${rawVar} references undefined prior step` });
        }
      } else if (!contextVars.has(v) && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(v)) {
        continue;
      } else if (!contextVars.has(v)) {
        issues.push({ file: 'workflow.yml', line: lineOf(workflowRaw, rawVar), ruleId: 'no-undefined-vars', message: `Template var ${rawVar} not in context or prior step output` });
      }
    }
  }

  // Rule: expects-key-match (basic: expects must appear in input of some downstream step or be final consolidate-style output)
  const allInputs = (workflow.steps ?? []).map(s => s.input ?? '').join('\n');
  for (const step of workflow.steps ?? []) {
    const expects = Array.isArray(step.expects) ? step.expects : step.expects ? [step.expects] : [];
    for (const exp of expects) {
      const token = exp.replace(/[:\s].*$/, '');
      const referenced = allInputs.includes(`steps.${step.id}.`) || allInputs.includes(token) || /^(OVERALL_SCORE|PR_URL|QA_STATUS|RELEASE_STATUS|ARCH_STATUS|PRD_STATUS|VERIFY_STATUS|SETUP_OK|STATUS|SCORE|ACCEPTANCE_RESULT|E2E_RESULT|LOAD_RESULT|REGRESSION_RESULT|DEPLOY_STATUS|SMOKE_STATUS|RELEASE_NOTES_STATUS|ARCH_INTAKE_PARSED)$/.test(token);
      if (!referenced) {
        warnings.push({ file: 'workflow.yml', line: lineOf(workflowRaw, exp), ruleId: 'expects-key-match', message: `Output key ${token} not obviously referenced downstream` });
      }
    }
  }

  // Rule: compiler-needs-validator
  const stepIdsLower = new Set((workflow.steps ?? []).map(s => s.id.toLowerCase()));
  for (const step of workflow.steps ?? []) {
    const id = step.id.toLowerCase();
    if (/(consolidate|compile|aggregate)/.test(id) && ![...stepIdsLower].some(s => s.startsWith('validate-') || s.includes('validate'))) {
      warnings.push({ file: 'workflow.yml', line: lineOf(workflowRaw, step.id), ruleId: 'compiler-needs-validator', message: 'Compiler/consolidator step has no downstream validate step' });
    }
  }

  // Agent file rules
  for (const agent of workflow.agents ?? []) {
    const files = agent.workspace?.files ?? {};
    for (const [name, rel] of Object.entries(files)) {
      if (!name.endsWith('AGENTS.md')) continue;
      const p = path.join(workflowDir, rel);
      if (!fs.existsSync(p)) {
        issues.push({ file: rel, ruleId: 'missing-agent-file', message: 'Referenced AGENTS.md file missing' });
        continue;
      }
      const raw = fs.readFileSync(p, 'utf8');
      if (/~\//.test(raw)) {
        issues.push({ file: rel, line: lineOf(raw, '~/'), ruleId: 'no-tilde-paths', message: 'Use absolute paths, not ~/' });
      }
      if (!raw.includes('cd {{ repo_path }}') && !raw.includes('cd {{repo_path}}')) {
        issues.push({ file: rel, ruleId: 'mandatory-first-step', message: 'Agent missing mandatory first step (cd {{ repo_path }})' });
      }
      if (!/if .*not found.*report|If .*not found.*report|If you cannot find/i.test(raw)) {
        warnings.push({ file: rel, ruleId: 'no-fabrication-clause', message: 'Agent missing anti-fabrication clause' });
      }
      const isDirectFixer = workflowId === 'swarm-code-fix-v1' && /agents\/fix-/.test(rel);
      if (isDirectFixer && !/MANDATORY OUTPUT FORMAT[\s\S]*STATUS:[\s\S]*CHANGES:[\s\S]*FILES_MODIFIED:/m.test(raw)) {
        issues.push({ file: rel, ruleId: 'mandatory-fix-output-block', message: 'Fixer agent missing mandatory output block (STATUS/CHANGES/FILES_MODIFIED)' });
      }
      for (const bad of STALE_MODELS) {
        if (raw.includes(bad)) {
          issues.push({ file: rel, line: lineOf(raw, bad), ruleId: 'no-stale-models', message: `${bad} is stale or unreliable` });
        }
      }
    }
  }

  return { workflowId: workflow.id, issues, warnings, ok: issues.length === 0 };
}

export async function lintWorkflow(workflowId: string): Promise<LintResult> {
  return runWorkflowLint(workflowId);
}

async function main() {
  const workflowId = process.argv[2];
  if (!workflowId) {
    console.error('Usage: antfarm workflow lint <workflow-id>');
    process.exit(1);
  }
  const result = runWorkflowLint(workflowId);
  console.log(result.workflowId);
  for (const issue of result.issues) {
    console.log(` ✗ ${issue.file}${issue.line ? ':' + issue.line : ''} ${issue.ruleId} ${issue.message}`);
  }
  for (const warn of result.warnings) {
    console.log(` ! ${warn.file}${warn.line ? ':' + warn.line : ''} ${warn.ruleId} ${warn.message}`);
  }
  console.log(`\n${result.issues.length} errors, ${result.warnings.length} warnings`);
  process.exit(result.ok ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
