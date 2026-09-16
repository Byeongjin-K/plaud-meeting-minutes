/**
 * 회의록 작성 프롬프트 생성기.
 *
 * 전사를 요약해 `sections` JSON을 만들 주체(OmO/Claude/ChatGPT 등)에게 건넬
 * 지시문을 만든다. LLM API 키가 없어도 이 프롬프트를 AI 클라이언트에 붙여넣으면
 * 동일한 결과를 얻을 수 있다.
 */

const SCHEMA_EXAMPLE = `{
  "title": "샘플 프로젝트 회의",
  "startedAt": "2026-07-22T15:30:00+09:00",
  "attendees": ["홍길동", "김철수"],
  "sections": [
    {
      "heading": "대시보드 개편 검토",
      "bullets": [
        {
          "text": "목록 화면 로딩 지연 구간 정밀 측정 필요",
          "children": [
            { "text": "첫 진입에서 전체 목록을 한 번에 불러오므로 요청 범위 축소 필요" }
          ]
        },
        { "text": "지연 구간은 페이지 단위 로딩 적용 검토" }
      ]
    },
    {
      "heading": "후속 조치",
      "bullets": [
        { "text": "[담당: 김철수] 캐시 정책 초안 정리 — 8/5까지" }
      ]
    }
  ]
}`;

export function buildMinutesPrompt({ meeting = {}, transcriptPath, sectionsPath, segmentCount = 0 } = {}) {
  const attendees = Array.isArray(meeting.attendees) && meeting.attendees.length > 0
    ? meeting.attendees.join(", ")
    : "(전사에서 확인되지 않음)";

  return `다음 회의 전사를 읽고 회의록 본문을 작성해 주세요.

## 회의 정보
- 제목: ${meeting.title ?? "(미지정)"}
- 일시: ${meeting.startedAt ?? "(미지정)"}
- 전사에서 감지된 화자: ${attendees}
- 발언 세그먼트 수: ${segmentCount}
- 전사 파일: ${transcriptPath ?? "(stdout)"}

## 작성 규칙
1. 발언을 그대로 옮기지 말고 **안건 단위로 묶어** 정리합니다.
2. 각 안건은 \`heading\` 하나와 중첩 불릿(\`bullets\` → \`children\`)으로 구성합니다.
3. 결정 사항, 미결 쟁점, 후속 조치를 빠뜨리지 않습니다.
   후속 조치는 \`[담당: 이름] 할 일 — 기한\` 형태로 적습니다.
4. 질의응답은 \`Q(질문자). 질문\` / \`A(답변자). 답변\` 형태로 표현할 수 있습니다.
5. 전사에 없는 내용을 추측해서 채우지 않습니다. 불확실하면 \`(확인 필요)\`를 붙입니다.
6. 숫자·일정·사양은 전사에 나온 값을 정확히 옮깁니다.

## 출력 형식
아래 스키마의 JSON만 출력하세요. 코드블록이나 설명 문장을 덧붙이지 마세요.

${SCHEMA_EXAMPLE}

## 저장 방법
위 JSON을 \`${sectionsPath ?? "sections.json"}\` 로 저장한 뒤 다음을 실행하면 회의록이 완성됩니다.

    plaud-minutes "${transcriptPath ?? "<전사파일>"}" --sections "${sectionsPath ?? "sections.json"}"
`;
}

export const __internals = { SCHEMA_EXAMPLE };
