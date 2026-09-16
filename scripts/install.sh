#!/usr/bin/env bash
# plaud-meeting-minutes 한 줄 설치 (macOS / Linux / Git Bash)
#
#   curl -fsSL https://raw.githubusercontent.com/Byeongjin-K/plaud-meeting-minutes/main/scripts/install.sh | bash
#
# 환경변수
#   PLAUD_MINUTES_REPO : 설치할 소스 (기본 github:Byeongjin-K/plaud-meeting-minutes)
#   PLAUD_SKIP_MCP     : 1 이면 Plaud MCP 연동 단계를 건너뜀
#   PLAUD_SKIP_LOCAL   : 1 이면 로컬 전사 엔진 설치를 건너뜀

set -euo pipefail

step() { printf '\033[36m[*]\033[0m %s\n' "$1"; }
ok()   { printf '\033[32m[OK]\033[0m %s\n' "$1"; }
warn() { printf '\033[33m[!]\033[0m %s\n' "$1"; }

echo
echo "plaud-meeting-minutes 설치를 시작합니다."
echo

step "Node.js 확인"
if ! command -v node >/dev/null 2>&1; then
  warn "Node.js가 없습니다. https://nodejs.org 에서 LTS(20 이상)를 설치한 뒤 다시 실행하세요."
  exit 1
fi
NODE_VERSION="$(node --version | sed 's/^v//')"
if [ "${NODE_VERSION%%.*}" -lt 20 ]; then
  warn "Node.js $NODE_VERSION 은 너무 낮습니다. 20 이상이 필요합니다."
  exit 1
fi
ok "Node.js $NODE_VERSION"

REPO="${PLAUD_MINUTES_REPO:-github:Byeongjin-K/plaud-meeting-minutes}"
step "plaud-minutes 설치 ($REPO)"
npm install -g "$REPO"
ok "plaud-minutes / plaud-fetch 설치 완료"

if [ "${PLAUD_SKIP_MCP:-0}" != "1" ]; then
  step "Plaud MCP 연동"
  echo "    브라우저가 열리면 Plaud 계정으로 로그인하고 Authorize 를 누르세요."
  if npx -y "@plaud-ai/mcp@latest" install; then
    ok "Plaud MCP 연동 완료"
  else
    warn "건너뜁니다. 나중에 'npx -y @plaud-ai/mcp@latest install' 로 다시 시도할 수 있습니다."
  fi
fi

if [ "${PLAUD_SKIP_LOCAL:-0}" != "1" ]; then
  step "로컬 전사 엔진 설치 (무료·오프라인 전사용)"
  if ! command -v python3 >/dev/null 2>&1; then
    warn "Python3가 없어 건너뜁니다. 설치 후 'npm run setup' 안내를 따르세요."
  else
    PKG_ROOT="$(npm root -g)/plaud-meeting-minutes"
    VENV_PYTHON="$PKG_ROOT/.venv/bin/python"
    if [ -x "$VENV_PYTHON" ]; then
      ok "이미 설치되어 있습니다"
    elif python3 -m venv "$PKG_ROOT/.venv" && "$VENV_PYTHON" -m pip install --disable-pip-version-check faster-whisper; then
      ok "로컬 전사 엔진 설치 완료"
    else
      warn "로컬 전사 엔진 설치 실패 — 나중에 'npm run setup' 안내를 따르세요."
    fi
  fi
fi

if command -v omo >/dev/null 2>&1; then
  step "OmO에 Plaud MCP 등록"
  plaud-minutes --register-omo
else
  echo "[*] OmO가 없어 MCP 등록을 건너뜁니다. 나중에: plaud-minutes --register-omo"
fi

echo
ok "설치가 끝났습니다."
echo
echo "바로 써보기:"
echo '    plaud-fetch latest --out recording.json     # Plaud에서 최근 녹음 받아오기'
echo '    plaud-minutes recording.json --project "주간 회의"'
echo
echo '    plaud-minutes ./meeting.mp3 --engine local --model small   # 오디오 파일을 무료로 전사'
echo
