#!/usr/bin/env node
/** 설치 후 환경 점검: 무엇이 준비됐고 무엇이 비었는지 한 화면에 보여준다. */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { resolvePythonCandidates } from "../lib/transcribe.mjs";
import { omoMcpPaths } from "../lib/omo-mcp.mjs";

const ok = (m) => `  [OK]   ${m}`;
const no = (m) => `  [없음] ${m}`;
const warn = (m) => `  [주의] ${m}`;

function tryRun(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "utf8", windowsHide: true });
  return r.status === 0 ? (r.stdout ?? "").trim() : null;
}

const lines = ["", "plaud-meeting-minutes 환경 점검", ""];

const nodeMajor = Number(process.versions.node.split(".")[0]);
lines.push(
  nodeMajor >= 20
    ? ok(`Node.js ${process.versions.node}`)
    : warn(`Node.js ${process.versions.node} — 20 이상이 필요합니다`),
);

const plaudHome = path.join(os.homedir(), ".plaud");
const tokenFile = path.join(plaudHome, "tokens-mcp.json");
if (fs.existsSync(tokenFile)) {
  lines.push(ok("Plaud MCP 로그인됨 — plaud-fetch latest 로 바로 가져올 수 있습니다"));
} else if (fs.existsSync(plaudHome)) {
  lines.push(warn("Plaud MCP는 설치됐지만 로그인 기록이 없습니다 — npx -y @plaud-ai/mcp@latest install"));
} else {
  lines.push(no("Plaud MCP 미설치 — npx -y @plaud-ai/mcp@latest install"));
}

// 로컬 전사(무료 경로) 점검: CLI가 실제로 찾는 순서 그대로 확인한다.
let localReady = null;
const triedPython = [];
for (const { cmd, args } of resolvePythonCandidates()) {
  const version = tryRun(cmd, [...args, "-c", "import faster_whisper; print(faster_whisper.__version__)"]);
  if (version) {
    localReady = { cmd, version };
    break;
  }
  triedPython.push(cmd);
}

if (localReady) {
  lines.push(ok(`로컬 전사 준비됨 — faster-whisper ${localReady.version}`));
  lines.push(`         (${localReady.cmd})`);
} else {
  lines.push(no("로컬 전사 미설치 — 아래 명령으로 한 번만 설치하면 됩니다"));
  const pkgRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
  if (process.platform === "win32") {
    lines.push(`         py -3 -m venv "${pkgRoot}\\.venv"`);
    lines.push(`         "${pkgRoot}\\.venv\\Scripts\\python.exe" -m pip install faster-whisper`);
  } else {
    lines.push(`         python3 -m venv "${pkgRoot}/.venv"`);
    lines.push(`         "${pkgRoot}/.venv/bin/python" -m pip install faster-whisper`);
  }
}

// OmO 연동 상태
const { configPath: omoMcpPath } = omoMcpPaths();
let omoRegistered = false;
try {
  omoRegistered = Boolean(JSON.parse(fs.readFileSync(omoMcpPath, "utf8"))?.mcpServers?.plaud);
} catch {
  omoRegistered = false;
}
lines.push(
  omoRegistered
    ? ok("OmO에 Plaud MCP 등록됨 (OmO 재시작 후 도구가 보입니다)")
    : no("OmO에 Plaud MCP 미등록 — plaud-minutes --register-omo"),
);

lines.push(
  process.env.OPENAI_API_KEY
    ? ok("OPENAI_API_KEY 설정됨 (--engine openai 사용 가능, 종량 과금)")
    : no("OPENAI_API_KEY 없음 (유료 경로 비활성 — 무료로만 쓰신다면 정상입니다)"),
);

lines.push(
  "",
  "전사 경로는 하나만 준비되면 됩니다.",
  "  1) Plaud 클라우드 전사 — 무료 월 300분 한도 내",
  "  2) --engine local     — 완전 무료·오프라인 (권장)",
  "  3) --engine openai    — 종량 과금",
  "",
);

process.stdout.write(`${lines.join("\n")}\n`);
