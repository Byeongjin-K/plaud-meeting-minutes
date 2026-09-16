/**
 * 공통 스키마 → 회의록 마크다운.
 *
 * 템플릿 2종:
 *  - "default"  : `# 제목` / `- 2026년 7월 22일 15:30` / `- 참석자:` / `## 주제`
 *                 (예: 20260630_샘플 프로젝트/20260722_1차 설계안 화상회의_회의록.md)
 *  - "overview" : `### 회의 개요` / `- 일시: 2026.04.28(화) 13:00 - 16:00` / `### 논의내용`
 *                 (예: 20260428_착수 회의/회의록.md)
 */

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const EMPTY_BODY_MESSAGE =
  "회의록 본문이 비어 있습니다. 최소 한 개의 주제 섹션이 필요합니다.";

/**
 * ISO 문자열의 '벽시계' 값을 그대로 읽는다(타임존 변환 없음).
 * 표기된 시각이 곧 회의 시각이므로 로컬 타임존에 따라 결과가 흔들리면 안 된다.
 */
function parseWallClock(value) {
  if (typeof value !== "string") return null;
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2}))?/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, hh, mi] = m;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const hasTime = hh !== undefined;
  const hour = hasTime ? Number(hh) : 0;
  const minute = hasTime ? Number(mi) : 0;
  if (hour > 23 || minute > 59) return null;
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return { year, month, day, hour, minute, hasTime, weekday };
}

const pad2 = (n) => String(n).padStart(2, "0");

/** T1: `2026년 7월 22일 15:30` */
function formatDefaultDate(wc) {
  const base = `${wc.year}년 ${wc.month}월 ${wc.day}일`;
  return wc.hasTime ? `${base} ${pad2(wc.hour)}:${pad2(wc.minute)}` : base;
}

/** T2: `2026.04.28(화) 13:00 - 16:00` */
function formatOverviewDate(wc, endWc) {
  let s = `${wc.year}.${pad2(wc.month)}.${pad2(wc.day)}(${wc.weekday})`;
  if (wc.hasTime) s += ` ${pad2(wc.hour)}:${pad2(wc.minute)}`;
  if (endWc?.hasTime) s += ` - ${pad2(endWc.hour)}:${pad2(endWc.minute)}`;
  return s;
}

export function msToTimecode(ms) {
  if (!Number.isFinite(ms) || ms < 0) return null;
  const total = Math.floor(ms / 1000);
  return `${pad2(Math.floor(total / 3600))}:${pad2(Math.floor((total % 3600) / 60))}:${pad2(total % 60)}`;
}

function normalizeBullet(b) {
  if (typeof b === "string") return { text: b.trim(), children: [] };
  if (!b || typeof b !== "object") return null;
  const text = String(b.text ?? b.title ?? "").trim();
  if (!text) return null;
  const rawKids = Array.isArray(b.children) ? b.children : [];
  return { text, children: rawKids.map(normalizeBullet).filter(Boolean) };
}

function renderBullets(bullets, depth, out) {
  for (const b of bullets) {
    out.push(`${"  ".repeat(depth)}- ${b.text}`);
    if (b.children.length > 0) renderBullets(b.children, depth + 1, out);
  }
}

function normalizeSections(sections) {
  if (!Array.isArray(sections) || sections.length === 0) throw new Error(EMPTY_BODY_MESSAGE);
  const out = sections
    .map((s) => ({
      heading: String(s?.heading ?? s?.title ?? "").trim(),
      bullets: (Array.isArray(s?.bullets) ? s.bullets : []).map(normalizeBullet).filter(Boolean),
    }))
    .filter((s) => s.heading || s.bullets.length > 0);
  if (out.length === 0) throw new Error(EMPTY_BODY_MESSAGE);
  return out;
}

function attendeeLine(attendees) {
  const list = Array.isArray(attendees) ? attendees.filter((a) => String(a ?? "").trim()) : [];
  return `- 참석자: ${list.length > 0 ? list.join(", ") : "(미확인)"}`;
}

export function renderMinutes({ meeting = {}, sections, template = "default" } = {}) {
  const secs = normalizeSections(sections);
  const startWc = parseWallClock(meeting.startedAt);
  const endWc = parseWallClock(meeting.endedAt);
  const title = String(meeting.title ?? "").trim() || "회의록";
  const lines = [];

  if (template === "overview") {
    lines.push("### 회의 개요", "");
    lines.push(startWc ? `- 일시: ${formatOverviewDate(startWc, endWc)}` : "- 일시: (일시 미상)");
    lines.push(attendeeLine(meeting.attendees), "");
    lines.push("### 논의내용", "");
    for (const s of secs) {
      const bullets = s.heading
        ? [{ text: s.heading, children: s.bullets }]
        : s.bullets;
      renderBullets(bullets, 0, lines);
    }
  } else {
    lines.push(`# ${title}`, "");
    lines.push(startWc ? `- ${formatDefaultDate(startWc)}` : "- (일시 미상)");
    lines.push(attendeeLine(meeting.attendees));
    for (const s of secs) {
      lines.push("", `## ${s.heading || "논의내용"}`, "");
      renderBullets(s.bullets, 0, lines);
    }
  }

  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
}

export function renderTranscript({ meeting = {}, segments = [] } = {}) {
  const title = String(meeting.title ?? "").trim() || "회의";
  const lines = [`# ${title} 전사`, ""];

  for (const s of segments) {
    const text = String(s?.text ?? "").trim();
    if (!text) continue;
    const tc = s?.tMs === null || s?.tMs === undefined ? null : msToTimecode(s.tMs);
    const speaker = String(s?.speaker ?? "").trim();
    const prefix = [tc ? `[${tc}]` : null, speaker ? `${speaker}:` : null].filter(Boolean).join(" ");
    lines.push(prefix ? `- ${prefix} ${text}` : `- ${text}`);
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

export const __internals = { parseWallClock, formatDefaultDate, formatOverviewDate };
