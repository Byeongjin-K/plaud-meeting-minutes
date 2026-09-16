#!/usr/bin/env node
/**
 * plaud-minutes — PLAUD 녹음/전사 → 회의록 마크다운.
 *
 * 두 단계로 동작한다.
 *   1) 준비: 전사를 정규화해 '전사 정리본' + '회의록 작성 요청서'를 만든다.
 *   2) 완성: 요약 결과(sections JSON)를 받아 회의록 마크다운을 저장한다.
 */

import { parseArgs } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeTranscript } from "../lib/normalize.mjs";
import { renderMinutes, renderTranscript } from "../lib/render.mjs";
import { buildMinutesPath } from "../lib/naming.mjs";
import { buildMinutesPrompt } from "../lib/prompt.mjs";
import { isAudioFile, resolveTerms, transcribeAudio, AUDIO_EXTENSIONS } from "../lib/transcribe.mjs";
import { CONFIG_PATH, SOURCE_LABELS, readConfig, resolveModel, resolveRepoRoot, writeConfig } from "../lib/config.mjs";
import { registerOmoMcp } from "../lib/omo-mcp.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TRANSCRIPT_EXTENSIONS = [".json", ".txt", ".md", ".srt", ".vtt", ".text"];

const OPTIONS = {
  title: { type: "string" },
  project: { type: "string" },
  date: { type: "string" },
  attendees: { type: "string" },
  template: { type: "string", default: "default" },
  sections: { type: "string" },
  out: { type: "string" },
  repo: { type: "string" },
  "set-root": { type: "string" },
  "set-model": { type: "string" },
  "register-omo": { type: "boolean", default: false },
  "show-config": { type: "boolean", default: false },
  engine: { type: "string", default: "none" },
  model: { type: "string" },
  terms: { type: "string" },
  language: { type: "string", default: "ko" },
  "dry-run": { type: "boolean", default: false },
  force: { type: "boolean", default: false },
  "transcript-only": { type: "boolean", default: false },
  json: { type: "boolean", default: false },
  help: { type: "boolean", default: false, short: "h" },
  version: { type: "boolean", default: false },
};

function printHelp() {
  process.stdout.write(`plaud-minutes — PLAUD 녹음/전사에서 회의록 마크다운을 만듭니다.

사용법
  plaud-minutes <입력> [옵션]

입력으로 줄 수 있는 것
  - Plaud MCP 결과 JSON (get_file / get_transcript 응답을 저장한 파일)
  - Whisper verbose_json 파일
  - 평문 전사 (.txt/.md), 자막 (.srt/.vtt)
  - 오디오 파일 (${AUDIO_EXTENSIONS.join(" ")}) — --engine 지정 필요
  - 폴더 — 폴더 안에서 가장 최근 파일을 자동으로 고릅니다

옵션
  --title <문자열>       회의 제목
  --project <문자열>     저장할 프로젝트 폴더 이름 (기존 폴더가 있으면 재사용)
  --date <ISO>           회의 일시 (예: 2026-09-16T10:00)
  --attendees <a,b,c>    참석자 목록
  --template <이름>      default | overview   (기본: default)
  --sections <파일>      요약 결과 JSON. 주면 회의록을 최종 저장합니다
  --out <경로>           회의록 출력 경로를 직접 지정
  --repo <경로>          저장소 루트 (기본: 설정된 기본 위치, 없으면 현재 폴더)
  --set-root <경로>      기본 저장 위치를 저장하고 종료합니다
  --show-config          지금 어디에 저장되는지 보여주고 종료합니다
  --engine <이름>        none | openai | local  (기본: none)
  --model <이름>         전사 모델 tiny/base/small/medium/large-v3-turbo (기본: large-v3-turbo)
  --set-model <이름>     기본 전사 모델을 저장하고 종료합니다
  --terms <용어집>       전문용어 목록. 쉼표/줄바꿈으로 구분한 문자열이나 파일 경로.
                         전사할 때 hotwords 로 주입해 전문용어 오인식을 줄입니다
  --register-omo         OmO에 Plaud MCP를 등록하고 종료합니다
  --language <코드>      전사 언어 (기본: ko)
  --transcript-only      전사 정리본만 만들고 끝냅니다
  --dry-run              파일을 쓰지 않고 화면에만 출력
  --force                기존 파일 덮어쓰기 허용
  --json                 결과 경로를 JSON으로 출력
  -h, --help             도움말
  --version              버전

예시
  # 1단계: Plaud MCP 전사 JSON에서 준비물 만들기
  plaud-minutes ./recording.json --title "착수 회의" --project "착수 회의"

  # 2단계: AI가 만들어 준 요약 JSON으로 회의록 완성
  plaud-minutes ./recording.json --sections ./sections.json --title "착수 회의"
`);
}

