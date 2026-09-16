/**
 * 전사 엔진 플러그.
 *
 *  - "none"   (기본): 오디오를 직접 전사하지 않는다. 유료 API 무단 호출을 막기 위한 기본값.
 *  - "local"  : 로컬 faster-whisper 호출. 완전 무료·오프라인. 권장 경로.
 *  - "openai" : OpenAI 전사 API 호출 (OPENAI_API_KEY 필요, 종량 과금).
 *
 * Plaud 클라우드가 이미 전사한 결과를 쓰는 경우에는 이 모듈이 필요 없다.
 * (MCP `get_transcript` 결과 JSON을 그대로 CLI 입력으로 주면 된다.)
 */

import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { DEFAULT_MODEL } from "./config.mjs";

export const AUDIO_EXTENSIONS = [
  ".mp3", ".m4a", ".wav", ".opus", ".aac", ".flac", ".ogg", ".wma", ".mp4", ".amr", ".3gp",
];

export function isAudioFile(filePath) {
  return AUDIO_EXTENSIONS.includes(path.extname(filePath).toLowerCase());
}

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * 용어집 입력을 전사에 넘길 한 줄짜리 목록으로 정리한다.
 * 파일 경로면 파일 내용을, 아니면 값 자체를 쓴다. 쉼표와 줄바꿈 어느 쪽으로 구분해도 받는다.
 */
export async function resolveTerms(spec, { readFile = fs.readFile, stat = fs.stat } = {}) {
  if (typeof spec !== "string" || spec.trim() === "") return undefined;

  const asPath = path.resolve(spec);
  const isFile = await stat(asPath).then((s) => s.isFile(), () => false);
  const raw = isFile ? await readFile(asPath, "utf8") : spec;
  const terms = raw.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);

  return terms.length > 0 ? terms.join(", ") : undefined;
}

/**
 * 어떤 Python으로 faster-whisper를 돌릴지 후보를 우선순위대로 만든다.
 * 사용자가 설치 위치를 몰라도 되도록 레포/작업폴더의 .venv 를 시스템 Python보다 먼저 본다.
 */
export function resolvePythonCandidates({
  platform = process.platform,
  packageRoot = PACKAGE_ROOT,
  cwd = process.cwd(),
  env = process.env,
} = {}) {
  const isWin = platform === "win32";
  const p = isWin ? path.win32 : path.posix;
  const venvPython = (root) =>
    isWin ? p.join(root, ".venv", "Scripts", "python.exe") : p.join(root, ".venv", "bin", "python");

  const out = [];
  const push = (cmd, args = []) => {
    if (cmd && !out.some((c) => c.cmd === cmd)) out.push({ cmd, args });
  };

  if (env.PLAUD_MINUTES_PYTHON) push(env.PLAUD_MINUTES_PYTHON);
  if (packageRoot) push(venvPython(packageRoot));
  if (cwd) push(venvPython(cwd));
  if (isWin) {
    push("py", ["-3"]);
    push("python");
    push("python3");
  } else {
    push("python3");
    push("python");
  }
  return out;
}

function installHint(root = PACKAGE_ROOT, platform = process.platform) {
  if (platform === "win32") {
    return `    py -3 -m venv "${root}\\.venv"\n    "${root}\\.venv\\Scripts\\python.exe" -m pip install faster-whisper`;
  }
  return `    python3 -m venv "${root}/.venv"\n    "${root}/.venv/bin/python" -m pip install faster-whisper`;
}

const NO_ENGINE_MESSAGE = `오디오 파일을 전사하려면 전사 엔진을 지정해야 합니다.

  1) 로컬 whisper — 완전 무료·오프라인 (권장)
     plaud-minutes <오디오파일> --engine local
     처음 한 번만 설치가 필요합니다:
${installHint()}

  2) Plaud 클라우드 전사 — 무료 월 300분 한도 내에서 추가 비용 없음
     AI 클라이언트에서 Plaud MCP로 get_transcript / get_file 을 실행해 결과 JSON을 저장한 뒤,
     그 JSON 파일을 이 CLI의 입력으로 주세요.

  3) OpenAI 전사 API — 종량 과금
     set OPENAI_API_KEY=sk-...
     plaud-minutes <오디오파일> --engine openai`;

function localSetupMessage(tried) {
  return `로컬 전사 엔진(faster-whisper)을 찾지 못했습니다.

확인한 Python: ${tried.length > 0 ? tried.join(", ") : "(없음)"}

처음 한 번만 설치하면 됩니다:
${installHint()}

이미 다른 곳에 설치했다면 그 Python을 직접 지정할 수 있습니다:
    set PLAUD_MINUTES_PYTHON=C:\\경로\\python.exe`;
}

async function transcribeOpenAI(filePath, { apiKey, model, language }) {
  const key = apiKey ?? process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("OPENAI_API_KEY 환경변수가 없습니다. 키를 설정하거나 --engine local 을 사용하세요.");
  }

  const bytes = await fs.readFile(filePath);
  const form = new FormData();
  form.append("file", new Blob([bytes]), path.basename(filePath));
  form.append("model", model ?? "whisper-1");
  form.append("response_format", "verbose_json");
  if (language) form.append("language", language);

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenAI 전사 실패 (HTTP ${res.status}): ${body.slice(0, 400)}`);
  }
  return res.json();
}

function runPython(cmd, args, { onStderr, env } = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1", ...env },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += d.toString("utf8"); });
    child.stderr.on("data", (d) => {
      const s = d.toString("utf8");
      stderr += s;
      onStderr?.(s);
    });
    child.on("error", (err) => resolve({ ok: false, code: -1, stdout, stderr: `${stderr}${err}` }));
    child.on("close", (code) => resolve({ ok: code === 0, code, stdout, stderr }));
  });
}

async function transcribeLocal(filePath, { model, language, terms, onProgress } = {}) {
  const script = path.join(PACKAGE_ROOT, "scripts", "transcribe_local.py");
  const tried = [];
  const env = terms ? { PLAUD_MINUTES_TERMS: terms } : undefined;

  for (const { cmd, args } of resolvePythonCandidates()) {
    const probe = await runPython(cmd, [...args, "-c", "import faster_whisper"]);
    if (!probe.ok) {
      tried.push(cmd);
      continue;
    }

    const r = await runPython(cmd, [...args, script, filePath, model ?? DEFAULT_MODEL, language ?? ""], {
      onStderr: onProgress,
      env,
    });
    if (!r.ok) {
      throw new Error(`로컬 전사에 실패했습니다 (${cmd}):\n${(r.stderr || r.stdout).slice(0, 800)}`);
    }
    try {
      return JSON.parse(r.stdout);
    } catch {
      throw new Error(`로컬 전사 결과를 해석하지 못했습니다:\n${r.stdout.slice(0, 400)}`);
    }
  }

  throw new Error(localSetupMessage(tried));
}

export async function transcribeAudio(filePath, { engine = "none", apiKey, model, language = "ko", terms, onProgress } = {}) {
  switch (engine) {
    case "none":
      throw new Error(NO_ENGINE_MESSAGE);
    case "openai":
      return transcribeOpenAI(filePath, { apiKey, model, language });
    case "local":
      return transcribeLocal(filePath, { model, language, terms, onProgress });
    default:
      throw new Error(`알 수 없는 전사 엔진입니다: ${engine} (none | openai | local)`);
  }
}

export const __internals = { NO_ENGINE_MESSAGE, localSetupMessage, installHint, PACKAGE_ROOT };
