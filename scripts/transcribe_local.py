"""로컬 faster-whisper 전사 → whisper verbose_json 호환 JSON을 stdout으로 출력.

사용: python transcribe_local.py <오디오파일> [모델] [언어]
"""

import json
import os
import sys


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: transcribe_local.py <audio> [model] [language]", file=sys.stderr)
        return 2

    audio = sys.argv[1]
    model_name = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] else "base"
    language = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] else None

    # device="auto" 는 NVIDIA 런타임이 없는 PC에서 cublas64_12.dll 로딩 오류를 낸다.
    # 기본은 CPU, NVIDIA GPU가 있으면 PLAUD_MINUTES_DEVICE=cuda 로 켠다.
    device = os.environ.get("PLAUD_MINUTES_DEVICE", "cpu")
    compute_type = os.environ.get("PLAUD_MINUTES_COMPUTE", "int8")

    # Windows에서는 pip로 설치한 nvidia-cublas-cu12 / nvidia-cudnn-cu12 의 DLL 폴더가
    # 기본 검색 경로에 없다. ctranslate2 는 첫 GPU 연산 시점에 LoadLibrary 로 DLL을 찾는데,
    # 이 경로는 os.add_dll_directory 가 아니라 PATH 를 본다. 둘 다 등록해 둔다.
    if device == "cuda" and hasattr(os, "add_dll_directory"):
        import sysconfig

        site_packages = sysconfig.get_paths()["purelib"]
        for pkg in ("cublas", "cudnn"):
            dll_dir = os.path.join(site_packages, "nvidia", pkg, "bin")
            if os.path.isdir(dll_dir):
                os.add_dll_directory(dll_dir)
                os.environ["PATH"] = dll_dir + os.pathsep + os.environ.get("PATH", "")

    from faster_whisper import WhisperModel

    model = WhisperModel(model_name, device=device, compute_type=compute_type)
    # vad_filter 는 faster-whisper 1.2.x 에서 restore_speech_timestamps 예외를 유발하는 경우가 있어
    # 기본은 끈다. 긴 무음이 많은 녹음에서만 PLAUD_MINUTES_VAD=1 로 켠다.
    use_vad = os.environ.get("PLAUD_MINUTES_VAD") == "1"
    # 전문용어 용어집.
    #
    # hotwords 로 넣어봤더니 장문에서 내용이 잘렸다. 4분 33초 한국어 회의 실측에서
    # 용어집 없는 전사는 1847자 58세그먼트였는데, 같은 용어집을 hotwords 로 주면
    # 1447자 23세그먼트로 줄고 마지막 35초 발언이 통째로 뭉개졌다.
    # 용어집이 매 구간 프롬프트를 잡아먹어 디코더가 맥락을 잃기 때문이다.
    #
    # 같은 용어를 한 문장으로 만들어 initial_prompt 로 주면 손실 없이 용어만 좋아진다.
    # (같은 실측에서 용어 인식 12/22 → 13/22, 전사량 1847자 → 1904자로 오히려 증가,
    #  최장 세그먼트 26초로 붕괴 없음)
    terms = os.environ.get("PLAUD_MINUTES_TERMS") or None
    initial_prompt = f"다음 용어가 나오는 회의입니다: {terms}." if terms else None
    segments, info = model.transcribe(
        audio, language=language, vad_filter=use_vad, initial_prompt=initial_prompt
    )

    payload = {
        "language": getattr(info, "language", language),
        "duration": getattr(info, "duration", None),
        "segments": [
            {"start": s.start, "end": s.end, "text": s.text}
            for s in segments
        ],
    }
    # Windows 콘솔 기본 인코딩(cp949 등)에서 한글이 깨지지 않도록 ASCII 이스케이프로 내보낸다.
    # 받는 쪽에서 JSON.parse 하면 원래 문자로 복원된다.
    sys.stdout.write(json.dumps(payload, ensure_ascii=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
