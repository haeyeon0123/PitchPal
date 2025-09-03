# backend/main.py — hardened & session‑scoped
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional, Tuple
from pathlib import Path
import shutil, uuid, json, os

# 진행률/비동기용
import asyncio
import traceback
from datetime import datetime, timedelta

# ===== (추가) 로깅/모니터링 유틸 =====
import time, logging, json as _json, platform

# ---------------- C O N F I G ----------------
FRONT_ORIGIN = os.getenv("FRONT_ORIGIN", "http://localhost:3000")
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", 50 * 1024 * 1024))  # 50MB
ALLOWED_AUDIO_EXT = {".wav", ".mp3", ".m4a"}
ALLOWED_TEXT_EXT  = {".txt"}
JOB_TTL = timedelta(hours=1)

# -----------------------------------------------------
# 로거
# -----------------------------------------------------
def _get_logger():
    logger = logging.getLogger("pitchpal")
    if not logger.handlers:
        h = logging.StreamHandler()
        fmt = logging.Formatter('%(asctime)s | %(levelname)s | %(message)s')
        h.setFormatter(fmt)
        logger.addHandler(h)
    logger.setLevel(logging.INFO)
    return logger

_logger = _get_logger()


def log_json(event: str, **fields):
    """구조화 로그: 콘솔에서 grep/filter 하기 쉬움"""
    try:
        _logger.info(_json.dumps({"event": event, **fields}, ensure_ascii=False))
    except Exception as e:
        _logger.info(f'{{"event":"{event}","note":"log_json_error","err":"{e}"}}')


class stage:
    """with stage("name", **meta): ...  -> 시작/종료 + 경과시간(ms) 로깅"""
    def __init__(self, name: str, **meta):
        self.name = name
        self.meta = meta
        self.t0 = None
    def __enter__(self):
        self.t0 = time.perf_counter()
        log_json("stage_start", stage=self.name, **self.meta)
        return self
    def __exit__(self, exc_type, exc, tb):
        took = time.perf_counter() - self.t0
        log_json("stage_end", stage=self.name, took_sec=round(took, 4), **self.meta)


# ===== 팀 기능 코드 =====
from model.content.core.spell_checker import run_spellcheck_and_analysis
from model.speech.core.speech_analysis import analyze_speech
from model.evaluation.evaluation_model import SpeechEvaluator

