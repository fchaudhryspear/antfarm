#!/usr/bin/env node
/**
 * Antfarm Workflow Validator
 * 
 * Validates workflow.yml files for output contract mismatches before runs start.
 * Catches missing outputs, case mismatches, and undefined template variables.
 */

import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

interface Step {
  id: string;
  agent?: string;
  input?: string;
  input_template?: string;
  outputs?: Record<string, string>;
  condition?: string;
  expects?: string[];
}

interface Workflow {
  id: string;
  name: string;
  agents?: Array<{ id: string; name?: string }>;
  steps: Step[];
}

interface Agent {
  id: string;
  name?: string;
  outputs?: Record<string, string>;
}

interface WorkflowWithAgentOutputs {
  id: string;
  name: string;
  agents?: Agent[];
  steps: Step[];
}

interface ValidationError {
  severity: 'error' | 'warning';
  step: string;
  message: string;
  suggestion?: string;
}

interface ValidationResult {
  workflowId: string;
  errors: ValidationError[];
  warnings: ValidationError[];
  outputGraph: Record<string, string[]>;
  inputGraph: Record<string, string[]>;
  valid: boolean;
}

/**
 * Extract all {{steps.X.outputs.Y}} references from a string
 */
function extractStepOutputRefs(text: string): Array<{ step: string; output: string; full: string }> {
  const refs: Array<{ step: string; output: string; full: string }> = [];
  const regex = /\{\{steps\.([a-zA-Z0-9_-]+)\.outputs\.([a-zA-Z0-9_-]+)\}\}/g;
  let match;
  
  while ((match = regex.exec(text)) !== null) {
    refs.push({
      step: match[1],
      output: match[2],
      full: match[0]
    });
  }
  
  return refs;
}

/**
 * Build output graph: which outputs each step produces
 */
function buildOutputGraph(steps: Step[]): Record<string, string[]> {
  const graph: Record<string, string[]> = {};
  
  for (const step of steps) {
    if (step.outputs) {
      graph[step.id] = Object.keys(step.outputs);
    } else {
      graph[step.id] = [];
    }
  }
  
  return graph;
}

/**
 * Build input graph: which step outputs each step consumes
 */
function buildInputGraph(steps: Step[]): Record<string, Array<{ step: string; output: string }>> {
  const graph: Record<string, Array<{ step: string; output: string }>> = {};
  
  for (const step of steps) {
    const refs: Array<{ step: string; output: string }> = [];
    
    // Check input template
    if (step.input) {
      const inputRefs = extractStepOutputRefs(step.input);
      refs.push(...inputRefs.map(r => ({ step: r.step, output: r.output })));
    }
    
    // Check condition
    if (step.condition) {
      const conditionRefs = extractStepOutputRefs(step.condition);
      refs.push(...conditionRefs.map(r => ({ step: r.step, output: r.output })));
    }
    
    graph[step.id] = refs;
  }
  
  return graph;
}

/**
 * Validate output contracts
 */
function validateOutputs(workflow: Workflow): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  
  const outputGraph = buildOutputGraph(workflow.steps);
  const inputGraph = buildInputGraph(workflow.steps);
  
  // Build a map of all declared outputs (case-sensitive)
  const declaredOutputs: Record<string, Set<string>> = {};
  for (const step of workflow.steps) {
    if (step.outputs) {
      declaredOutputs[step.id] = new Set(Object.keys(step.outputs));
    }
  }
  
  // Validate each input reference
  for (const [stepId, refs] of Object.entries(inputGraph)) {
    for (const ref of refs) {
      const producerOutputs = declaredOutputs[ref.step];
      
      if (!producerOutputs) {
        errors.push({
          severity: 'error',
          step: stepId,
          message: `References non-existent step "${ref.step}" in {{steps.${ref.step}.outputs.${ref.output}}}`,
          suggestion: `Step "${ref.step}" must be defined before step "${stepId}"`
        });
        continue;
      }
      
      if (!producerOutputs.has(ref.output)) {
        // Check for case mismatch
        const caseMismatch = Array.from(producerOutputs).find(
          o => o.toLowerCase() === ref.output.toLowerCase()
        );
        
        if (caseMismatch) {
          errors.push({
            severity: 'error',
            step: stepId,
            message: `Output key case mismatch: "${ref.output}" vs declared "${caseMismatch}"`,
            suggestion: `Update reference to {{steps.${ref.step}.outputs.${caseMismatch}}} or rename output to "${ref.output}"`
          });
        } else {
          errors.push({
            severity: 'error',
            step: stepId,
            message: `Step "${ref.step}" does not declare output "${ref.output}"`,
            suggestion: `Add "${ref.output}: <KEY_NAME>" to ${ref.step}'s outputs block`
          });
        }
      }
    }
  }
  
  // Check for outputs that are never consumed (potential dead code)
  const consumedOutputs = new Set<string>();
  for (const refs of Object.values(inputGraph)) {
    for (const ref of refs) {
      consumedOutputs.add(`${ref.step}.${ref.output}`);
    }
  }
  
  for (const step of workflow.steps) {
    if (step.outputs) {
      for (const outputKey of Object.keys(step.outputs)) {
        const fullKey = `${step.id}.${outputKey}`;
        if (!consumedOutputs.has(fullKey)) {
          warnings.push({
            severity: 'warning',
            step: step.id,
            message: `Output "${outputKey}" is declared but never consumed`,
            suggestion: 'Remove unused output or verify it is needed for external integrations'
          });
        }
      }
    }
  }
  
  return {
    workflowId: workflow.id,
    errors,
    warnings,
    outputGraph,
    inputGraph: Object.fromEntries(
      Object.entries(inputGraph).map(([k, v]) => [k, v.map(r => `${r.step}.${r.output}`)])
    ),
    valid: errors.length === 0
  };
}

