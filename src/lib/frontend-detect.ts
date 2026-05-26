/**
 * Detects whether a set of changed files includes frontend-related changes.
 * Used by verify/review steps to conditionally add browser-based visual inspection.
 */

const FRONTEND_EXTENSIONS = new Set([
  '.html', '.css', '.scss', '.less', '.jsx', '.tsx', '.vue', '.svelte',
]);

const FRONTEND_DIRS = [
  'public/', 'static/', 'assets/', 'components/', 'pages/', 'views/', 'styles/',
];

const TEST_PATTERNS = ['.test.', '.spec.', '__tests__/'];

function isTestFile(file: string): boolean {
  return TEST_PATTERNS.some(p => file.includes(p));
}

/**
 * Returns true if any of the given file paths represent frontend changes.
 * Ignores test files even if they have frontend extensions.
 */
export function isFrontendChange(files: string[]): boolean {
  return files.some(file => {
    const normalized = file.replace(/\\/g, '/');
    if (isTestFile(normalized)) return false;

    // Check extension
    const dot = normalized.lastIndexOf('.');
    if (dot !== -1) {
      const ext = normalized.slice(dot).toLowerCase();
      if (FRONTEND_EXTENSIONS.has(ext)) return true;
    }

    // Check directory
    return FRONTEND_DIRS.some(dir => normalized.includes(`/${dir}`) || normalized.startsWith(dir));
  });
}
