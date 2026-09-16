import test from "node:test";
import assert from "node:assert/strict";

import { normalizeTranscript } from "../lib/normalize.mjs";

test("Plaud source_list 형태의 전사를 화자/시간 보존하며 정규화한다", () => {
  const plaud = {
    name: "샘플 프로젝트 화상회의",
    start_at: "2026-07-22T15:30:00+09:00",
    source_list: [
      { start_time: 0, speaker: "홍길동", content: "대시보드 개편부터 보시죠." },
      { start_time: 12500, speaker: "김철수", content: "목록 화면 지연 구간을 정밀 측정해야 합니다." },
    ],
  };

  const got = normalizeTranscript(plaud);

  assert.equal(got.meeting.title, "샘플 프로젝트 화상회의");
  assert.equal(got.meeting.startedAt, "2026-07-22T15:30:00+09:00");
  assert.deepEqual(got.meeting.attendees, ["홍길동", "김철수"]);
  assert.equal(got.segments.length, 2);
  assert.deepEqual(got.segments[1], {
    tMs: 12500,
    speaker: "김철수",
    text: "목록 화면 지연 구간을 정밀 측정해야 합니다.",
  });
});

test("Whisper verbose_json(초 단위 start)을 밀리초로 환산한다", () => {
  const whisper = {
    segments: [
      { start: 0, end: 3.2, text: " 회의를 시작하겠습니다." },
      { start: 12.5, end: 18.0, text: " 캐시 정책 관련 내용입니다." },
    ],
  };

  const got = normalizeTranscript(whisper, { title: "내부 회의" });

  assert.equal(got.segments.length, 2);
  assert.equal(got.segments[0].tMs, 0);
  assert.equal(got.segments[1].tMs, 12500);
  assert.equal(got.segments[0].text, "회의를 시작하겠습니다.");
  assert.equal(got.segments[1].speaker, null);
  assert.equal(got.meeting.title, "내부 회의");
});

test("평문 '[HH:MM:SS] 화자: 내용' 형식을 파싱한다", () => {
  const plain = [
    "[00:00:00] 홍길동: 안건은 세 가지입니다.",
    "[00:02:05] 이영희: 배포 일정 공유드립니다.",
  ].join("\n");

  const got = normalizeTranscript(plain);

  assert.equal(got.segments.length, 2);
  assert.equal(got.segments[0].speaker, "홍길동");
  assert.equal(got.segments[1].tMs, 125000);
  assert.equal(got.segments[1].text, "배포 일정 공유드립니다.");
});

test("SRT 자막을 세그먼트로 파싱한다", () => {
  const srt = [
    "1",
    "00:00:01,000 --> 00:00:04,000",
    "회의록 자동화 테스트입니다.",
    "",
    "2",
    "00:01:30,500 --> 00:01:34,000",
    "두 번째 발언입니다.",
    "",
  ].join("\n");

  const got = normalizeTranscript(srt);

  assert.equal(got.segments.length, 2);
  assert.equal(got.segments[0].tMs, 1000);
  assert.equal(got.segments[1].tMs, 90500);
  assert.equal(got.segments[1].text, "두 번째 발언입니다.");
});

test("빈 전사는 명확한 오류로 거부한다", () => {
  assert.throws(() => normalizeTranscript(""), /전사 내용이 비어 있습니다/);
  assert.throws(() => normalizeTranscript({ source_list: [] }), /전사 내용이 비어 있습니다/);
  assert.throws(() => normalizeTranscript(null), /전사 내용이 비어 있습니다/);
});

test("화자 라벨이 없어도 크래시 없이 speaker=null로 보존한다", () => {
  const got = normalizeTranscript("화자 표기가 전혀 없는 단순 문단입니다.\n두 번째 줄입니다.");

  assert.equal(got.segments.length, 2);
  assert.equal(got.segments[0].speaker, null);
  assert.deepEqual(got.meeting.attendees, []);
  assert.equal(got.segments[0].text, "화자 표기가 전혀 없는 단순 문단입니다.");
});

test("깨진 타임스탬프는 tMs=null로 두고 텍스트를 버리지 않는다", () => {
  const broken = {
    source_list: [
      { start_time: "언제인지모름", speaker: "박민수", content: "타임스탬프가 깨진 발언." },
      { start_time: -5, speaker: "박민수", content: "음수 타임스탬프 발언." },
    ],
  };

  const got = normalizeTranscript(broken);

  assert.equal(got.segments.length, 2);
  assert.equal(got.segments[0].tMs, null);
  assert.equal(got.segments[1].tMs, null);
  assert.equal(got.segments[0].text, "타임스탬프가 깨진 발언.");
  assert.equal(got.segments[1].text, "음수 타임스탬프 발언.");
});

test("한글·CJK·이모지를 손실 없이 보존한다", () => {
  const got = normalizeTranscript("[00:00:10] 김철수: 검색 기능 ①안 검토 🔥 完了");

  assert.equal(got.segments[0].text, "검색 기능 ①안 검토 🔥 完了");
  assert.equal(got.segments[0].speaker, "김철수");
});
