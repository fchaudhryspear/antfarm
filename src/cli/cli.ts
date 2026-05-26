#!/usr/bin/env node

try {
  await import("node:sqlite");
} catch {
  console.error(
    `Error: node:sqlite is not available.\n\n` +
    `Antfarm requires Node.js >= 22.13.0 with native SQLite support.\n` +
    `If you have Bun installed, its \`node\` wrapper does not support node:sqlite via ESM.\n\n` +
    `Fix: ensure the real Node.js 22.13.0+ is first on your PATH.\n` +
    `  Check: node -e "require('node:sqlite')"\n` +
    `  See: https://github.com/snarktank/antfarm/issues/54`
  );
  process.exit(1);
}

await import("./cli-main.js");
