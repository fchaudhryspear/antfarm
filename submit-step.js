const fs = require('fs');
const { execSync } = require('child_process');

const stepId = '96a57239-7e14-45dd-9fd2-2fc87d88ed4d';
const output = fs.readFileSync('/tmp/antfarm-step-output.txt', 'utf8');

console.log('Submitting output for step:', stepId);
console.log('Output length:', output.length, 'bytes');
console.log('First 100 chars:', output.substring(0, 100));

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
