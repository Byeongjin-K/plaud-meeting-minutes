# plaud-meeting-minutes

PLAUD Note Pro로 녹음한 회의를 **회의록 마크다운**으로 만들어 주는 CLI입니다.
의존성이 하나도 없어서 Node.js만 있으면 어느 컴퓨터에서든 바로 돌아갑니다.

```
[PLAUD Note Pro] --> 전사 --> [plaud-minutes] --> 20260916_주간회의_회의록.md
```

**추가 결제 없이 쓸 수 있습니다.** Plaud 무료 플랜은 기기 녹음이 무제한이고 AI 전사도 월 300분까지 무료입니다.
그 한도를 넘기거나 아예 클라우드를 쓰고 싶지 않다면, 로컬 whisper로 **완전 무료·오프라인 전사**가 가능합니다.

---

## 한 줄 설치

**Windows (PowerShell)**

```powershell
irm https://raw.githubusercontent.com/Byeongjin-K/plaud-meeting-minutes/main/scripts/install.ps1 | iex
```

**macOS / Linux / Git Bash**

```bash
curl -fsSL https://raw.githubusercontent.com/Byeongjin-K/plaud-meeting-minutes/main/scripts/install.sh | bash
```

설치 스크립트는 Node 확인 → 전역 설치 → Plaud MCP 연동 → (선택) 로컬 전사 엔진 설치까지 한 번에 진행합니다.

**설치 없이 한 번만 써보기**

```bash
npx -y github:Byeongjin-K/plaud-meeting-minutes --help
```

**환경 점검**

```bash
plaud-minutes --version
npm run setup     # 레포를 클론한 경우: 무엇이 준비됐고 무엇이 비었는지 보여줍니다
```

---

## 어떻게 쓰나요 (3단계)

### 1단계 — 녹음을 노트북으로 가져오기

가장 편한 방법은 **Plaud MCP로 바로 받아오기**입니다. 기기에서 녹음하고 Plaud 앱이 동기화하면 끝입니다.

```bash
plaud-fetch latest --out recording.json
```

가장 최근 녹음을 찾아 전사까지 담아 저장합니다. 특정 회의를 고르려면:

```bash
plaud-fetch list --query "설계 검토"
plaud-fetch get <파일ID> --out recording.json
```

USB나 구글 드라이브로 오디오 파일을 직접 옮겨도 됩니다. 이 경우 폴더만 지정하면 가장 최근 파일을 자동으로 고릅니다.

### 2단계 — 전사 정리본과 작성 요청서 만들기

```bash
plaud-minutes ./recording.json --project "샘플 프로젝트"
```

Plaud가 이미 전사한 결과가 들어 있으면 그대로 씁니다.
오디오 파일이라면 `--engine local` 을 붙여 로컬에서 전사합니다.

```bash
plaud-minutes ./meeting.mp3 --engine local --model small
```

### 3단계 — 회의록 완성

2단계가 만들어 준 `..._작성요청.md` 를 AI 클라이언트(OmO / Claude / ChatGPT)에 그대로 전달하고,
받은 JSON을 `sections.json` 으로 저장한 뒤:

```bash
plaud-minutes ./recording.json --sections ./sections.json
```

완성되면 이런 파일들이 남습니다.

```
20260916_샘플 프로젝트/
  20260916_설계 검토 회의_전사.md        # 타임스탬프 + 화자별 전사
  20260916_설계 검토 회의_작성요청.md    # AI에게 줄 요약 지시서
  20260916_설계 검토 회의_회의록.md      # 최종 회의록
```

### AI 에이전트에게 통째로 맡기기 (가장 편한 방법)

OmO나 Claude Code 같은 에이전트에게 이렇게 말하면 위 세 단계를 대신 해 줍니다.

> 플라우드에서 가장 최근 녹음 가져와서, 20260916_분기 리뷰 폴더에 회의록 만들어줘

에이전트가 실제로 실행하는 것:

1. `plaud-fetch latest --out recording.json` — 최근 녹음과 전사를 받아옴
2. `plaud-minutes recording.json --project "분기 리뷰"` — 전사 정리본 생성
3. 전사를 읽고 안건별로 요약해 `sections.json` 작성 (이 부분이 에이전트의 몫)
4. `plaud-minutes recording.json --sections sections.json` — 회의록 완성

**중요: 이 방식은 에이전트에 Plaud MCP가 연결돼 있지 않아도 동작합니다.**
`plaud-fetch` 가 Plaud MCP 서버를 직접 띄워서 호출하기 때문입니다. 에이전트는 그냥 셸 명령을 실행할 뿐입니다.
인증은 `npx -y @plaud-ai/mcp@latest install` 로 한 번 로그인해 두면 `~/.plaud` 에 저장되어 계속 재사용됩니다.