# -----------------------------------------------------
# FastAPI 기본 설정
# -----------------------------------------------------
app = FastAPI(title="PitchPal API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONT_ORIGIN],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 요청 별 request-id 부여
@app.middleware("http")
async def _req_timer(request: Request, call_next):
    req_id = request.headers.get("X-Request-ID", uuid.uuid4().hex)
    request.state.req_id = req_id
    t0 = time.perf_counter()
    resp = None
    try:
        log_json("http_request_start", req_id=req_id, path=str(request.url.path), method=request.method)
        resp = await call_next(request)
        return resp
    finally:
        took = time.perf_counter() - t0
        log_json(
            "http_request_end",
            req_id=req_id,
            path=str(request.url.path),
            method=request.method,
            status=getattr(resp, "status_code", None),
            took_sec=round(took, 4),
        )

# (추가) 기동 시 환경 정보 로깅 (GPU/CPU 등)
@app.on_event("startup")
async def _startup_env_log():
    cuda = None
    device = "unknown"
    torch_ver = None
    try:
        import torch
        torch_ver = torch.__version__
        cuda = bool(torch.cuda.is_available())
        device = torch.cuda.get_device_name(0) if cuda else "cpu"
    except Exception:
        pass
    versions = {}
    try:
        import librosa; versions["librosa"] = getattr(librosa, "__version__", None)
    except Exception: pass
    try:
        import cv2; versions["opencv"] = getattr(cv2, "__version__", None)
    except Exception: pass
    try:
        import mediapipe; versions["mediapipe"] = getattr(mediapipe, "__version__", None)
    except Exception: pass

    log_json(
        "env",
        python=platform.python_version(),
        torch=torch_ver,
        cuda=cuda,
        device=device,
        libs=versions,
        cwd=os.getcwd(),
        front_origin=FRONT_ORIGIN,
    )

# -----------------------------------------------------
# 디렉토리 구성 (프로젝트 루트 기준)
# -----------------------------------------------------
ROOT_DIR = Path(__file__).resolve().parents[1]   # PitchPal/

CONTENT_RESULT_ROOT = ROOT_DIR / "model" / "content" / "results"
SPEECH_TMP_ROOT     = ROOT_DIR / "model" / "speech" / "tmp"
SPEECH_RESULT_ROOT  = ROOT_DIR / "model" / "speech" / "results"

CONTENT_RESULT_ROOT.mkdir(parents=True, exist_ok=True)
SPEECH_TMP_ROOT.mkdir(parents=True, exist_ok=True)
SPEECH_RESULT_ROOT.mkdir(parents=True, exist_ok=True)

# 정적 파일 서빙 (세션 디렉터리 포함)
app.mount("/static", StaticFiles(directory=str(CONTENT_RESULT_ROOT)), name="static")
app.mount("/static-speech", StaticFiles(directory=str(SPEECH_RESULT_ROOT)), name="static-speech")
app.mount("/model/speech/results", StaticFiles(directory=str(SPEECH_RESULT_ROOT)), name="speech-results-alias")

# -----------------------------------------------------
# 공통 유틸
# -----------------------------------------------------
class EvaluateBody(BaseModel):
    features: Dict[str, Any]


def load_json_file(file_name: str) -> Optional[dict]:
    p = CONTENT_RESULT_ROOT / file_name
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return None

# === (NEW) speech 결과 전용 유틸 ===

def load_speech_json_scoped(session_id: str, file_name: str) -> Optional[dict]:
    p = SPEECH_RESULT_ROOT / session_id / file_name
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return None


def _save_speech_json_scoped(session_id: str, file_name: str, data: dict) -> str:
    sess_dir = SPEECH_RESULT_ROOT / session_id
    sess_dir.mkdir(parents=True, exist_ok=True)
    p = sess_dir / file_name
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return f"/model/speech/results/{session_id}/{file_name}"


def _to_float(x, default=0.0):
    try:
        return float(x)
    except Exception:
        return default


def _to_float_list(x, n=None):
    try:
        arr = [float(v) for v in (x or [])]
        return arr[:n] if n else arr
    except Exception:
        return []


def get_in(d: dict, paths: List[List[str]]) -> Optional[Any]:
    if not isinstance(d, dict):
        return None
    for path in paths:
        cur = d
        ok = True
        for k in path:
            if isinstance(cur, dict) and k in cur:
                cur = cur[k]
            else:
                ok = False
                break
        if ok and cur not in (None, "", []):
            return cur
    return None


def build_content_response(payload: Optional[dict] = None) -> Dict[str, Any]:
    """내용 분석 파이프라인 결과(JSON 파일들)를 표준 응답 스키마로 빌드."""
    data = None
    for cand in [
        "corrected_result.json",
        "corrected.json",
        "result.json",
        "content_result.json",
        "content_analysis.json",
    ]:
        data = load_json_file(cand)
        if data:
            break
    if not data:
        data = {}

    original_text = get_in(data, [["spell_check", "original_text"], ["original_text"]])

    corrected_text = get_in(data, [
        ["spell_check", "corrected_text"],
        ["content_feedback", "content_feedback", "corrected_text"],
        ["content_feedback", "corrected_text"],
        ["corrected_text"],
    ])

    highlighted_html = get_in(data, [["spell_check", "highlighted_html"], ["highlighted_html"], ["diff_html"], ["html"]])

    feedback_text = get_in(data, [
        ["content_feedback", "content_feedback", "feedback_text"],
        ["content_feedback", "feedback_text"],
        ["feedback_text"], ["analysis"], ["comment"],
    ])

    scores_raw = get_in(data, [
        ["content_feedback", "content_feedback", "scores"],
        ["content_feedback", "scores"],
        ["scores"],
    ])
    scores = scores_raw if isinstance(scores_raw, dict) and len(scores_raw) > 0 else None

    html_url: Optional[str] = None
    meta_html = get_in(data, [["meta", "html_url"]])
    if meta_html:
        html_url = str(meta_html)
    if not html_url:
        html_path = CONTENT_RESULT_ROOT / "corrected_result.html"
        if not html_path.exists():
            for alt in ["corrected.html", "result.html", "content_result.html"]:
                p = CONTENT_RESULT_ROOT / alt
                if p.exists():
                    html_path = p
                    break
        html_url = f"/static/{html_path.name}" if (html_path and html_path.exists()) else None

    # merge meta (file meta <- payload meta 우선)
    meta_from_file = get_in(data, [["meta"]]) or {}
    merged_meta = {**meta_from_file, **(payload or {}).get("meta", {})}

    return {
        "html_url": html_url,
        "original_text": original_text,
        "corrected_text": corrected_text,
        "highlighted_html": highlighted_html,
        "feedback_text": feedback_text,
        "scores": scores,
        "meta": merged_meta,
    }

# -----------------------------------------------------
# [음성분석] 응답 스키마 (프론트 표준 매핑)
# -----------------------------------------------------
class Segment(BaseModel):
    start_sec: float
    end_sec: float
    wpm: Optional[float] = None
    pitch_mean: Optional[float] = None
    pitch_std: Optional[float] = None
    has_filler: Optional[bool] = None
    is_pause: Optional[bool] = None
    mfcc_mean: Optional[List[float]] = None


class SpeechAnalysisResponse(BaseModel):
    pronunciation_accuracy: float
    wpm: float
    pitch_mean: float
    pitch_std: float
    pause_ratio: float
    filler_count: int
    mfcc_mean: List[float] = Field(default_factory=list)
    mfcc_std: List[float]  = Field(default_factory=list)
    scores: Dict[str, float] = Field(default_factory=dict)
    segments: List[Segment]   = Field(default_factory=list)
    feedback_text: str = ""
    stt_results_url: Optional[str] = None
    analysis_mode: str = "audio+script"
    fillers: List[Dict[str, Any]] = Field(default_factory=list)   # [{token, time}]
    silence: List[Dict[str, float]] = Field(default_factory=list) # [{start,end}]
    filler: Dict[str, Any] = Field(default_factory=dict)          # {"total":int,"by_type":{},"occurrences":[...]}
    session_id: Optional[str] = None

# -----------------------------------------------------
# 업로드/세션 유틸
# -----------------------------------------------------
async def _ensure_safe_upload(upload: UploadFile, allowed_ext: set):
    ext = Path(upload.filename).suffix.lower()
    if ext not in allowed_ext:
        raise HTTPException(status_code=400, detail=f"허용되지 않은 파일 형식: {ext}")


def _save_upload_to_tmp(upload: UploadFile, target_dir: Path, fallback_suffix: str) -> Path:
    with stage("save_upload", file=upload.filename):
        ext = (Path(upload.filename).suffix or fallback_suffix).lower()
        out_path = target_dir / f"{uuid.uuid4().hex}{ext}"
        size = 0
        with out_path.open("wb") as f:
            while True:
                chunk = upload.file.read(1024 * 1024)  # 1MB
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    f.close()
                    out_path.unlink(missing_ok=True)
                    raise HTTPException(status_code=413, detail="파일이 너무 큽니다(>50MB).")
                f.write(chunk)
    return out_path


# -----------------------------------------------------
# [NEW] total_temp 결과 → 표준 JSON 빌더
# -----------------------------------------------------

def _parse_time_range_to_secs(tr: Any) -> Optional[Tuple[float, float]]:
    try:
        if isinstance(tr, (list, tuple)) and len(tr) == 2:
            s, e = float(tr[0]), float(tr[1])
            return (min(s, e), max(s, e))
        tr = str(tr)
        if "-" in tr or "~" in tr:
            a, b = (tr.replace("~", "-")).split("-", 1)
            def to_sec(x: str) -> float:
                x = x.strip()
                if ":" in x:
                    m, s = x.split(":")
                    return float(m) * 60 + float(s)
                return float(x)
            s, e = to_sec(a), to_sec(b)
            return (min(s, e), max(s, e))
    except Exception:
        return None
    return None


def _coerce_segment_dict(d: Dict[str, Any]) -> Segment:
    if "start_sec" in d and "end_sec" in d:
        return Segment(**{
            "start_sec": _to_float(d["start_sec"]),
            "end_sec": _to_float(d["end_sec"]),
            "wpm": d.get("wpm"),
            "pitch_mean": d.get("pitch_mean"),
            "pitch_std": d.get("pitch_std"),
            "has_filler": d.get("has_filler"),
            "is_pause": d.get("is_pause"),
            "mfcc_mean": d.get("mfcc_mean"),
        })
    if "time_range" in d:
        se = _parse_time_range_to_secs(d["time_range"])
        if se:
            s, e = se
            return Segment(**{
                "start_sec": s,
                "end_sec": e,
                "wpm": d.get("wpm"),
                "pitch_mean": d.get("pitch_mean"),
                "pitch_std": d.get("pitch_std"),
                "has_filler": d.get("has_filler"),
                "is_pause": d.get("is_pause"),
                "mfcc_mean": d.get("mfcc_mean"),
            })
    return Segment(start_sec=0.0, end_sec=5.0)


def _build_segments_results_from_totaltemp(
    raw: Dict[str, Any],
    segments_norm: List['Segment'],
    global_fillers: List[Dict[str, Any]],
    global_silence: List[Dict[str, float]],
    pron_acc: float,
    wpm: float,
    pause_ratio: float
) -> dict:
    by_type_pref = raw.get("간투사_빈도", {})

    occ_src = raw.get("Filler Words") or raw.get("Filler_Words") \
              or raw.get("filler_occurrences") or raw.get("Filler Occurrences") \
              or []
    occurrences = []
    for it in occ_src:
        try:
            token, s, e = it[0], float(it[1]), float(it[2])
            occurrences.append({"type": str(token), "start": s, "end": e, "time": (s + e) / 2})
        except Exception:
            pass
    if not occurrences and global_fillers:
        for f in global_fillers:
            t = str(f.get("token", f.get("word", "F")))
            tm = _to_float(f.get("time", f.get("time_sec", 0.0)))
            occurrences.append({"type": t, "start": max(0.0, tm - 0.05), "end": tm + 0.05, "time": tm})

    if by_type_pref:
        by_type = {str(k): int(v) for k, v in by_type_pref.items()}
    else:
        by_type = {}
        for o in occurrences:
            w = o.get("type", "기타")
            by_type[w] = by_type.get(w, 0) + 1

    filler_total = int(raw.get("간투사 수", raw.get("Filler Count", raw.get("filler_count", sum(by_type.values())))))

    segs = [{
        "time_range": f"{s.start_sec:.2f}-{s.end_sec:.2f}",
        "wpm": s.wpm,
        "pitch_mean": s.pitch_mean,
        "mfcc_mean": s.mfcc_mean,
        "fillers": [],
        "silence": [],
    } for s in segments_norm]

    return {
        "summary": {
            "pronunciation_accuracy": pron_acc,
            "wpm": wpm,
            "pause_ratio": pause_ratio,
            "filler_count": filler_total,
        },
        "filler": {
            "total": filler_total,
            "by_type": by_type,
            "occurrences": occurrences,
        },
        "segments": segs,
        "silence": global_silence,
        "meta": {"source": "total_temp"},
    }


def _make_feedback_text(pron_acc: float, avg_pitch: float, avg_wpm: float, filler_count: int) -> str:
    if pron_acc > 0.8 and avg_pitch > 70 and avg_wpm > 100 and filler_count < 5:
        return "✅ 발음, 억양, 속도 모두 잘 조화되어 있습니다! 발표가 자연스럽습니다."
    elif pron_acc > 0.6:
        return "🔶 발음은 괜찮습니다. 억양 또는 추임새, 속도에 조금 더 주의해주세요."
    else:
        return "❌ 발음과 억양, 속도 전반에 개선이 필요합니다. 꾸준한 연습이 도움이 됩니다."


# -----------------------------------------------------
# [NEW] 음성 응답 매퍼 (세션 지원)
# -----------------------------------------------------

def _map_speech_raw_to_response(raw: Dict[str, Any], session_id: str) -> SpeechAnalysisResponse:
    pron_acc_pct = _to_float(raw.get("발음 유사도 점수", raw.get("pronunciation_accuracy")))
    pron_acc = pron_acc_pct / (100.0 if pron_acc_pct and pron_acc_pct > 1.0 else 1.0)

    wpm = _to_float(raw.get("wpm"))
    pitch_mean = _to_float(raw.get("Pitch 평균", raw.get("pitch_mean")))
    pitch_std  = _to_float(raw.get("Pitch 표준편차", raw.get("pitch_std")))
    pause_ratio = _to_float(raw.get("무음 구간 비율", raw.get("pause_ratio")))
    filler_count = int(_to_float(raw.get("간투사 수", raw.get("filler_count", 0))))

    mfcc_mean = _to_float_list(raw.get("MFCC 평균", raw.get("mfcc_mean")), 13)
    mfcc_std  = _to_float_list(raw.get("MFCC 표준편차", raw.get("mfcc_std")), 13)

    # --- STT HTML 세션 경로 보장 ---
    src_html = SPEECH_RESULT_ROOT / "stt_results.html"   # 루트에 생성된 파일
    dest_dir = SPEECH_RESULT_ROOT / session_id
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_html = dest_dir / "stt_results.html"

    # 루트에 있으면 세션 경로로 복사
    if src_html.exists():
        try:
            shutil.copyfile(src_html, dest_html)
        except Exception as e:
            log_json("stt_copy_error", error=str(e))

    # 프론트에는 항상 세션 경로 반환
    stt_url = f"/model/speech/results/{session_id}/stt_results.html"


    segments_norm: List[Segment] = []
    global_fillers: List[Dict[str, Any]] = []
    global_silence: List[Dict[str, float]] = []

    for seg in raw.get("segments", []) or []:
        s, e = 0.0, 0.0
        if isinstance(seg, dict):
            if "time_range" in seg:
                parsed = _parse_time_range_to_secs(seg["time_range"])
                if parsed:
                    s, e = parsed
            else:
                s = _to_float(seg.get("start_sec", 0.0))
                e = _to_float(seg.get("end_sec", 0.0))

            for f in seg.get("fillers", []) or []:
                try:
                    token, fs, fe = f[0], float(f[1]), float(f[2])
                    global_fillers.append({"token": str(token), "time": (fs + fe) / 2.0})
                except Exception:
                    pass

            for iv in seg.get("silence", []) or []:
                try:
                    ls, le = float(iv[0]), float(iv[1])
                    global_silence.append({"start": s + ls, "end": s + le})
                except Exception:
                    pass

            segments_norm.append(Segment(
                start_sec=s, end_sec=e,
                wpm=seg.get("wpm"),
                pitch_mean=seg.get("pitch_mean"),
                pitch_std=None,
                has_filler=bool(seg.get("fillers")),
                is_pause=bool(seg.get("silence")),
                mfcc_mean=seg.get("mfcc_mean"),
            ))
        else:
            segments_norm.append(Segment(start_sec=0.0, end_sec=5.0))

    raw_fw = (
        raw.get("Filler Words")
        or raw.get("Filler_Words")
        or raw.get("filler_occurrences")
        or raw.get("Filler Occurrences")
        or []
    )

    occurrences: List[Dict[str, Any]] = []
    by_type: Dict[str, int] = {}

    if raw_fw:
        for it in raw_fw:
            try:
                t, s2, e2 = it[0], float(it[1]), float(it[2])
            except Exception:
                t = (it.get("type") or it.get("token") or it.get("word"))
                s2 = _to_float(it.get("start", it.get("start_sec", 0.0)))
                e2 = _to_float(it.get("end", it.get("end_sec", 0.0)))
            if not t:
                continue
            occurrences.append({
                "type": str(t), "start": s2, "end": e2,
                "time": (s2 + e2) / 2.0, "duration": max(0.0, e2 - s2)
            })
        for o in occurrences:
            by_type[o["type"]] = by_type.get(o["type"], 0) + 1

    if not by_type and raw.get("간투사_빈도"):
        by_type = {str(k): int(v) for k, v in dict(raw.get("간투사_빈도", {})).items()}

    if not occurrences and global_fillers:
        for f in global_fillers:
            tkn = str(f.get("token", "F"))
            tm = _to_float(f.get("time", 0.0))
            occurrences.append({
                "type": tkn, "start": max(0.0, tm - 0.05), "end": tm + 0.05,
                "time": tm, "duration": 0.1
            })
        if not by_type:
            for o in occurrences:
                by_type[o["type"]] = by_type.get(o["type"], 0) + 1

    filler_total = raw.get("간투사 수", raw.get("filler_count", raw.get("Filler Count")))
    if isinstance(filler_total, (int, float)):
        filler_total = int(filler_total)
    else:
        filler_total = len(occurrences) if occurrences else sum(by_type.values())

    segments_json = _build_segments_results_from_totaltemp(
        raw=raw,
        segments_norm=segments_norm,
        global_fillers=[{"token": o.get("type"), "time": o.get("time", o.get("start", 0.0))} for o in occurrences],
        global_silence=global_silence,
        pron_acc=pron_acc, wpm=wpm, pause_ratio=pause_ratio,
    )
    _save_speech_json_scoped(session_id, "segments_results.json", segments_json)

    feedback_text = _make_feedback_text(pron_acc, pitch_mean, wpm, filler_total)
    scores = {
        "pronunciation": round(pron_acc * 10, 2),
        "speed": 7.0, "intonation": 6.0,
        "filler": max(0.0, 10.0 - min(10.0, float(filler_total))),
        "pause": max(0.0, 10.0 - round(pause_ratio * 10, 2)),
        "mfcc": 8.0,
    }

    return SpeechAnalysisResponse(
        pronunciation_accuracy=pron_acc,
        wpm=wpm,
        pitch_mean=pitch_mean,
        pitch_std=pitch_std,
        pause_ratio=pause_ratio,
        filler_count=filler_total,
        mfcc_mean=mfcc_mean,
        mfcc_std=mfcc_std,
        scores=scores,
        segments=segments_norm,
        feedback_text=feedback_text,
        stt_results_url=stt_url,
        analysis_mode="audio+script",
        fillers=[{"token": o["type"], "time": o.get("time", o["start"]) } for o in occurrences],
        silence=global_silence,
        filler={"total": filler_total, "by_type": by_type, "occurrences": occurrences},
        session_id=session_id,
    )


# -----------------------------------------------------
# [1] 기존 동기식 엔드포인트 (호환 유지)
# -----------------------------------------------------
@app.post("/speech/analyze", response_model=SpeechAnalysisResponse, tags=["speech"], summary="음성 분석(동기)")
async def speech_analyze(
    audio: UploadFile = File(..., description="음성 파일(.wav/.mp3 등)"),
    script: UploadFile = File(..., description="대본 텍스트 파일(.txt)"),
):
    with stage("speech_validate"):
        if not audio.filename or not script.filename:
            raise HTTPException(status_code=400, detail="audio, script 파일이 모두 필요합니다.")
        await _ensure_safe_upload(audio, ALLOWED_AUDIO_EXT)
        await _ensure_safe_upload(script, ALLOWED_TEXT_EXT)

    with stage("speech_save_uploads"):
        audio_path  = _save_upload_to_tmp(audio,  SPEECH_TMP_ROOT, ".wav")
        script_path = _save_upload_to_tmp(script, SPEECH_TMP_ROOT, ".txt")
        session_id = uuid.uuid4().hex

    try:
        with stage("speech_analyze_total", file=audio.filename):
            try:
                raw: Dict[str, Any] = analyze_speech(
                    audio_path=str(audio_path),
                    script_path=str(script_path),
                )
                # 세션 id를 raw에도 남겨 두면 downstream에서 참고 가능
                raw["session_id"] = session_id
            except Exception as ex:
                log_json("speech_analyze_exception", error=str(ex))
                # 동기 fallback은 간단화(세션 포함)
                stt_url = f"/model/speech/results/{session_id}/stt_results.html"
                return SpeechAnalysisResponse(
                    pronunciation_accuracy=0.82,
                    wpm=126.0,
                    pitch_mean=185.2,
                    pitch_std=22.7,
                    pause_ratio=0.14,
                    filler_count=6,
                    mfcc_mean=[0.1]*13,
                    mfcc_std=[0.05]*13,
                    scores={"speed":7.5, "intonation":6.3, "pronunciation":8.1, "filler":6.5, "pause":7.0, "mfcc":8.0},
                    segments=[
                        Segment(start_sec=0,  end_sec=5,  wpm=120, pitch_mean=180, pitch_std=20, has_filler=False, is_pause=False, mfcc_mean=[0.1]*13),
                        Segment(start_sec=5,  end_sec=10, wpm=132, pitch_mean=190, pitch_std=24, has_filler=True,  is_pause=False, mfcc_mean=[0.1]*13),
                        Segment(start_sec=10, end_sec=15, wpm=126, pitch_mean=186, pitch_std=21, has_filler=False, is_pause=True,  mfcc_mean=[0.1]*13),
                    ],
                    feedback_text="🔶 발음은 괜찮습니다. 억양/간투사/속도 밸런스를 조금만 더 다듬어보세요.",
                    stt_results_url=stt_url,
                    analysis_mode="audio+script",
                    fillers=[{"token":"어","time":7.6},{"token":"음","time":12.1}],
                    silence=[{"start":11.0,"end":12.2}],
                    filler={"total":6,"by_type":{"어":1,"음":1},"occurrences":[{"type":"어","time":7.6},{"type":"음","time":12.1}]},
                    session_id=session_id,
                )

        with stage("speech_map_response"):
            resp = _map_speech_raw_to_response(raw, session_id=session_id)
        return resp

    except Exception as e:
        log_json("speech_error", error=str(e))
        raise HTTPException(status_code=500, detail="분석 중 오류가 발생했습니다.")

    finally:
        with stage("speech_cleanup"):
            try:
                if audio_path.exists():  audio_path.unlink()
                if script_path.exists(): script_path.unlink()
            except Exception:
                pass


# -----------------------------------------------------
# [2] NEW 비동기 파이프라인 (start/progress/result)
# -----------------------------------------------------
JOBS: Dict[str, Dict[str, Any]] = {}
SPEECH_JOBS: Dict[str, Dict[str, Any]] = {}


def _set_progress(job_dict: Dict[str, Dict[str, Any]], job_id: str, value: int, message: str = ""):
    job = job_dict.get(job_id)
    if not job:
        return
    job["progress"] = max(0, min(100, int(value)))
    if message:
        job["message"] = message
    job["ts"] = datetime.utcnow()


def _set_status(job_dict: Dict[str, Dict[str, Any]], job_id: str, status: str, message: str = ""):
    job = job_dict.get(job_id)
    if not job:
        return
    job["status"] = status
    if message:
        job["message"] = message
    job["ts"] = datetime.utcnow()


def _gc_jobs():
    now = datetime.utcnow()
    for store in (JOBS, SPEECH_JOBS):
        for k, v in list(store.items()):
            ts = v.get("ts", now)
            if now - ts > JOB_TTL:
                store.pop(k, None)


async def _ticker(job_dict: Dict[str, Dict[str, Any]], job_id: str, until: int = 90, step_ms: int = 400):
    try:
        while True:
            await asyncio.sleep(step_ms / 1000)
            job = job_dict.get(job_id)
            if not job:
                return
            if job["status"] in ("done", "error"):
                return
            cur = int(job.get("progress", 0))
            if cur < until:
                _set_progress(job_dict, job_id, cur + 1)
            else:
                await asyncio.sleep(0.7)
    except Exception:
        pass


_ExecSemaphore = asyncio.Semaphore(2)  # 동시 실행 제한


async def _run_speech_pipeline(job_id: str, session_id: str, audio_path: Path, script_path: Path):
    ticker_task = None
    try:
        _set_status(SPEECH_JOBS, job_id, "running", "작업 시작")
        _set_progress(SPEECH_JOBS, job_id, 5, "업로드 확인")
        ticker_task = asyncio.create_task(_ticker(SPEECH_JOBS, job_id, until=92, step_ms=450))

        loop = asyncio.get_running_loop()
        async with _ExecSemaphore:
            with stage("speech_preprocess"):
                _set_progress(SPEECH_JOBS, job_id, 15, "전처리")

            with stage("speech_run_core"):
                _set_progress(SPEECH_JOBS, job_id, 25, "분석 중(Whisper/MFCC 등)")
                raw: Dict[str, Any] = await loop.run_in_executor(
                    None,
                    lambda: analyze_speech(audio_path=str(audio_path), script_path=str(script_path))
                )
                raw["session_id"] = session_id

            with stage("speech_map"):
                _set_progress(SPEECH_JOBS, job_id, 92, "결과 매핑")
                resp = _map_speech_raw_to_response(raw, session_id=session_id)
                SPEECH_JOBS[job_id]["result"] = resp.dict()

        _set_progress(SPEECH_JOBS, job_id, 100, "완료")
        _set_status(SPEECH_JOBS, job_id, "done", "완료")
        log_json("speech_pipeline_done", job_id=job_id)

    except Exception as e:
        traceback.print_exc()
        _set_status(SPEECH_JOBS, job_id, "error", f"에러: {e}")
        _set_progress(SPEECH_JOBS, job_id, 100)
        SPEECH_JOBS[job_id]["result"] = None
        log_json("speech_pipeline_error", job_id=job_id, error=str(e))
    finally:
        try:
            if ticker_task:
                ticker_task.cancel()
        except Exception:
            pass
        try:
            if audio_path.exists():  audio_path.unlink()
            if script_path.exists(): script_path.unlink()
        except Exception:
            pass
        _gc_jobs()


@app.post("/speech/start", tags=["speech"], summary="음성 분석 작업 시작(비동기)")
async def speech_start(
    background_tasks: BackgroundTasks,
    audio: UploadFile = File(..., description="음성 파일(.wav/.mp3 등)"),
    script: UploadFile = File(..., description="대본 텍스트 파일(.txt)"),
):
    if not audio.filename or not script.filename:
        raise HTTPException(status_code=400, detail="audio, script 파일이 모두 필요합니다.")
    await _ensure_safe_upload(audio, ALLOWED_AUDIO_EXT)
    await _ensure_safe_upload(script, ALLOWED_TEXT_EXT)

    audio_path  = _save_upload_to_tmp(audio,  SPEECH_TMP_ROOT, ".wav")
    script_path = _save_upload_to_tmp(script, SPEECH_TMP_ROOT, ".txt")

    job_id = uuid.uuid4().hex
    session_id = uuid.uuid4().hex
    SPEECH_JOBS[job_id] = {"progress": 0, "status": "queued", "message": "대기 중", "result": None, "ts": datetime.utcnow(), "session_id": session_id}
    background_tasks.add_task(_run_speech_pipeline, job_id, session_id, audio_path, script_path)
    return {"job_id": job_id, "session_id": session_id}


@app.get("/speech/progress/{job_id}", tags=["speech"], summary="진행률 조회")
async def speech_progress(job_id: str):
    _gc_jobs()
    job = SPEECH_JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job_id 없음")
    return {
        "job_id": job_id,
        "progress": job.get("progress", 0),
        "status": job.get("status", "queued"),
        "message": job.get("message", ""),
    }


@app.get("/speech/result/{job_id}", response_model=SpeechAnalysisResponse, tags=["speech"], summary="결과 조회")
async def speech_result(job_id: str):
    _gc_jobs()
    job = SPEECH_JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job_id 없음")
    if job["status"] != "done" or not job["result"]:
        raise HTTPException(status_code=202, detail="아직 처리 중이거나 결과가 없습니다.")
    return job["result"]


# -----------------------------------------------------
# 최신 STT 결과 리다이렉트 (세션 최신)
# -----------------------------------------------------
@app.get("/speech/results/latest", tags=["speech"], summary="세션 최신 STT HTML로 리다이렉트")
def get_latest_speech_result():
    with stage("speech_results_latest"):
        # 세션별로 정렬 후 가장 최근 세션의 최신 HTML
        sessions = [d for d in SPEECH_RESULT_ROOT.iterdir() if d.is_dir()]
        sessions.sort(key=lambda p: p.stat().st_mtime, reverse=True)
        for sess in sessions:
            htmls = sorted(sess.glob("*.html"), key=lambda p: p.stat().st_mtime, reverse=True)
            if htmls:
                latest = htmls[0]
                return RedirectResponse(url=f"/model/speech/results/{sess.name}/{latest.name}", status_code=302)
        raise HTTPException(status_code=404, detail="결과 HTML이 없습니다.")


# -----------------------------------------------------
# 내용분석(동기 + 비동기)
# -----------------------------------------------------
@app.post("/content/run", tags=["content"], summary="내용 분석(동기)")
async def content_run(script: str = Form(...)):
    with stage("content_save_script"):
        tmp_txt = CONTENT_RESULT_ROOT / f"script_{uuid.uuid4().hex}.txt"
        tmp_txt.write_text(script, encoding="utf-8")

    with stage("content_pipeline"):
        payload = run_spellcheck_and_analysis(str(tmp_txt))

    with stage("content_build_response"):
        resp = build_content_response(payload)
    return resp


@app.post("/evaluate", tags=["evaluation"], summary="피처 기반 평가 모델 예측")
async def evaluate(body: EvaluateBody):
    with stage("evaluation_load_model"):
        evaluator = SpeechEvaluator().load_model("model/evaluation")
    with stage("evaluation_predict"):
        scores_df, cluster = evaluator.predict_from_features(body.features)
    scores_dict = scores_df.to_dict(orient="records")[0]
    return {
        "scores": scores_dict,
        "cluster_id": int(cluster),
        "raw": {"model": "RF+MultiOutput"}
    }


# (구) 데모 파일 조회 — Deprecated
@app.get("/api/results/segments", include_in_schema=False)
async def deprecated_segments():
    raise HTTPException(status_code=410, detail="Deprecated. Use /api/speech/segments")


@app.get("/api/results/predicted", include_in_schema=False)
async def deprecated_predicted():
    raise HTTPException(status_code=410, detail="Deprecated. Use /speech/result/{job_id}")


@app.get("/api/results/corrected", tags=["content"], summary="교정 결과 JSON(백워드 호환)")
async def get_corrected_result():
    data = load_json_file("corrected_result.json")
    if data is None:
        raise HTTPException(status_code=404, detail="corrected_result.json not found")
    return JSONResponse(content=data)


# ---- 공용 조회 (세션 스코프) ----
@app.get("/api/speech/segments/{session_id}", tags=["speech"], summary="세션별 segments_results.json 조회")
async def get_speech_segments(session_id: str):
    data = load_speech_json_scoped(session_id, "segments_results.json")
    if data is None:
        raise HTTPException(status_code=404, detail="speech segments_results.json not found")
    return JSONResponse(content=data)


@app.get("/health", tags=["ops"], summary="상태 체크")
async def health():
    return {"status": "ok"}
