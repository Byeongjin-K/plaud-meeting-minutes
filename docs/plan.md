# PLAUD Note Pro → 회의록 자동화 시스템 구축 계획

- 작성일: 2026-09-16
- 대상 환경: Windows 11, 회의록을 모아 두는 임의의 작업 폴더
- 범위: 신규 모듈 + 외부 통합

## 1. 결론: 가능한가?

**가능하다.** 두 경로 모두 실현 가능하며, 둘 다 구현한다.

| 경로 | 방식 | 전제 | 비용 |
|---|---|---|---|
| A. Plaud MCP | Plaud 클라우드에 올라간 녹음을 MCP로 조회 → 화자분리 전사(`get_transcript`) 취득 | Plaud 계정 OAuth 승인, 기기가 앱으로 동기화 | 추가 비용 0 (Plaud 구독 내) |
| B. 로컬 오디오 파일 | 기기/폰/드라이브 → 노트북의 감시 폴더 → 로컬 또는 API 전사 | 전사 엔진 1개 | 로컬 whisper=0원, API=종량 |

검증된 사실:
- `@plaud-ai/mcp` v0.3.12 npm 실존. `npx -y @plaud-ai/mcp@latest install`
- 제공 툴: `login`, `logout`, `get_current_user`, `list_files`, `get_file`, `get_note`, `get_transcript`
- `get_file` 반환: `presigned_url`(오디오 24시간), `source_list`(타임스탬프+화자 전사), `note_list`(AI 노트 마크다운)
- `list_files` 필터: `query`, `date_from`, `date_to`, `page`/`page_size`
- 전제 런타임: Node ≥20, Python 3.10+ (로컬 전사를 쓸 때만), git. ffmpeg 는 기본 경로에서 불필요
- 전사·요약용 API 키가 없는 환경을 기본으로 가정

## 2. 아키텍처

```
[Plaud Note Pro]
      │
      ├─(A) 앱 동기화 → Plaud 클라우드 ──> Plaud MCP ──┐
      │                                               │
      └─(B) USB / 폰→구글드라이브 → 로컬 오디오 파일 ─┤
                                                      ▼
                                        [1] 전사 취득 계층 (provider)
                                          plaud-mcp | whisper-api | whisper-local
                                                      ▼
                                        [2] 정규화 전사 스키마 (JSON)
                                          { meeting, segments:[{t, speaker, text}] }
                                                      ▼
                                        [3] 회의록 생성 계층
                                          결정론적 렌더 + (선택) LLM 요약
                                                      ▼
                                        [4] 저장소 규칙대로 저장
                                          YYYYMMDD_<프로젝트>/YYYYMMDD_<회의명>_회의록.md
```

핵심 설계 원칙: **전사 취득과 회의록 렌더링을 분리**한다. 전사 provider가 무엇이든 [2] 정규화 스키마로 수렴하므로, Plaud 계정 유무·API 키 유무와 무관하게 [3][4]는 항상 동작한다. 이것이 "키 없이도 오늘 동작하는 시스템"을 가능하게 하는 지점이다.

## 3. 산출물

```
tools/meeting-minutes/
  cli.mjs              # 진입점: minutes <입력> [옵션]
  lib/
    normalize.mjs      # 다양한 전사 원본 → 정규화 스키마
    render.mjs         # 정규화 스키마 → 저장소 포맷 회의록 md
    naming.mjs         # 날짜/회의명 → 폴더·파일 경로 규칙
    providers/
      plaud-mcp.mjs    # Plaud MCP JSON 산출물 인입
      whisper-api.mjs  # OpenAI 전사 API (키 있을 때)
      whisper-local.mjs# faster-whisper 로컬 (키 없을 때)
  test/                # node:test 단위 테스트
  README.md            # 사용법 (한글)
```

## 4. 회의록 출력 포맷 (저장소 기존 규칙 준수)

```markdown
# <회의명>

- 2026년 7월 22일 15:30
- 참석자: 홍길동, 김철수, ...

## <주제 1>

- 핵심 논의
  - 세부 사항
    - 추가 근거

## <주제 2>
...
```

## 5. 실행 순서 (RED → GREEN → SURFACE)

1. **정규화 계층**: 전사 원본(Plaud `source_list` 형태 / whisper segments / 평문) → 공통 스키마. 실패 테스트 선캡처.
2. **렌더 계층**: 스키마 → 위 포맷 md. 경계 케이스(빈 전사, 화자 없음, 깨진 타임스탬프, 한글/CJK) 실패 테스트 선캡처.
3. **경로 규칙**: `naming.mjs` — 날짜·회의명에서 폴더/파일명 생성, 기존 폴더 재사용.
4. **CLI 조립**: 로컬 오디오 / 전사 JSON / Plaud 내보내기 입력을 모두 수용.
5. **Plaud MCP 연결**: 설치 + 클라이언트 설정 등록 + 로그인 검증.
6. **실표면 QA**: 실제 CLI 실행으로 md 생성 캡처, `git status`로 기존 자산 무해성 확인.

## 6. 위험과 대응

| 위험 | 대응 |
|---|---|
| Plaud OAuth는 브라우저 승인이 필요 → 사용자 개입 필수 | 설치·설정까지 자동화하고 로그인만 사용자에게 안내 |
| 전사 API 키 없음 | provider 플러그블. 키 없으면 Plaud 전사 또는 로컬 whisper 사용 |
| ffmpeg 미설치 → 로컬 whisper 전처리 제약 | 필요 시점에만 설치 안내, 기본 경로는 ffmpeg 불요 |
| 한글/CJK 인코딩 깨짐 (Windows 콘솔) | UTF-8 강제 입출력, 테스트에 한글 케이스 포함 |
| 유료 API 무단 호출 | 키가 있어도 명시 플래그 없이는 호출 금지 |
