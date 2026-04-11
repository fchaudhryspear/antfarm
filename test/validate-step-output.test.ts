import { describe, it, expect } from 'vitest';
import { validateStepOutput, getAgentSchema, parseExpects, validateContractAndDispatch } from '../src/validate-step-output.js';

describe('consolidate schema routing', () => {
  it('review consolidate gets consolidate-review schema', () => {
    expect(getAgentSchema('swarm-code-review-v3_consolidate')).toBe('consolidate-review');
  });

  it('fix consolidate gets consolidate-fix schema', () => {
    expect(getAgentSchema('swarm-code-fix-v1_consolidate-pr')).toBe('consolidate-fix');
  });

  it('implement consolidate gets consolidate-fix schema', () => {
    expect(getAgentSchema('swarm-implement-v1_consolidate')).toBe('consolidate-fix');
  });

  it('bare consolidate defaults to consolidate-review (safe)', () => {
    expect(getAgentSchema('consolidate')).toBe('consolidate-review');
  });

  it('review consolidate passes without PR_URL', () => {
    const output = 'STATUS: ok\nOVERALL_SCORE: 78\nDOMAIN_SCORES: code-quality: 78\nCRITICAL_ISSUES: none\nACTION_PLAN: ship it';
    const result = validateStepOutput(output, 'swarm-code-review-v3_consolidate');
    expect(result.valid).toBe(true);
  });

  it('review consolidate passes with just STATUS', () => {
    const output = 'STATUS: ok';
    const result = validateStepOutput(output, 'swarm-code-review-v3_consolidate');
    expect(result.valid).toBe(true);
  });

  it('fix consolidate fails without PR_URL', () => {
    const output = 'STATUS: ok\nCHANGES: fixed stuff';
    const result = validateStepOutput(output, 'swarm-code-fix-v1_consolidate-pr');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.missingFields).toContain('PR_URL');
    }
  });

  it('fix consolidate passes with STATUS + PR_URL', () => {
    const output = 'STATUS: ok\nPR_URL: https://github.com/org/repo/pull/42';
    const result = validateStepOutput(output, 'swarm-code-fix-v1_consolidate-pr');
    expect(result.valid).toBe(true);
  });
});

describe('other schema routing', () => {
  it('review agent gets review schema', () => {
    expect(getAgentSchema('swarm-code-review-v3_code-quality')).toBe('review');
  });

  it('fix agent gets fix schema', () => {
    expect(getAgentSchema('swarm-code-fix-v1_fix-security')).toBe('fix');
  });

  it('setup agent gets setup schema', () => {
    expect(getAgentSchema('swarm-code-fix-v1_setup')).toBe('setup');
  });

  it('smoke agents get correct schemas', () => {
    expect(getAgentSchema('smoke-test-v1_smoke-deployer')).toBe('smoke-deploy');
    expect(getAgentSchema('smoke-test-v1_smoke-tester')).toBe('smoke-test');
    expect(getAgentSchema('smoke-test-v1_smoke-reverter')).toBe('smoke-revert');
  });

  it('unknown agent defaults to review (safe)', () => {
    expect(getAgentSchema('some-random-agent')).toBe('review');
  });
});

// ── Runtime Contract Enforcement Tests (PR 1) ─────────────────────────

describe('parseExpects', () => {
  it('parses comma-separated string', () => {
    expect(parseExpects('STATUS, CHANGES, FILES_MODIFIED')).toEqual(['STATUS', 'CHANGES', 'FILES_MODIFIED']);
  });

  it('parses JSON array', () => {
    expect(parseExpects('["STATUS", "CHANGES"]')).toEqual(['STATUS', 'CHANGES']);
  });

  it('parses single key', () => {
    expect(parseExpects('PR_URL')).toEqual(['PR_URL']);
  });

  it('handles null/empty', () => {
    expect(parseExpects(null)).toEqual([]);
    expect(parseExpects('')).toEqual([]);
    expect(parseExpects('   ')).toEqual([]);
  });

  it('normalizes to uppercase', () => {
    expect(parseExpects('status, changes')).toEqual(['STATUS', 'CHANGES']);
  });
});

describe('validateContractAndDispatch', () => {
  // Test 1: step output passes schema but fails declared expects → step must not be marked done
  it('fails when output passes schema but missing declared expects', () => {
    const output = 'STATUS: done\nCHANGES: fixed bug\nFILES_MODIFIED: src/app.ts';
    const expects = 'STATUS, CHANGES, FILES_MODIFIED, TEST_RESULTS';
    const result = validateContractAndDispatch(output, expects, false);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.missingExpects).toContain('TEST_RESULTS');
    }
  });

  // Test 2: step output satisfies expects → step can complete
  it('passes when output satisfies all declared expects', () => {
    const output = 'STATUS: done\nCHANGES: fixed bug\nFILES_MODIFIED: src/app.ts\nTEST_RESULTS: all passed';
    const expects = 'STATUS, CHANGES, FILES_MODIFIED, TEST_RESULTS';
    const result = validateContractAndDispatch(output, expects, false);
    expect(result.valid).toBe(true);
  });

  // Test 3: dispatch output with SWARM_STATUS: running → must not complete
  it('fails dispatch with SWARM_STATUS: running', () => {
    const output = 'SWARM_STATUS: running\nSUB_STEPS: 3 completed';
    const expects = 'SWARM_STATUS';
    const result = validateContractAndDispatch(output, expects, true);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.swarmStatusInvalid).toBe(true);
    }
  });

  // Test 4: dispatch output with SWARM_STATUS: completed → can complete
  it('passes dispatch with SWARM_STATUS: completed', () => {
    const output = 'SWARM_STATUS: completed\nSUB_STEPS: 3 completed';
    const expects = 'SWARM_STATUS';
    const result = validateContractAndDispatch(output, expects, true);
    expect(result.valid).toBe(true);
  });

  // Test 5: dispatch output with SWARM_STATUS: skipped → can complete
  it('passes dispatch with SWARM_STATUS: skipped', () => {
    const output = 'SWARM_STATUS: skipped\nREASON: no changes needed';
    const expects = 'SWARM_STATUS';
    const result = validateContractAndDispatch(output, expects, true);
    expect(result.valid).toBe(true);
  });

  // Additional edge cases
  it('fails dispatch with SWARM_STATUS: failed', () => {
    const output = 'SWARM_STATUS: failed\nERROR: something broke';
    const expects = 'SWARM_STATUS';
    const result = validateContractAndDispatch(output, expects, true);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.swarmStatusInvalid).toBe(true);
    }
  });

  it('fails dispatch with missing SWARM_STATUS', () => {
    const output = 'SUB_STEPS: 3 completed';
    const expects = 'SWARM_STATUS';
    const result = validateContractAndDispatch(output, expects, true);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.swarmStatusInvalid).toBe(true);
    }
  });

  it('non-dispatch steps ignore SWARM_STATUS gating', () => {
    const output = 'SWARM_STATUS: running\nSTATUS: done';
    const expects = 'STATUS';
    const result = validateContractAndDispatch(output, expects, false);
    expect(result.valid).toBe(true);
  });

  it('handles multiple missing expects', () => {
    const output = 'STATUS: done';
    const expects = 'STATUS, CHANGES, FILES_MODIFIED, TEST_RESULTS';
    const result = validateContractAndDispatch(output, expects, false);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.missingExpects).toEqual(['CHANGES', 'FILES_MODIFIED', 'TEST_RESULTS']);
    }
  });
});
