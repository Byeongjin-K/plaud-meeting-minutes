# plaud-meeting-minutes 한 줄 설치 (Windows PowerShell)
#
#   irm https://raw.githubusercontent.com/Byeongjin-K/plaud-meeting-minutes/main/scripts/install.ps1 | iex
#
# 환경변수
#   PLAUD_MINUTES_REPO : 설치할 소스 (기본 github:Byeongjin-K/plaud-meeting-minutes)
#   PLAUD_SKIP_MCP     : 1 이면 Plaud MCP 연동 단계를 건너뜀
#   PLAUD_SKIP_LOCAL   : 1 이면 로컬 전사 엔진 설치를 건너뜀

$ErrorActionPreference = "Stop"

function Write-Step($msg) { Write-Host "[*] $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "[!] $msg" -ForegroundColor Yellow }

Write-Host ""
Write-Host "plaud-meeting-minutes 설치를 시작합니다." -ForegroundColor White
Write-Host ""

# 1. Node.js 확인
Write-Step "Node.js 확인"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Warn "Node.js가 없습니다. https://nodejs.org 에서 LTS(20 이상)를 설치한 뒤 다시 실행하세요."
    exit 1
}
$nodeVersion = (node --version).TrimStart("v")
if ([int]($nodeVersion.Split(".")[0]) -lt 20) {
    Write-Warn "Node.js $nodeVersion 은 너무 낮습니다. 20 이상이 필요합니다."
    exit 1
}
Write-Ok "Node.js $nodeVersion"

# 2. 본체 설치
$repo = if ($env:PLAUD_MINUTES_REPO) { $env:PLAUD_MINUTES_REPO } else { "github:Byeongjin-K/plaud-meeting-minutes" }
Write-Step "plaud-minutes 설치 ($repo)"
npm install -g $repo
if ($LASTEXITCODE -ne 0) {
    Write-Warn "설치에 실패했습니다. 레포 주소를 확인하거나 PLAUD_MINUTES_REPO 로 경로를 지정하세요."
    exit 1
}
Write-Ok "plaud-minutes / plaud-fetch 설치 완료"

# 3. Plaud MCP 연동 (녹음을 클라우드에서 바로 가져오기)
if ($env:PLAUD_SKIP_MCP -ne "1") {
    Write-Step "Plaud MCP 연동"
    Write-Host "    브라우저가 열리면 Plaud 계정으로 로그인하고 Authorize 를 누르세요."
    npx -y "@plaud-ai/mcp@latest" install
    if ($LASTEXITCODE -ne 0) {
        Write-Warn "건너뜁니다. 나중에 'npx -y @plaud-ai/mcp@latest install' 로 다시 시도할 수 있습니다."
    } else {
        Write-Ok "Plaud MCP 연동 완료"
    }
}

# 4. 로컬 전사 엔진 (완전 무료 경로)
if ($env:PLAUD_SKIP_LOCAL -ne "1") {
    Write-Step "로컬 전사 엔진 설치 (무료·오프라인 전사용)"
    if (-not (Get-Command py -ErrorAction SilentlyContinue)) {
        Write-Warn "Python이 없어 건너뜁니다. https://python.org 설치 후 'npm run setup' 안내를 따르세요."
    } else {
        $pkgRoot = Join-Path (npm root -g) "plaud-meeting-minutes"
        $venvPython = Join-Path $pkgRoot ".venv\Scripts\python.exe"
        if (Test-Path $venvPython) {
            Write-Ok "이미 설치되어 있습니다"
        } else {
            py -3 -m venv (Join-Path $pkgRoot ".venv")
            & $venvPython -m pip install --disable-pip-version-check faster-whisper
            if ($LASTEXITCODE -eq 0) { Write-Ok "로컬 전사 엔진 설치 완료" }
            else { Write-Warn "로컬 전사 엔진 설치 실패 — 나중에 'npm run setup' 안내를 따르세요." }
        }
    }
}

# 5. OmO 연동 (설치돼 있을 때만)
if (Get-Command omo -ErrorAction SilentlyContinue) {
    Write-Step "OmO에 Plaud MCP 등록"
    plaud-minutes --register-omo
} else {
    Write-Host "[*] OmO가 없어 MCP 등록을 건너뜁니다. 나중에: plaud-minutes --register-omo" -ForegroundColor DarkGray
}

Write-Host ""
Write-Ok "설치가 끝났습니다."
Write-Host ""
Write-Host "바로 써보기:" -ForegroundColor White
Write-Host '    plaud-fetch latest --out recording.json     # Plaud에서 최근 녹음 받아오기'
Write-Host '    plaud-minutes recording.json --project "주간 회의"'
Write-Host ''
Write-Host '    plaud-minutes .\meeting.mp3 --engine local --model small   # 오디오 파일을 무료로 전사'
Write-Host ""
