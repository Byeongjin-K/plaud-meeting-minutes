/**
 * 저장소 폴더/파일 명명 규칙.
 *
 * 규칙:
 *  - 폴더: `YYYYMMDD_<프로젝트 또는 회의 제목>`  (예: `20260630_샘플 프로젝트`)
 *  - 파일: `YYYYMMDD_<회의 제목>_회의록.md`      (예: `20260722_1차 설계안 화상회의_회의록.md`)
 *  - 같은 프로젝트 폴더가 이미 있으면 날짜가 달라도 그 폴더를 재사용한다.
 */

import path from "node:path";

const pad2 = (n) => String(n).padStart(2, "0");

/** Windows 예약 문자 제거 + 하이픈 정리. */
export function sanitizeName(name) {
  return String(name ?? "")
    .replace(/[\u0000-\u001f]/g, "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/-\s/g, " ")
    .trim();
}

/** ISO 문자열의 벽시계 날짜를 그대로 읽는다. 실패하면 기준 시각(now)의 날짜. */
export function toDateStamp(startedAt, now = new Date()) {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(startedAt ?? "").trim());
  if (m) {
    const [, y, mo, d] = m;
    if (Number(mo) >= 1 && Number(mo) <= 12 && Number(d) >= 1 && Number(d) <= 31) {
      return `${y}${pad2(Number(mo))}${pad2(Number(d))}`;
    }
  }
  return `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`;
}

/** `20260630_샘플 프로젝트` 에서 날짜 접두사를 뗀 프로젝트명을 얻는다. */
function stripDatePrefix(dirName) {
  const m = /^(\d{8})_(.+)$/.exec(dirName);
  return m ? m[2] : dirName;
}

export function buildMinutesPath({
  repoRoot,
  startedAt = null,
  title = "",
  project = "",
  existingDirs = [],
  now = new Date(),
} = {}) {
  const stamp = toDateStamp(startedAt, now);
  const cleanTitle = sanitizeName(title);
  const titleForFile = cleanTitle || "회의록";
  const folderKey = sanitizeName(project) || titleForFile;

  const found = existingDirs.find((d) => stripDatePrefix(d) === folderKey);
  const dir = found ?? `${stamp}_${folderKey}`;

  const fileName = titleForFile.endsWith("회의록")
    ? `${stamp}_${titleForFile}.md`
    : `${stamp}_${titleForFile}_회의록.md`;

  return {
    dir,
    fileName,
    fullPath: path.join(repoRoot ?? ".", dir, fileName),
    isNewDir: found === undefined,
  };
}
