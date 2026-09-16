import test from "node:test";
import assert from "node:assert/strict";

import { buildOmoMcpConfig, omoMcpPaths } from "../lib/omo-mcp.mjs";

test("설정이 없으면 plaud 항목만 가진 설정을 새로 만든다", () => {
  const got = buildOmoMcpConfig(null, { platform: "linux" });

  assert.deepEqual(Object.keys(got.mcpServers), ["plaud"]);
  assert.equal(got.mcpServers.plaud.type, "stdio");
  assert.equal(got.mcpServers.plaud.command, "npx");
  assert.deepEqual(got.mcpServers.plaud.args, ["-y", "@plaud-ai/mcp@latest"]);
  assert.equal(got.mcpServers.plaud.enabled, true);
});

test("Windows 에서는 npx.cmd 절대 경로를 쓴다", () => {
  const got = buildOmoMcpConfig(null, { platform: "win32", npxPath: "C:\\Program Files\\nodejs\\npx.cmd" });

  assert.equal(got.mcpServers.plaud.command, "C:\\Program Files\\nodejs\\npx.cmd");
});

test("기존 MCP 서버 설정을 지우지 않고 plaud 만 더한다", () => {
  const existing = {
    mcpServers: {
      context7: { type: "http", url: "https://mcp.context7.com/mcp" },
      grep_app: { enabled: false },
    },
    someOtherKey: { keep: true },
  };

  const got = buildOmoMcpConfig(existing, { platform: "linux" });

  assert.deepEqual(Object.keys(got.mcpServers).sort(), ["context7", "grep_app", "plaud"]);
  assert.deepEqual(got.mcpServers.context7, existing.mcpServers.context7);
  assert.equal(got.mcpServers.grep_app.enabled, false);
  assert.deepEqual(got.someOtherKey, { keep: true });
});

test("이미 등록된 plaud 는 최신 실행 명령으로 갱신한다", () => {
  const existing = {
    mcpServers: { plaud: { type: "stdio", command: "old-npx", args: ["-y", "@plaud-ai/mcp@0.1.0"] } },
  };

  const got = buildOmoMcpConfig(existing, { platform: "linux" });

  assert.equal(got.mcpServers.plaud.command, "npx");
  assert.deepEqual(got.mcpServers.plaud.args, ["-y", "@plaud-ai/mcp@latest"]);
});

test("mcpServers 가 객체가 아닌 깨진 설정도 안전하게 복구한다", () => {
  const got = buildOmoMcpConfig({ mcpServers: "망가짐" }, { platform: "linux" });

  assert.equal(typeof got.mcpServers, "object");
  assert.ok(got.mcpServers.plaud);
});

test("OmO 설정 경로는 홈 디렉터리의 .omo/agent/mcp.json 이다", () => {
  const got = omoMcpPaths({ home: "/home/me", platform: "linux" });

  assert.equal(got.agentDir, "/home/me/.omo/agent");
  assert.equal(got.configPath, "/home/me/.omo/agent/mcp.json");
});