async function readPackageVersion() {
  try {
    const raw = await fs.readFile(path.join(HERE, "..", "package.json"), "utf8");
    return JSON.parse(raw).version ?? "unknown";
  } catch {
    return "unknown";
  }
}

async function pickLatestFile(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const candidates = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    const ext = path.extname(e.name).toLowerCase();
    if (!AUDIO_EXTENSIONS.includes(ext) && !TRANSCRIPT_EXTENSIONS.includes(ext)) continue;
    const full = path.join(dir, e.name);
    const st = await fs.stat(full);
    candidates.push({ full, mtime: st.mtimeMs });
  }
  if (candidates.length === 0) {
    throw new Error(`폴더에서 처리할 수 있는 파일을 찾지 못했습니다: ${dir}`);
  }
  candidates.sort((a, b) => b.mtime - a.mtime);
  return candidates[0].full;
}

async function loadSource(inputPath, values) {
  if (isAudioFile(inputPath)) {
    process.stderr.write(`[i] 오디오 전사 중 (engine=${values.engine}) ...\n`);
    return transcribeAudio(inputPath, {
      engine: values.engine,
      model: values.model,
      language: values.language,
      terms: values.terms,
    });
  }
  const raw = await fs.readFile(inputPath, "utf8");
  if (path.extname(inputPath).toLowerCase() === ".json") {
    try {
      return JSON.parse(raw);
    } catch (err) {
      throw new Error(`JSON 파일을 해석하지 못했습니다: ${inputPath}\n${err.message}`);
    }
  }
  return raw;
}

async function loadSections(sectionsPath) {
  const raw = await fs.readFile(sectionsPath, "utf8");
  let doc;
  try {
    doc = JSON.parse(raw);
  } catch (err) {
    throw new Error(`요약 JSON을 해석하지 못했습니다: ${sectionsPath}\n${err.message}`);
  }
  if (Array.isArray(doc)) return { sections: doc };
  if (!Array.isArray(doc.sections)) {
    throw new Error(`요약 JSON에 'sections' 배열이 없습니다: ${sectionsPath}`);
  }
  return doc;
}

async function writeFileSafe(target, content, { force, dryRun }) {
  if (dryRun) return false;
  await fs.mkdir(path.dirname(target), { recursive: true });
  if (!force) {
    const exists = await fs.access(target).then(() => true, () => false);
    if (exists) {
      throw new Error(`이미 파일이 있습니다: ${target}\n덮어쓰려면 --force 를 붙이세요.`);
    }
  }
  await fs.writeFile(target, content, "utf8");
  return true;
}

async function listDirs(root) {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory() && !e.name.startsWith(".")).map((e) => e.name);
  } catch {
    return [];
  }
}

