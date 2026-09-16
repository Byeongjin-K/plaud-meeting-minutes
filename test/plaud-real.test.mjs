import test from "node:test";
import assert from "node:assert/strict";

import { normalizeTranscript } from "../lib/normalize.mjs";

/**
 * 실제 Plaud MCP `get_file` 응답 구조에서 뽑은 픽스처.
 * 전사는 source_list 의 data_type="transaction" 항목 안에 JSON 문자열로 중첩되어 있다.
 */
const REAL_SHAPE = {
  id: "of_testfixture",
  name: "리뷰: 대시보드 개편 진행 현황",
  created_at: "2026-09-16T04:39:50",
  start_at: "2026-09-16T04:39:50",
  duration: 190000,
  presigned_url: "https://example.invalid/audio.mp3",
  source_list: [
    {
      data_id: "oo_tr_testfixture",
      data_type: "transaction",
      data_title: "",
      data_link: "https://example.invalid/transcript.json",
      data_content: JSON.stringify([
        {
          content: "대시보드 콘솔별 기능을 네 가지 형태로 배치했습니다.",
          end_time: 30860,
          start_time: 460,
          speaker: "Speaker 1",
          original_speaker: "Speaker 1",
          embeddingKey: "k1",
        },
        {
          content: "모바일 쪽은 첫 진입 응답 시간을 먼저 확인해야 합니다.",
          end_time: 45000,
          start_time: 37380,
          speaker: "Speaker 2",
          original_speaker: "Speaker 2",
          embeddingKey: "k2",
        },
        {
          content: "외부 연동 시험은 다음 주에 진행하겠습니다.",
          end_time: 90000,
          start_time: 82460,
          speaker: "Speaker 1",
          original_speaker: "Speaker 1",
          embeddingKey: "k3",
        },
      ]),
    },
  ],
  note_list: [
    {
      data_id: "oo_note_testfixture",
      data_type: "summary",
      data_title: "요약",
      data_tab_name: "Summary",
      data_content: "# 요약\n\n대시보드 개편 진행 현황 리뷰.",
      data_link: null,
      data_path: null,
      data_error_code: 0,
    },
  ],
};

test("Plaud 실제 응답: data_content 안에 중첩된 전사 JSON을 풀어 정규화한다", () => {
  const got = normalizeTranscript(REAL_SHAPE);

  assert.equal(got.segments.length, 3);
  assert.equal(got.segments[0].tMs, 460);
  assert.equal(got.segments[0].speaker, "Speaker 1");
  assert.equal(got.segments[0].text, "대시보드 콘솔별 기능을 네 가지 형태로 배치했습니다.");
  assert.equal(got.segments[2].tMs, 82460);
  assert.equal(got.meeting.title, "리뷰: 대시보드 개편 진행 현황");
  assert.equal(got.meeting.startedAt, "2026-09-16T04:39:50");
  assert.deepEqual(got.meeting.attendees, ["Speaker 1", "Speaker 2"]);
});

test("Plaud 실제 응답: 화자 이름을 실명으로 치환할 수 있다", () => {
  const got = normalizeTranscript(REAL_SHAPE, {
    speakerNames: { "Speaker 1": "홍길동", "Speaker 2": "김철수" },
  });

  assert.equal(got.segments[0].speaker, "홍길동");
  assert.equal(got.segments[1].speaker, "김철수");
  assert.deepEqual(got.meeting.attendees, ["홍길동", "김철수"]);
});

test("Plaud 실제 응답: AI 요약 노트를 함께 꺼내 준다", () => {
  const got = normalizeTranscript(REAL_SHAPE);

  assert.ok(Array.isArray(got.notes));
  assert.equal(got.notes.length, 1);
  assert.match(got.notes[0].content, /대시보드 개편 진행 현황 리뷰/);
});

test("전사 블록이 비어 있으면 명확한 오류를 낸다", () => {
  const empty = { ...REAL_SHAPE, source_list: [{ data_type: "transaction", data_content: "[]" }] };

  assert.throws(() => normalizeTranscript(empty), /전사 내용이 비어 있습니다/);
});

test("기존 단순 형태(source_list가 곧 세그먼트)도 계속 지원한다", () => {
  const legacy = {
    name: "구형 샘플",
    start_at: "2026-09-16T10:00:00+09:00",
    source_list: [
      { start_time: 0, speaker: "홍길동", content: "기존 형식 발언입니다." },
    ],
  };

  const got = normalizeTranscript(legacy);

  assert.equal(got.segments.length, 1);
  assert.equal(got.segments[0].speaker, "홍길동");
  assert.equal(got.segments[0].text, "기존 형식 발언입니다.");
});
