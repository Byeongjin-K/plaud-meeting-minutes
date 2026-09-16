/**
 * OmO 에 Plaud MCP 서버를 등록한다.
 *
 * OmO 는 `~/.omo/agent/mcp.json`(global) 과 프로젝트 설정을 읽고, 같은 이름의 서버가 있으면
 * 사용자 설정이 우선한다. 여기서는 global 설정에 plaud 항목만 더하고 나머지는 그대로 둔다.
 *
 * 주의: 등록 후에는 OmO 세션을 완전히 재시작해야 도구가 보인다(세션 시작 시 서버를 띄우므로).
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const SERVER_NAME = "plaud";
const PACKAGE_SPEC = "@plaud-ai/mcp@latest";
const WINDOWS_NPX = "C:\\Program Files\\nodejs\\npx.cmd";

export function omoMcpPaths({ home = os.homedir(), platform = process.platform, env = process.env } = {}) {
  const p = platform === "win32" ? path.win32 : path.posix;
  const agentDir = env?.OMO_AGENT_DIR ?? p.join(home, ".omo", "agent");
  return { agentDir, configPath: p.join(agentDir, "mcp.json") };
}

/** 기존 설정을 보존하면서 plaud 항목만 추가/갱신한 새 설정 객체를 만든다. */
export function buildOmoMcpConfig(existing, { platform = process.platform, npxPath } = {}) {
  const base = existing && typeof existing === "object" && !Array.isArray(existing) ? { ...existing } : {};
  const servers =
    base.mcpServers && typeof base.mcpServers === "object" && !Array.isArray(base.mcpServers)
      ? { ...base.mcpServers }
      : {};

  const previous =
    servers[SERVER_NAME] && typeof servers[SERVER_NAME] === "object" && !Array.isArray(servers[SERVER_NAME])
      ? servers[SERVER_NAME]
      : {};

  servers[SERVER_NAME] = {
    ...previous,
    type: "stdio",
    command: npxPath ?? (platform === "win32" ? WINDOWS_NPX : "npx"),
    args: ["-y", PACKAGE_SPEC],
    enabled: true,
  };

  return { ...base, mcpServers: servers };
}

/**
 * 실제 파일에 등록한다.
 * OmO 설정 디렉터리가 없으면 아무것도 쓰지 않고 이유를 돌려준다.
 */
export async function registerOmoMcp({ home, platform = process.platform, npxPath, env } = {}) {
  const { agentDir, configPath } = omoMcpPaths({ home, platform, env });

  const dirExists = await fs.access(agentDir).then(() => true, () => false);
  if (!dirExists) {
    return { ok: false, reason: "omo-not-found", agentDir, configPath };
  }

  let existing = null;
  let backupPath = null;
  try {
    const raw = await fs.readFile(configPath, "utf8");
    existing = JSON.parse(raw);
    backupPath = `${configPath}.bak`;
    await fs.writeFile(backupPath, raw, "utf8");
  } catch {
    existing = null;
  }

  const alreadyRegistered = Boolean(existing?.mcpServers?.[SERVER_NAME]);
  const next = buildOmoMcpConfig(existing, { platform, npxPath });
  await fs.writeFile(configPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");

  return {
    ok: true,
    configPath,
    backupPath,
    alreadyRegistered,
    servers: Object.keys(next.mcpServers),
  };
}

export const __internals = { SERVER_NAME, PACKAGE_SPEC, WINDOWS_NPX };
