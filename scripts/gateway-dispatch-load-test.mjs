#!/usr/bin/env node
import { selectImmediateDispatchAgents } from "../dist/installer/gateway-concurrency.js";

function numberArg(name, fallback) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  const value = Number.parseInt(process.argv[idx + 1] ?? "", 10);
  return Number.isFinite(value) ? value : fallback;
}

const agents = numberArg("--agents", 25);
const cap = numberArg("--cap", 5);
const iterations = numberArg("--iterations", 5);
const ids = Array.from({ length: agents }, (_, index) => `agent-${index + 1}`);

let maxSelected = 0;
let maxDeferred = 0;
for (let i = 0; i < iterations; i++) {
  const result = selectImmediateDispatchAgents(ids, cap);
  maxSelected = Math.max(maxSelected, result.selected.length);
  maxDeferred = Math.max(maxDeferred, result.deferred.length);
}

const pass = maxSelected <= cap;
console.log(JSON.stringify({
  agents,
  cap,
  iterations,
  max_selected_per_tick: maxSelected,
  max_deferred_per_tick: maxDeferred,
  pass,
}, null, 2));

process.exitCode = pass ? 0 : 1;
