import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { buildMinutesPath, sanitizeName, toDateStamp } from "../lib/naming.mjs";

const REPO = "C:\\repo";
const EXISTING = [
  "20260428_착수 회의",
  "20260623_중간 점검 회의",
  "20260630_샘플 프로젝트",
  "20260916_분기 리뷰",
];

test("이미 있는 프로젝트 폴더가 있으면 새로 만들지 않고 재사용한다", () => {
  const got = buildMinutesPath({
    repoRoot: REPO,
    startedAt: "2026-07-22T15:30:00+09:00",
    title: "1차 설계안 화상회의",
    project: "샘플 프로젝트",
    existingDirs: EXISTING,
  });

  assert.equal(got.dir, "20260630_샘플 프로젝트");
  assert.equal(got.isNewDir, false);
  assert.equal(got.fileName, "20260722_1차 설계안 화상회의_회의록.md");
  assert.equal(got.fullPath, path.join(REPO, "20260630_샘플 프로젝트", "20260722_1차 설계안 화상회의_회의록.md"));
});

test("해당 프로젝트 폴더가 없으면 'YYYYMMDD_<프로젝트>' 폴더를 새로 만든다", () => {
  const got = buildMinutesPath({
    repoRoot: REPO,
    startedAt: "2026-09-16T10:00:00+09:00",
    title: "대시보드 점검 회의",
    project: "대시보드 개편 2차",
    existingDirs: EXISTING,
  });

  assert.equal(got.dir, "20260916_대시보드 개편 2차");
  assert.equal(got.isNewDir, true);
});

test("프로젝트를 지정하지 않으면 회의 제목으로 폴더명을 만든다", () => {
  const got = buildMinutesPath({
    repoRoot: REPO,
    startedAt: "2026-09-16T10:00:00+09:00",
    title: "주간 점검 회의",
    existingDirs: EXISTING,
  });

  assert.equal(got.dir, "20260916_주간 점검 회의");
  assert.equal(got.fileName, "20260916_주간 점검 회의_회의록.md");
});

test("Windows에서 못 쓰는 문자를 파일명에서 제거한다", () => {
  assert.equal(sanitizeName('설계/검토: "1차"안 <긴급>?'), "설계-검토 -1차-안 -긴급-");
  assert.equal(sanitizeName("정상 이름"), "정상 이름");
});

test("일시가 없으면 기준 시각(now)의 날짜를 쓴다", () => {
  const got = toDateStamp(null, new Date("2026-09-16T08:30:00+09:00"));
  assert.match(got, /^\d{8}$/);
});

test("일시 문자열의 벽시계 날짜를 타임존 변환 없이 그대로 쓴다", () => {
  assert.equal(toDateStamp("2026-07-22T15:30:00+09:00"), "20260722");
  assert.equal(toDateStamp("2026-01-05T23:50:00+09:00"), "20260105");
});

test("깨진 일시는 기준 시각으로 대체하고 크래시하지 않는다", () => {
  const got = toDateStamp("어제쯤", new Date("2026-09-16T08:30:00+09:00"));
  assert.equal(got, "20260916");
});

test("제목이 비어도 '회의록' 기본값으로 안전한 파일명을 만든다", () => {
  const got = buildMinutesPath({
    repoRoot: REPO,
    startedAt: "2026-09-16T10:00:00+09:00",
    title: "",
    existingDirs: [],
  });

  assert.equal(got.fileName, "20260916_회의록.md");
  assert.equal(got.dir, "20260916_회의록");
});
