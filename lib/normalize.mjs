/**
 * 전사 원본 → 공통 스키마 정규화.
 *
 * 지원 입력:
 *  - Plaud MCP `get_file` / `get_transcript` 결과 (`source_list`, 시간 단위 ms)
 *  - Whisper verbose_json (`segments`, 시간 단위 초)
 *  - 평문 텍스트 (`[HH:MM:SS] 화자: 내용` 또는 단순 줄)
 *  - SRT/VTT 자막
 *
 * 출력 스키마:
 *  { meeting: { title, startedAt, attendees, source },
 *    segments: [{ tMs: number|null, speaker: string|null, text: string }] }
 */

const EMPTY_MESSAGE =
  "전사 내용이 비어 있습니다. 입력 파일이나 Plaud 응답에 발언 세그먼트가 있는지 확인하세요.";

const SPEAKER_KEYS = ["speaker", "speaker_name", "speakerName", "spk", "speaker_id"];
const TEXT_KEYS = ["content", "text", "transcription", "sentence", "value"];
const TIME_KEYS = ["start_time", "startTime", "start", "begin", "begin_time", "offset"];

/** 유한하고 0 이상인 수만 통과시킨다. 그 외(문자열·음수·NaN)는 null. */
function toMs(raw, { unit }) {
  const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : Number.NaN;
  if (!Number.isFinite(n) || n < 0) return null;
  return unit === "s" ? Math.round(n * 1000) : Math.round(n);
}

function pick(obj, keys) {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
}

function cleanSpeaker(raw) {
  if (typeof raw !== "string") return raw === undefined || raw === null ? null : String(raw).trim() || null;
  const s = raw.trim();
  return s === "" ? null : s;
}

function cleanText(raw) {
  if (raw === undefined || raw === null) return "";
  return String(raw).trim();
}

/** `hh:mm:ss[,.]mmm` 또는 `mm:ss` 형태 타임코드를 ms로. 실패 시 null. */
function timecodeToMs(tc) {
  const m = /^(?:(\d{1,3}):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/.exec(String(tc).trim());
  if (!m) return null;
  const [, h, mm, ss, frac] = m;
  const hours = h === undefined ? 0 : Number(h);
  const ms = frac === undefined ? 0 : Number(frac.padEnd(3, "0"));
  return ((hours * 60 + Number(mm)) * 60 + Number(ss)) * 1000 + ms;
}

function segmentsFromObjectList(list, unit) {
  const out = [];
  for (const raw of list) {
    if (raw === null || raw === undefined) continue;
    if (typeof raw === "string") {
      const text = cleanText(raw);
      if (text) out.push({ tMs: null, speaker: null, text });
      continue;
    }
    const text = cleanText(pick(raw, TEXT_KEYS));
    if (!text) continue;
    out.push({
      tMs: toMs(pick(raw, TIME_KEYS), { unit }),
      speaker: cleanSpeaker(pick(raw, SPEAKER_KEYS) ?? null),
      text,
    });
  }
  return out;
}

/**
 * Plaud MCP 응답의 source_list 는 전사 '블록 목록'이다.
 * 실제 발언은 data_type="transaction" 블록의 data_content 안에 JSON 문자열로 중첩돼 있다.
 * (실제 응답으로 확인: { content, start_time, end_time, speaker, original_speaker })
 */
function expandPlaudSourceList(list) {
  const out = [];
  for (const item of list) {
    if (item && typeof item === "object" && typeof item.data_content === "string") {
      let parsed = null;
      try {
        parsed = JSON.parse(item.data_content);
      } catch {
        parsed = null;
      }
      if (Array.isArray(parsed)) {
        out.push(...segmentsFromObjectList(parsed, "ms"));
      } else {
        const text = item.data_content.trim();
        if (text) out.push(...parsePlainText(text));
      }
      continue;
    }
    out.push(...segmentsFromObjectList([item], "ms"));
  }
  return out;
}

/** Plaud 가 만들어 둔 AI 노트(요약·액션아이템)를 꺼낸다. */
function extractNotes(noteList) {
  if (!Array.isArray(noteList)) return [];
  return noteList
    .map((n) => ({
      type: n?.data_type ?? n?.type ?? null,
      title: n?.data_title ?? n?.title ?? null,
      content: String(n?.data_content ?? n?.content ?? "").trim(),
    }))
    .filter((n) => n.content);
}

function looksLikeSubtitle(text) {
  return /^\s*(WEBVTT|\d+\s*\r?\n\s*(?:\d{1,3}:)?\d{1,2}:\d{1,2}[.,]\d{1,3}\s*-->)/m.test(text) || /-->/.test(text);
}

function parseSubtitle(text) {
  const out = [];
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    const cueIdx = lines.findIndex((l) => l.includes("-->"));
    if (cueIdx === -1) continue;
    const startTc = lines[cueIdx].split("-->")[0];
    const body = lines.slice(cueIdx + 1).join(" ").trim();
    if (!body) continue;
    out.push({ tMs: timecodeToMs(startTc), speaker: null, text: body });
  }
  return out;
}

