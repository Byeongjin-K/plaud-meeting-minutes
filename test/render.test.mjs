import test from "node:test";
import assert from "node:assert/strict";

import { renderMinutes, renderTranscript } from "../lib/render.mjs";

const MEETING = {
  title: "샘플 프로젝트 회의",
  startedAt: "2026-07-22T15:30:00+09:00",
  attendees: ["홍길동", "김철수", "이영희"],
};

const SECTIONS = [
  {
    heading: "대시보드 개편 검토",
    bullets: [
      {
        text: "목록 화면 로딩 지연 구간 정밀 측정 필요",
        children: [
          {
            text: "첫 진입에서 전체 목록을 한 번에 불러오므로 요청 범위 축소 필요",
            children: [{ text: "서버 캐시로 처리 가능한지 확인" }],
          },
        ],
      },
      { text: "지연 구간은 페이지 단위 로딩 적용 검토" },
    ],
  },
  {
    heading: "후속 조치",
    bullets: [{ text: "캐시 정책 초안 정리" }],
  },
];

test("기본 템플릿(T1)은 저장소의 '# 제목 / - 날짜 / - 참석자 / ## 주제' 포맷으로 렌더한다", () => {
  const md = renderMinutes({ meeting: MEETING, sections: SECTIONS });
  const lines = md.split("\n");

  assert.equal(lines[0], "# 샘플 프로젝트 회의");
  assert.equal(lines[1], "");
  assert.equal(lines[2], "- 2026년 7월 22일 15:30");
  assert.equal(lines[3], "- 참석자: 홍길동, 김철수, 이영희");
  assert.ok(md.includes("\n## 대시보드 개편 검토\n"));
  assert.ok(md.includes("\n## 후속 조치\n"));
  assert.ok(md.endsWith("\n"));
});

test("중첩 불릿을 2칸 들여쓰기로 계층 렌더한다", () => {
  const md = renderMinutes({ meeting: MEETING, sections: SECTIONS });

  assert.ok(md.includes("- 목록 화면 로딩 지연 구간 정밀 측정 필요\n"));
  assert.ok(md.includes("  - 첫 진입에서 전체 목록을 한 번에 불러오므로 요청 범위 축소 필요\n"));
  assert.ok(md.includes("    - 서버 캐시로 처리 가능한지 확인\n"));
});

test("개요 템플릿(T2)은 '### 회의 개요 / - 일시: YYYY.MM.DD(요일) / ### 논의내용' 포맷으로 렌더한다", () => {
  const md = renderMinutes({
    meeting: { ...MEETING, startedAt: "2026-04-28T13:00:00+09:00", endedAt: "2026-04-28T16:00:00+09:00" },
    sections: SECTIONS,
    template: "overview",
  });

  assert.ok(md.startsWith("### 회의 개요\n"));
  assert.ok(md.includes("- 일시: 2026.04.28(화) 13:00 - 16:00\n"));
  assert.ok(md.includes("- 참석자: 홍길동, 김철수, 이영희\n"));
  assert.ok(md.includes("### 논의내용\n"));
});

test("참석자를 모르면 참석자 줄을 '(미확인)'으로 채운다", () => {
  const md = renderMinutes({
    meeting: { title: "무명 회의", startedAt: "2026-07-22T15:30:00+09:00", attendees: [] },
    sections: SECTIONS,
  });

  assert.ok(md.includes("- 참석자: (미확인)\n"));
});

test("일시를 모르면 날짜 줄을 '(일시 미상)'으로 채우고 크래시하지 않는다", () => {
  const md = renderMinutes({
    meeting: { title: "무명 회의", startedAt: null, attendees: ["홍길동"] },
    sections: SECTIONS,
  });

  assert.ok(md.includes("- (일시 미상)\n"));
});

test("깨진 일시 문자열도 크래시 없이 '(일시 미상)'으로 처리한다", () => {
  const md = renderMinutes({
    meeting: { title: "무명 회의", startedAt: "어제쯤", attendees: ["홍길동"] },
    sections: SECTIONS,
  });

  assert.ok(md.includes("- (일시 미상)\n"));
});

test("섹션이 비어 있으면 명확한 오류를 던진다", () => {
  assert.throws(
    () => renderMinutes({ meeting: MEETING, sections: [] }),
    /회의록 본문이 비어 있습니다/,
  );
});

test("제목이 없으면 '회의록'을 기본 제목으로 쓴다", () => {
  const md = renderMinutes({
    meeting: { title: null, startedAt: null, attendees: [] },
    sections: [{ heading: "논의", bullets: [{ text: "내용" }] }],
  });

  assert.ok(md.startsWith("# 회의록\n"));
});

test("한글·CJK·이모지를 손실 없이 렌더한다", () => {
  const md = renderMinutes({
    meeting: { title: "검색 기능 ①안 🔥", startedAt: null, attendees: ["洪吉童"] },
    sections: [{ heading: "完了 항목", bullets: [{ text: "알림 기능 ②안 검토" }] }],
  });

  assert.ok(md.includes("# 검색 기능 ①안 🔥"));
  assert.ok(md.includes("- 참석자: 洪吉童"));
  assert.ok(md.includes("## 完了 항목"));
  assert.ok(md.includes("- 알림 기능 ②안 검토"));
});

test("renderTranscript는 타임스탬프와 화자를 붙인 전사 정리본을 만든다", () => {
  const md = renderTranscript({
    meeting: MEETING,
    segments: [
      { tMs: 0, speaker: "홍길동", text: "회의를 시작하겠습니다." },
      { tMs: 125000, speaker: "김철수", text: "지연 구간부터 보겠습니다." },
      { tMs: null, speaker: null, text: "타임스탬프 없는 발언." },
    ],
  });

  assert.ok(md.includes("- [00:00:00] 홍길동: 회의를 시작하겠습니다."));
  assert.ok(md.includes("- [00:02:05] 김철수: 지연 구간부터 보겠습니다."));
  assert.ok(md.includes("- 타임스탬프 없는 발언."));
});