async function main() {
  const { values, positionals } = parseArgs({ options: OPTIONS, allowPositionals: true });

  if (values.version) {
    process.stdout.write(`${await readPackageVersion()}\n`);
    return 0;
  }
  if (values.help) {
    printHelp();
    return 0;
  }

  if (values["set-root"] !== undefined) {
    const saved = await writeConfig({ repoRoot: path.resolve(values["set-root"]) });
    process.stdout.write(
      `[OK] 기본 저장 위치를 설정했습니다.\n     ${saved.repoRoot}\n     설정파일: ${CONFIG_PATH}\n`,
    );
    return 0;
  }

  if (values["register-omo"]) {
    const r = await registerOmoMcp();
    if (!r.ok) {
      process.stdout.write(
        `[건너뜀] OmO 설정 폴더를 찾지 못했습니다.\n` +
          `         ${r.agentDir}\n` +
          `         OmO를 설치한 뒤 다시 실행하세요: plaud-minutes --register-omo\n`,
      );
      return 0;
    }
    process.stdout.write(
      `[OK] OmO에 Plaud MCP를 ${r.alreadyRegistered ? "갱신" : "등록"}했습니다.\n` +
        `     설정파일: ${r.configPath}\n` +
        `     등록된 서버: ${r.servers.join(", ")}\n` +
        (r.backupPath ? `     기존 설정 백업: ${r.backupPath}\n` : "") +
        `\n     OmO를 완전히 종료했다가 다시 열면 Plaud 도구가 보입니다.\n`,
    );
    return 0;
  }

  if (values["set-model"] !== undefined) {
    const saved = await writeConfig({ model: values["set-model"].trim() });
    process.stdout.write(
      `[OK] 기본 전사 모델을 설정했습니다: ${saved.model}\n     설정파일: ${CONFIG_PATH}\n`,
    );
    return 0;
  }

  if (values["show-config"]) {
    const current = await readConfig();
    const resolved = resolveRepoRoot({ flag: values.repo, config: current });
    process.stdout.write(
      `설정파일: ${CONFIG_PATH}\n저장 위치: ${resolved.root}\n결정 근거: ${SOURCE_LABELS[resolved.from]}\n` +
        `전사 모델: ${resolveModel({ flag: values.model, config: current })}\n`,
    );
    return 0;
  }
  if (positionals.length === 0) {
    printHelp();
    process.stderr.write("\n[오류] 입력 파일 또는 폴더를 지정하세요.\n");
    return 1;
  }

  const cfg = await readConfig();
  values.model = resolveModel({ flag: values.model, config: cfg });
  values.terms = await resolveTerms(values.terms);
  // 작은 모델은 용어집을 감당하지 못한다. 실측(4분 33초 한국어 회의, base)에서 발언 72줄이
  // 12줄로 무너지고 뒷부분이 통째로 빠졌다. large-v3-turbo 에서는 같은 용어집이 안전했다.
  if (values.terms && ["tiny", "base", "tiny.en", "base.en"].includes(values.model)) {
    process.stderr.write(
      `[주의] ${values.model} 은 용어집을 감당하지 못합니다. 전사가 뭉개지고 발언이 누락됩니다.\n` +
        `       (실측: base + 용어집 = 발언 72줄 → 12줄)\n` +
        `       용어집은 --model large-v3-turbo 이상에서 쓰세요.\n`,
    );
  }

  let inputPath = path.resolve(positionals[0]);
  const stat = await fs.stat(inputPath).catch(() => null);
  if (!stat) throw new Error(`입력을 찾을 수 없습니다: ${inputPath}`);
  if (stat.isDirectory()) {
    inputPath = await pickLatestFile(inputPath);
    process.stderr.write(`[i] 폴더에서 최신 파일 선택: ${inputPath}\n`);
  }

  const source = await loadSource(inputPath, values);
  const attendeesFlag = values.attendees
    ? values.attendees.split(",").map((s) => s.trim()).filter(Boolean)
    : null;

  const normalized = normalizeTranscript(source, {
    title: values.title,
    startedAt: values.date,
    attendees: attendeesFlag ?? undefined,
  });

  const sectionsDoc = values.sections ? await loadSections(values.sections) : null;

  const meeting = {
    title: values.title ?? sectionsDoc?.title ?? normalized.meeting.title,
    startedAt: values.date ?? sectionsDoc?.startedAt ?? normalized.meeting.startedAt,
    endedAt: sectionsDoc?.endedAt ?? null,
    attendees: attendeesFlag ?? sectionsDoc?.attendees ?? normalized.meeting.attendees,
  };

  const { root: repoRoot } = resolveRepoRoot({ flag: values.repo, config: cfg });
  const target = buildMinutesPath({
    repoRoot,
    startedAt: meeting.startedAt,
    title: meeting.title ?? "",
    project: values.project ?? "",
    existingDirs: await listDirs(repoRoot),
  });

  const minutesPath = values.out ? path.resolve(values.out) : target.fullPath;
  const dirOf = path.dirname(minutesPath);
  const stem = path.basename(minutesPath).replace(/_?회의록\.md$/, "").replace(/\.md$/, "");
  const transcriptPath = path.join(dirOf, `${stem}_전사.md`);
  const promptPath = path.join(dirOf, `${stem}_작성요청.md`);
  const sectionsHintPath = path.join(dirOf, `${stem}_sections.json`);

  const opts = { force: values.force, dryRun: values["dry-run"] };
  const transcriptMd = renderTranscript({ meeting, segments: normalized.segments });

  if (values["transcript-only"]) {
    if (values["dry-run"]) {
      process.stdout.write(transcriptMd);
      return 0;
    }
    await writeFileSafe(transcriptPath, transcriptMd, opts);
    const result = { mode: "transcript-only", transcript: transcriptPath, segments: normalized.segments.length };
    process.stdout.write(values.json ? `${JSON.stringify(result, null, 2)}\n` : `[OK] 전사 정리본 저장: ${transcriptPath}\n`);
    return 0;
  }

  if (sectionsDoc) {
    const md = renderMinutes({ meeting, sections: sectionsDoc.sections, template: values.template });
    if (values["dry-run"]) {
      process.stdout.write(md);
      return 0;
    }
    await writeFileSafe(minutesPath, md, opts);
    const result = { mode: "minutes", minutes: minutesPath, sections: sectionsDoc.sections.length };
    process.stdout.write(
      values.json
        ? `${JSON.stringify(result, null, 2)}\n`
        : `[OK] 회의록 저장: ${minutesPath}\n     안건 ${sectionsDoc.sections.length}개, 발언 ${normalized.segments.length}개 기반\n`,
    );
    return 0;
  }

  const prompt = buildMinutesPrompt({
    meeting,
    transcriptPath,
    sectionsPath: sectionsHintPath,
    segmentCount: normalized.segments.length,
  });

  if (values["dry-run"]) {
    process.stdout.write(`${transcriptMd}\n---\n${prompt}`);
    return 0;
  }

  await writeFileSafe(transcriptPath, transcriptMd, opts);
  await writeFileSafe(promptPath, prompt, opts);

  const result = {
    mode: "prepare",
    transcript: transcriptPath,
    prompt: promptPath,
    sectionsHint: sectionsHintPath,
    minutes: minutesPath,
    segments: normalized.segments.length,
    attendees: meeting.attendees,
  };

  if (values.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  process.stdout.write(
    `[OK] 전사 정리본 저장: ${transcriptPath}\n` +
      `[OK] 회의록 작성 요청서 저장: ${promptPath}\n` +
      `     감지된 화자: ${meeting.attendees.length > 0 ? meeting.attendees.join(", ") : "(없음)"}\n` +
      `     발언 세그먼트: ${normalized.segments.length}개\n\n` +
      `다음 단계\n` +
      `  1) 작성 요청서를 AI 클라이언트(OmO / Claude / ChatGPT)에 그대로 전달합니다.\n` +
      `  2) 받은 JSON을 ${sectionsHintPath} 로 저장합니다.\n` +
      `  3) plaud-minutes "${inputPath}" --sections "${sectionsHintPath}"\n`,
  );
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code ?? 0;
  })
  .catch((err) => {
    process.stderr.write(`\n[오류] ${err?.message ?? err}\n`);
    process.exitCode = 1;
  });
