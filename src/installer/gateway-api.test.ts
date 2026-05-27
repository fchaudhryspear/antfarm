import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createAgentCronJob, listCronJobs, sendSessionMessage, spawnAgentSession } from "./gateway-api.js";

const originalConfigPath = process.env.OPENCLAW_CONFIG_PATH;
const originalGatewayPassword = process.env.OPENCLAW_GATEWAY_PASSWORD;
const originalFetch = globalThis.fetch;
const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "antfarm-gateway-api-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  if (originalConfigPath === undefined) {
    delete process.env.OPENCLAW_CONFIG_PATH;
  } else {
    process.env.OPENCLAW_CONFIG_PATH = originalConfigPath;
  }
  if (originalGatewayPassword === undefined) {
    delete process.env.OPENCLAW_GATEWAY_PASSWORD;
  } else {
    process.env.OPENCLAW_GATEWAY_PASSWORD = originalGatewayPassword;
  }
  globalThis.fetch = originalFetch;
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("gateway API config resolution", () => {
  it("uses OPENCLAW_CONFIG_PATH and JSON5 gateway auth settings", async () => {
    const dir = await makeTempDir();
    process.env.OPENCLAW_CONFIG_PATH = path.join(dir, "openclaw.json5");
    delete process.env.OPENCLAW_GATEWAY_PASSWORD;
    await fs.writeFile(
      process.env.OPENCLAW_CONFIG_PATH,
      `{
        gateway: {
          port: 19876,
          auth: {
            mode: "token",
            token: "env-path-token",
          },
        },
      }\n`,
      "utf-8",
    );

    let requestedUrl = "";
    let requestedAuth = "";
    globalThis.fetch = (async (input, init) => {
      requestedUrl = String(input);
      requestedAuth = String((init?.headers as Record<string, string>)?.Authorization ?? "");
      return new Response(JSON.stringify({ ok: true, result: { jobs: [] } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const result = await listCronJobs();

    assert.equal(result.ok, true);
    assert.equal(requestedUrl, "http://127.0.0.1:19876/tools/invoke");
    assert.equal(requestedAuth, "Bearer env-path-token");
  });
});

describe("createAgentCronJob CLI fallback", () => {
  it("does not silently drop non-zero schedule anchors", async () => {
    const dir = await makeTempDir();
    process.env.OPENCLAW_CONFIG_PATH = path.join(dir, "openclaw.json5");
    await fs.writeFile(process.env.OPENCLAW_CONFIG_PATH, "{ gateway: { port: 19876 } }\n", "utf-8");

    globalThis.fetch = (async () => {
      return new Response("missing", { status: 404 });
    }) as typeof fetch;

    const result = await createAgentCronJob({
      name: "antfarm/test/developer",
      schedule: { kind: "every", everyMs: 60_000, anchorMs: 60_000 },
      sessionTarget: "isolated",
      agentId: "test_developer",
      payload: { kind: "agentTurn", message: "poll" },
      delivery: { mode: "none" },
      enabled: true,
    });

    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /cannot preserve schedule\.anchorMs/);
  });
});

describe("spawnAgentSession gateway errors", () => {
  it("returns a tool-level gateway error without falling back to CLI", async () => {
    const dir = await makeTempDir();
    process.env.OPENCLAW_CONFIG_PATH = path.join(dir, "openclaw.json5");
    await fs.writeFile(process.env.OPENCLAW_CONFIG_PATH, "{ gateway: { port: 19876 } }\n", "utf-8");

    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ ok: false, error: { message: "bad agent" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const result = await spawnAgentSession({
      agentId: "missing-agent",
      task: "run now",
    });

    assert.deepEqual(result, { ok: false, error: "bad agent" });
  });
});

describe("sendSessionMessage gateway errors", () => {
  it("returns a tool-level gateway error without falling back to CLI", async () => {
    const dir = await makeTempDir();
    process.env.OPENCLAW_CONFIG_PATH = path.join(dir, "openclaw.json5");
    await fs.writeFile(process.env.OPENCLAW_CONFIG_PATH, "{ gateway: { port: 19876 } }\n", "utf-8");

    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ ok: false, error: { message: "session missing" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const result = await sendSessionMessage({
      sessionKey: "agent:missing:main",
      message: "continue",
    });

    assert.deepEqual(result, { ok: false, error: "session missing" });
  });
});