// `[00:01:02] 화자: 내용` / `[00:01:02] 내용` / `00:01:02 화자: 내용`
const LINE_RE = /^\s*(?:\[\s*((?:\d{1,3}:)?\d{1,2}:\d{1,2}(?:[.,]\d{1,3})?)\s*\]|((?:\d{1,3}:)?\d{1,2}:\d{1,2}(?:[.,]\d{1,3})?))?\s*(.*)$/;

/** 콜론 앞부분이 사람 이름/화자 라벨로 보일 때만 화자로 인정한다. */
function splitSpeaker(rest) {
  const idx = rest.indexOf(":");
  if (idx <= 0) return { speaker: null, text: rest };
  const candidate = rest.slice(0, idx).trim();
  const body = rest.slice(idx + 1).trim();
  const plausible =
    candidate.length > 0 &&
    candidate.length <= 20 &&
    body.length > 0 &&
    (candidate.match(/\s/g) ?? []).length <= 2 &&
    !/[.!?。！？,、]/.test(candidate);
  return plausible ? { speaker: candidate, text: body } : { speaker: null, text: rest };
}

function parsePlainText(text) {
  const out = [];
  for (const rawLine of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = LINE_RE.exec(line);
    const tc = m?.[1] ?? m?.[2];
    const rest = (m?.[3] ?? line).trim();
    if (!rest) continue;
    const { speaker, text: body } = splitSpeaker(rest);
    if (!body) continue;
    out.push({ tMs: tc ? timecodeToMs(tc) : null, speaker, text: body });
  }
  return out;
}

export function normalizeTranscript(input, opts = {}) {
  if (input === null || input === undefined) throw new Error(EMPTY_MESSAGE);

  let segments;
  let source;
  let meta = {};

  if (typeof input === "string") {
    if (input.trim() === "") throw new Error(EMPTY_MESSAGE);
    if (looksLikeSubtitle(input)) {
      segments = parseSubtitle(input);
      source = "subtitle";
    } else {
      segments = parsePlainText(input);
      source = "text";
    }
  } else if (Array.isArray(input)) {
    segments = segmentsFromObjectList(input, "ms");
    source = "list";
  } else if (typeof input === "object") {
    meta = input;
    if (Array.isArray(input.source_list)) {
      segments = expandPlaudSourceList(input.source_list);
      source = "plaud";
    } else if (Array.isArray(input.segments)) {
      segments = segmentsFromObjectList(input.segments, "s");
      source = "whisper";
    } else if (typeof input.text === "string") {
      return normalizeTranscript(input.text, {
        ...opts,
        title: opts.title ?? input.name ?? input.title,
        startedAt: opts.startedAt ?? input.start_at ?? input.started_at ?? input.created_at,
      });
    } else {
      throw new Error(EMPTY_MESSAGE);
    }
  } else {
    throw new Error(EMPTY_MESSAGE);
  }

  if (segments.length === 0) throw new Error(EMPTY_MESSAGE);

  if (opts.speakerNames) {
    for (const s of segments) {
      if (s.speaker && opts.speakerNames[s.speaker]) s.speaker = opts.speakerNames[s.speaker];
    }
  }

  const attendees = [];
  for (const s of segments) {
    if (s.speaker && !attendees.includes(s.speaker)) attendees.push(s.speaker);
  }

  return {
    meeting: {
      title: opts.title ?? meta.name ?? meta.title ?? null,
      startedAt: opts.startedAt ?? meta.start_at ?? meta.started_at ?? meta.created_at ?? null,
      attendees: opts.attendees ?? attendees,
      source,
    },
    segments,
    notes: extractNotes(meta.note_list),
  };
}

export const __internals = { timecodeToMs, splitSpeaker, toMs };