> **자동화 정도에 대한 솔직한 설명**
> "녹음 버튼만 누르면 회의록이 저절로 생긴다"는 아닙니다. 요약 결과를 사람이 확인할 수 있도록
> 전사와 요약을 분리해 두었습니다. 대신 위처럼 에이전트에게 한 문장으로 맡기면 실질적으로는
> 한 번의 지시로 끝납니다.

---

## 회의록이 저장되는 위치

기본값은 **명령을 실행한 현재 폴더**입니다. 우선순위는 이렇습니다.

| 순위 | 방법 |
|---|---|
| 1 | `--repo <경로>` 옵션 |
| 2 | `PLAUD_MINUTES_ROOT` 환경변수 |
| 3 | 설정파일 `~/.plaud-minutes.json` 의 `repoRoot` |
| 4 | 현재 폴더 |

항상 같은 곳에 모으고 싶다면 한 번만 설정해 두면 됩니다.

```bash
plaud-minutes --set-root "C:\Users\me\Documents\meeting-notes"
plaud-minutes --show-config     # 지금 어디에 저장되는지 확인
```

설정한 폴더 안에서 실제 파일은 이렇게 만들어집니다.

```
<저장 위치>/
  20260916_<프로젝트>/
    20260916_<회의 제목>_전사.md
    20260916_<회의 제목>_작성요청.md
    20260916_<회의 제목>_회의록.md
```

`--project` 로 준 이름과 같은 폴더가 이미 있으면 **날짜가 달라도 그 폴더를 재사용**합니다.
파일 하나의 경로를 직접 정하고 싶으면 `--out <경로>` 를 쓰세요.

---

## 전사 엔진

기본값은 `none` 입니다. **의도치 않은 유료 호출이 절대 일어나지 않습니다.**

| 엔진 | 비용 | 준비물 |
|---|---|---|
| Plaud 클라우드 (입력이 이미 전사된 JSON) | 무료 월 300분 한도 내 | Plaud 계정 |
| `--engine local` | **완전 무료·오프라인** | Python + faster-whisper |
| `--engine openai` | 종량 과금 | `OPENAI_API_KEY` |

### 로컬 전사 설치 (무료 경로)

```powershell
# Windows
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install faster-whisper
```

```bash
# macOS / Linux
python3 -m venv .venv
./.venv/bin/python -m pip install faster-whisper
```

레포 폴더나 현재 작업 폴더의 `.venv` 를 CLI가 알아서 찾습니다.
다른 곳에 설치했다면 `PLAUD_MINUTES_PYTHON` 으로 지정하면 됩니다.

**모델 선택** — 기본값은 `large-v3-turbo` 입니다. 첫 실행 때 모델을 자동으로 내려받습니다.

먼저 한국어 회의 녹음(3분 10초)의 **같은 구간**을 작은 모델들로 전사해 비교했습니다.
그 구간은 조건을 여러 개 나열하는 발언이라, 판정 기준은 **나열 항목을 그대로 분리해 내는가** 였습니다.

| 모델 | 크기 | 같은 구간 판정 |
|---|---|---|
| `tiny` | ~75MB | (미측정) 받아쓰기 수준 미달 |
| `base` | ~140MB | **문장 구조 붕괴.** 나열이 서로 다른 문장으로 뒤섞여 사용 불가 |
| `small` | ~460MB | 읽을 수는 있으나 나열 항목이 하나로 뭉개짐 |
| `medium` | ~1.5GB | **항목을 정확히 분리.** 오인식이 단어 수준에 머묾 |

그 다음 4분 33초짜리 회의 **전체**로 `medium` 과 `large-v3-turbo` 를 쟀습니다.
(2026-09-16, CPU int8, 같은 파일·같은 옵션)

| 모델 | 크기 | 전사 시간 | RTF | 도메인 용어 |
|---|---|---|---|---|
| `medium` | ~1.5GB | 308.1초 | 1.13 | 10/22 |
| `large-v3-turbo` (기본) | ~1.6GB | **150.4초** | **0.55** | **12/22** |

`large-v3-turbo` 가 **2.05배 빠르면서 용어도 더 잡습니다.** `medium` 은 RTF 1.13 이라
실시간보다 느려서 1시간 회의에 1시간 넘게 걸립니다. turbo 는 medium 이 놓친
약어와 기관명을 더 잡았고, medium 전사에 있던 같은 구간 반복도 사라졌습니다.
가중치 크기도 비슷해서 설치 부담이 늘지 않습니다.

기본 모델을 바꾸고 싶으면 한 번만 설정하면 됩니다.

