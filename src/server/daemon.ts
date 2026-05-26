#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { startDashboard } from "./dashboard.js";
import { startIndependentCleanupTimer } from "../installer/step-ops.js";

const port = parseInt(process.argv[2], 10) || 3333;

const pidDir = path.join(os.homedir(), ".openclaw", "antfarm");
const pidFile = path.join(pidDir, "dashboard.pid");

function writePidFile() {
  fs.mkdirSync(pidDir, { recursive: true });
  fs.writeFileSync(pidFile, String(process.pid));
}

function removePidFile() {
  try {
    if (fs.readFileSync(pidFile, "utf-8").trim() === String(process.pid)) {
      fs.unlinkSync(pidFile);
    }
  } catch {}
}

process.on("SIGTERM", () => {
  removePidFile();
  process.exit(0);
});

process.on("SIGINT", () => {
  removePidFile();
  process.exit(0);
});

process.on("exit", removePidFile);

const server = startDashboard(port);
server.once("listening", () => {
  writePidFile();
  startIndependentCleanupTimer();
});
server.once("error", (error) => {
  removePidFile();
  console.error(error);
  process.exit(1);
});
