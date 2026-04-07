import fs from 'node:fs';
import { execSync } from 'node:child_process';

const stepId = '96a57239-7e14-45dd-9fd2-2fc87d88ed4d';

// Fixed format with STATUS line and FINDINGS count on same line
const output = `STATUS: complete
SCORE: 72/100
CATEGORY: code-quality
FINDINGS: 7
1. high | app.py | Generic exception handler catches all errors without specific error types | Use specific exception classes (e.g., pd.ParserError, FileNotFoundError) instead of bare except Exception
2. medium | app.py | No type hints on functions (clean_cols, validate_upload, load_templates, etc.) | Add type annotations for parameters and return values to improve IDE support and catch type errors
3. medium | tests/test_app.py | clean_cols function duplicated in tests instead of importing from app.py | Import and test the actual function from app.py to avoid drift between implementation and tests
4. low | app.py | Magic numbers hardcoded (CHUNK_SIZE=50000, MAX_FILE_SIZE=500MB, rate limit=5 attempts) | Move configuration constants to a config file or environment variables
5. low | app.py | String concatenation for session-scoped paths (CONFIG_FILE, TEMP_OUTPUT) | Use pathlib.Path for safer path construction and cross-platform compatibility
6. low | tests/test_mapping.py | Overlapping test coverage with test_app.py (template save/load, file validation) | Consolidate duplicate tests or use test_app.py for integration tests and test_mapping.py for unit tests
7. low | app.py | save_templates lacks docstring while other helpers have them | Add docstring describing atomic write behavior and error handling`;

console.log('Submitting output for step:', stepId);
console.log('Output length:', output.length, 'bytes');

try {
  const result = execSync(
    `node /Users/faisalshomemacmini/.openclaw/workspace/antfarm/dist/cli/cli.js step complete "${stepId}"`,
    { 
      input: output,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024
    }
  );
  console.log('Result:', result);
} catch (error) {
  console.error('Error:', error.message);
  console.error('Stdout:', error.stdout);
  console.error('Stderr:', error.stderr);
  process.exit(1);
}