```bash
plaud-minutes --set-model large-v3-turbo   # 기본. 속도·정확도 모두 우위
plaud-minutes --set-model small            # 더 가볍게
plaud-minutes --set-model large-v3         # 더 정확하게 (대신 느림)
```

우선순위는 `--model` > `PLAUD_MINUTES_MODEL` > 설정파일 > 기본값(`large-v3-turbo`) 입니다.

**용어집 (`--terms`)** — 고유명사나 약어처럼 모델이 잘 모르는 용어는 미리 알려주면 더 잘 잡습니다.
같은 녹음 실측에서 도메인 용어 인식이 **12/22 → 13/22** 로 올라갔고, 전사량은 오히려 늘었습니다
(1847자 → 1904자, 전사 시간 150.4초 → 153.7초).
쉼표나 줄바꿈으로 구분한 문자열, 또는 그런 파일의 경로를 주면 됩니다.

```bash
# 문자열로 바로
plaud-minutes ./meeting.ogg --engine local --terms "결제모듈, 페일오버, 리드리플리카, 온프레미스, 웹훅"

# 프로젝트 용어집 파일로 (권장 — 회의마다 재사용)
plaud-minutes ./meeting.ogg --engine local --terms ./용어집.txt
```

용어집은 `"다음 용어가 나오는 회의입니다: ..."` 한 문장으로 만들어져 `initial_prompt` 로 들어갑니다.

> 같은 용어집을 `hotwords` 로 넣는 방법도 시도했지만 **장문에서 내용이 잘렸습니다.**
> 4분 33초 회의 실측에서 용어집 없이 1847자·58세그먼트였던 전사가
> hotwords 를 주자 1447자·23세그먼트로 줄고 마지막 35초 발언이 통째로 뭉개졌습니다.
> 용어집이 매 구간 프롬프트를 잡아먹어 디코더가 맥락을 잃기 때문입니다.
> `initial_prompt` 방식은 같은 조건에서 용어 인식이 12/22 → 14/22 로 올라가고 잃은 용어는 없었습니다.

용어는 **자주 틀리는 것 위주로 30개 안팎**이 적당합니다. 너무 길면 같은 잠식 현상이 생깁니다.

> **작은 모델에는 쓰지 마세요.** 같은 용어집을 `base` 에 주면 발언 72줄이 12줄로 무너지고
> 뒷부분이 통째로 빠졌습니다. `large-v3-turbo` 에서는 같은 용어집이 안전했습니다
> (전사량 1847자 → 1904자, 최장 세그먼트 26초로 붕괴 없음).
> `tiny`/`base` 와 함께 `--terms` 를 주면 CLI가 경고합니다.

**GPU 사용** — 기본은 CPU입니다. NVIDIA GPU가 있다면:

```bash
set PLAUD_MINUTES_DEVICE=cuda
```

| 환경변수 | 기본값 | 설명 |
|---|---|---|
| `PLAUD_MINUTES_PYTHON` | (자동 탐색) | 사용할 Python 실행 파일 |
| `PLAUD_MINUTES_DEVICE` | `cpu` | `cuda` 로 GPU 사용 |
| `PLAUD_MINUTES_COMPUTE` | `int8` | `float16`, `float32` 등 |
| `PLAUD_MINUTES_VAD` | (꺼짐) | `1` 이면 무음 구간 제거 활성화 |
| `PLAUD_MINUTES_TERMS` | (없음) | 용어집. `--terms` 가 이 값을 채웁니다 |

---

## Plaud MCP 연동

1. 설치 — 설치 스크립트가 이미 했다면 건너뜁니다.

   ```bash
   npx -y @plaud-ai/mcp@latest install
   ```

2. 브라우저가 열리면 Plaud 계정으로 로그인하고 **Authorize** 를 누릅니다.
3. **OmO를 쓰신다면** 한 줄로 등록합니다. (설치 스크립트가 이미 했다면 건너뛰세요)

   ```bash
   plaud-minutes --register-omo
   ```

   `~/.omo/agent/mcp.json` 에 plaud 항목만 추가하고 기존 MCP 설정(context7 등)은 그대로 둡니다.
   기존 파일이 있으면 `.bak` 으로 백업합니다.
   등록 후에는 **OmO를 완전히 종료했다가 다시 열어야** 도구가 보입니다. 세션 시작 시 서버를 띄우기 때문입니다.

   > OmO 는 `omo.jsonc` 가 아니라 `~/.omo/agent/mcp.json` 에서 MCP 서버를 읽습니다.
   > `omo.jsonc` 에는 MCP 항목이 아예 없습니다.

4. Claude Code, Claude Desktop, Cursor 등은 `npx -y @plaud-ai/mcp@latest install` 이 자동으로 등록합니다.
   그 클라이언트도 완전히 종료 후 재시작해야 합니다.