/**
 * Load and parse workflow.yml
 */
function loadWorkflow(workflowDir: string): Workflow {
  const workflowPath = path.join(workflowDir, 'workflow.yml');
  
  if (!fs.existsSync(workflowPath)) {
    throw new Error(`workflow.yml not found at ${workflowPath}`);
  }
  
  const content = fs.readFileSync(workflowPath, 'utf-8');
  return parseYaml(content) as Workflow;
}

/**
 * Exported validation function for CLI and programmatic use
 */
export async function validateWorkflow(workflowId: string): Promise<ValidationResult & { workflowId: string }> {
  const paths = await import('../installer/paths.js');
  const workflowDir = paths.resolveWorkflowDir(workflowId);
  
  const workflow = loadWorkflow(workflowDir);
  const result = validateOutputs(workflow);
  return { ...result, workflowId: workflow.id };
}

/**
 * Main CLI entry point
 */
async function main() {
  const args = process.argv.slice(2);
  const workflowId = args[0];
  
  if (!workflowId) {
    console.error('Usage: antfarm validate <workflow-id>');
    console.error('');
    console.error('Validates workflow.yml for output contract mismatches.');
    console.error('');
    console.error('Examples:');
    console.error('  antfarm validate security-audit');
    console.error('  antfarm validate feature-dev');
    process.exit(1);
  }
  
  try {
    const result = await validateWorkflow(workflowId);
    
    console.log(`\n📋 Validating workflow: ${result.workflowId}\n`);
    
    // Print output graph
    console.log('📤 Output Graph:');
    for (const [stepId, outputs] of Object.entries(result.outputGraph)) {
      if (outputs.length > 0) {
        console.log(`   ${stepId}: ${outputs.join(', ')}`);
      }
    }
    console.log('');
    
    // Print input graph
    console.log('📥 Input Dependencies:');
    for (const [stepId, deps] of Object.entries(result.inputGraph)) {
      if (deps.length > 0) {
        console.log(`   ${stepId}: ${deps.join(', ')}`);
      }
    }
    console.log('');
    
    // Print errors
    if (result.errors.length > 0) {
      console.log('❌ Errors:');
      for (const err of result.errors) {
        console.log(`   [${err.step}] ${err.message}`);
        if (err.suggestion) {
          console.log(`      💡 ${err.suggestion}`);
        }
      }
      console.log('');
    }
    
    // Print warnings
    if (result.warnings.length > 0) {
      console.log('⚠️  Warnings:');
      for (const warn of result.warnings) {
        console.log(`   [${warn.step}] ${warn.message}`);
        if (warn.suggestion) {
          console.log(`      💡 ${warn.suggestion}`);
        }
      }
      console.log('');
    }
    
    // Summary
    if (result.valid) {
      console.log('✅ Workflow validation passed');
      process.exit(0);
    } else {
      console.log(`❌ Workflow validation failed: ${result.errors.length} error(s), ${result.warnings.length} warning(s)`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

// Only run main if this is the entry point (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
