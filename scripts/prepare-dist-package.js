#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const distPackagePath = join(root, "dist", "package.json");

if (!existsSync(distPackagePath)) {
  throw new Error("dist/package.json does not exist; copy package.json before preparing dist manifest");
}

const distPkg = JSON.parse(readFileSync(distPackagePath, "utf8"));
distPkg.bin = {
  ...distPkg.bin,
  antfarm: "cli/cli.js",
};

writeFileSync(distPackagePath, `${JSON.stringify(distPkg, null, 2)}\n`, "utf8");