5. 이 레포의 `plaud-fetch` 는 AI 클라이언트를 거치지 않고 MCP 서버를 직접 호출하므로,
   **MCP 등록이나 재시작 없이도 바로 동작합니다.** 등록은 "AI와 대화하면서 자연어로 조회"할 때만 필요합니다.

MCP가 제공하는 도구: `list_files`, `get_file`, `get_transcript`, `get_note`, `get_current_user`.

> `get_file` 응답의 `source_list` 는 전사 '블록 목록'이고, 실제 발언은
> `data_type="transaction"` 블록의 `data_content` 안에 JSON 문자열로 중첩되어 있습니다.
> 이 CLI는 그 구조를 풀어서 읽습니다.

---

## 입력으로 줄 수 있는 것

- Plaud MCP 응답 JSON (`plaud-fetch` 결과 또는 `get_file` / `get_transcript` 출력)
- Whisper `verbose_json`
- 평문 전사 `.txt` / `.md` — `[00:01:02] 화자: 내용` 형식을 인식합니다
- 자막 `.srt` / `.vtt`
- 오디오 파일 (`.mp3 .m4a .wav .opus .aac .flac .ogg .wma .mp4 .amr .3gp`) — `--engine` 필요
- 폴더 — 가장 최근 파일을 자동 선택

---

## 옵션

| 옵션 | 설명 |
|---|---|
| `--title <문자열>` | 회의 제목 |
| `--project <문자열>` | 저장할 프로젝트 폴더 이름. 같은 이름 폴더가 있으면 재사용 |
| `--date <ISO>` | 회의 일시 (예: `2026-09-16T10:00`) |
| `--attendees <a,b,c>` | 참석자 목록 |
| `--template <이름>` | `default` 또는 `overview` |
| `--sections <파일>` | 요약 결과 JSON. 주면 회의록을 최종 저장합니다 |
| `--out <경로>` | 회의록 출력 경로 직접 지정 |
| `--repo <경로>` | 저장 루트 (기본: 현재 폴더) |
| `--engine <이름>` | `none` \| `local` \| `openai` |
| `--model <이름>` | 전사 모델 (`tiny` / `base` / `small` / `medium`) |
| `--transcript-only` | 전사 정리본만 만들고 종료 |
| `--dry-run` | 파일을 쓰지 않고 화면에만 출력 |
| `--force` | 기존 파일 덮어쓰기 허용 |
| `--json` | 결과 경로를 JSON으로 출력 |

---

## 회의록 포맷

**`default` 템플릿**

```markdown
# 주간 제품 점검 회의

- 2026년 9월 16일 10:00
- 참석자: 홍길동, 김철수, 이영희, 박민수

## 대시보드 개편 진행 상황

- 1차 배포본에서 목록 화면 로딩 지연 구간 2개소 확인
  - 해당 구간을 페이지 단위 로딩으로 전환하면 응답 시간을 400ms까지 축소 가능
```

**`overview` 템플릿**

```markdown
### 회의 개요

- 일시: 2026.04.28(화) 13:00 - 16:00
- 참석자: A사, B연구소, C대학교

### 논의내용

- 정량적 지표 논의
  - 세부 항목
```

---

## 라이브러리로 쓰기

```js
import { normalizeTranscript, renderMinutes } from "plaud-meeting-minutes";

const t = normalizeTranscript(plaudResponse, {
  speakerNames: { "Speaker 1": "홍길동", "Speaker 2": "김철수" },
});
const md = renderMinutes({ meeting: t.meeting, sections });
```

---

## 문제 해결

| 증상 | 해결 |
|---|---|
| `전사 내용이 비어 있습니다` | 입력에 발언 세그먼트가 없습니다. Plaud 앱에서 전사가 끝났는지 확인하세요 |
| `이미 파일이 있습니다` | `--force` 를 붙이면 덮어씁니다 |
| `cublas64_12.dll is not found` | NVIDIA 런타임이 없는 PC입니다. `PLAUD_MINUTES_DEVICE` 를 지우면 CPU로 동작합니다 |
| `faster-whisper 를 찾지 못했습니다` | 위 "로컬 전사 설치" 절차를 따르세요 |
| 전사 한글이 깨짐 | 최신 버전을 쓰세요. 0.1.0 이후 ASCII 이스케이프로 출력합니다 |
| MCP `401` / 인증 오류 | `npx -y @plaud-ai/mcp@latest install` 로 다시 로그인하세요 |
| 토큰 갱신 오류 | `~/.plaud/tokens-mcp.json` 을 지우고 다시 로그인하세요 |

---

## 개발

```bash
npm test        # 단위 테스트
npm run check   # 문법 검사
```

## 라이선스

MIT
