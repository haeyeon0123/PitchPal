# backend/main.py
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles  # 정적 파일 서빙
from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional, Tuple
from pathlib import Path
import shutil, uuid, json, os

# 진행률/비동기용
import asyncio
import traceback

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
    allow_origins=["*"],     # 개발 단계에서는 * 허용, 필요시 프론트 도메인으로 제한
    allow_methods=["*"],
    allow_headers=["*"],
    # 필요 시: allow_credentials=True,
)

# -----------------------------------------------------
# 디렉토리 구성
# -----------------------------------------------------
# 내용분석 결과(HTML/JSON)
CONTENT_RESULT_ROOT = Path("model") / "content" / "results"
CONTENT_RESULT_ROOT.mkdir(parents=True, exist_ok=True)

# 음성분석: 임시/결과
SPEECH_TMP_ROOT    = Path("model") / "speech" / "tmp"
SPEECH_RESULT_ROOT = Path("model") / "speech" / "results"
SPEECH_TMP_ROOT.mkdir(parents=True, exist_ok=True)
SPEECH_RESULT_ROOT.mkdir(parents=True, exist_ok=True)

# 정적 파일 서빙 (프론트에서 바로 열람)
#   - 기존 호환: /static → content 결과
#   - 신규 음성 결과: /static-speech → speech 결과
app.mount("/static",        StaticFiles(directory=str(CONTENT_RESULT_ROOT)), name="static")
app.mount("/static-speech", StaticFiles(directory=str(SPEECH_RESULT_ROOT)),  name="static-speech")

# -----------------------------------------------------
# 공통 유틸
# -----------------------------------------------------
class EvaluateBody(BaseModel):
    features: Dict[str, Any]

def load_json_file(file_name: str) -> Optional[dict]:
    """결과 JSON 파일 읽기 (내용분석용 경로에서)"""
    p = CONTENT_RESULT_ROOT / file_name
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return None

def get_in(d: dict, paths: List[List[str]]) -> Optional[Any]:
    """
    중첩된 키를 안전하게 탐색.
    paths: [["a","b","c"], ["x","y"]] 처럼 여러 후보 경로 중 먼저 성공하는 값을 반환
    """
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
    """
    CONTENT_RESULT_ROOT 내 생성된 파일들을 읽어 응답 형태를 표준화.
    기존 /content/run 과 진행률 방식 결과 조회에서 공통 사용.
    """
    # 결과 JSON 후보들 중 첫 번째로 존재하는 파일 사용
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

    original_text = get_in(data, [
        ["spell_check", "original_text"],
        ["original_text"]
    ])

    corrected_text = get_in(data, [
        ["spell_check", "corrected_text"],
        ["content_feedback", "content_feedback", "corrected_text"],  # 일부 팀 구조
        ["corrected_text"]
    ])

    highlighted_html = get_in(data, [
        ["spell_check", "highlighted_html"],
        ["highlighted_html"], ["diff_html"], ["html"]
    ])

    feedback_text = get_in(data, [
        ["content_feedback", "content_feedback", "feedback_text"],  # 일부 팀 구조
        ["content_feedback", "feedback_text"],
        ["feedback_text"], ["analysis"], ["comment"]
    ])

    # HTML 파일 링크 (/static 마운트 기준)
    html_path = CONTENT_RESULT_ROOT / "corrected_result.html"
    if not html_path.exists():
        for alt in ["corrected.html", "result.html", "content_result.html"]:
            p = CONTENT_RESULT_ROOT / alt
            if p.exists():
                html_path = p
                break
    html_url = f"/static/{html_path.name}" if html_path.exists() else None

    return {
        "html_url": html_url,
        "original_text": original_text,
        "corrected_text": corrected_text,
        "highlighted_html": highlighted_html,
        "feedback_text": feedback_text,
        "meta": (payload or {}).get("meta", {}),
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

class SpeechAnalysisResponse(BaseModel):
    pronunciation_accuracy: float          # 0~1
    wpm: float
    pitch_mean: float
    pitch_std: float
    pause_ratio: float                     # 0~1
    filler_count: int
    mfcc_mean: List[float] = Field(default_factory=list)
    mfcc_std: List[float]  = Field(default_factory=list)
    scores: Dict[str, float] = Field(default_factory=dict)  # {"speed":7.5, "intonation":6.8, ...}
    segments: List[Segment]   = Field(default_factory=list) # 5초 단위 등
    feedback_text: str = ""
    stt_results_url: Optional[str] = None  # 프론트 "발음 분석 결과" 링크
    analysis_mode: str = "audio+script"    # or "audio_only"

# -----------------------------------------------------
# 기존 엔드포인트 (내용분석)
# -----------------------------------------------------
@app.post("/content/run")
async def content_run(script: str = Form(...)):
    """
    1) script 저장 → 2) 내부 분석 실행(HTML/JSON 파일 생성) → 3) 저장된 JSON을 읽어서 응답 구성
    """
    # 1) 요청 받은 script를 임시 파일로 저장
    tmp_txt = CONTENT_RESULT_ROOT / f"script_{uuid.uuid4().hex}.txt"
    tmp_txt.write_text(script, encoding="utf-8")

    # 2) 교정/분석 실행 (내부에서 corrected_result.html/json 등을 CONTENT_RESULT_ROOT에 저장)
    payload = run_spellcheck_and_analysis(str(tmp_txt))

    # 3) 결과 조립(파일 시스템에서 읽음)
    return build_content_response(payload)

# (참고) 기존 임시 음성 엔드포인트는 유지하지 않고 /speech/analyze로 표준화

@app.post("/evaluate")
async def evaluate(body: EvaluateBody):
    evaluator = SpeechEvaluator().load_model("model/evaluation")
    scores_df, cluster = evaluator.predict_from_features(body.features)
    return {
        "scores": scores_df.to_dict(orient="records")[0],
        "cluster_id": int(cluster),
        "raw": {"model": "RF+MultiOutput"}
    }

# -------- 결과 조회 엔드포인트(그대로) --------
@app.get("/api/results/segments")
async def get_segments_results():
    data = load_json_file("segments_results.json")
    if data is None:
        raise HTTPException(status_code=404, detail="segments_results.json not found")
    return JSONResponse(content=data)

@app.get("/api/results/predicted")
async def get_predicted_report():
    data = load_json_file("predicted_report.json")
    if data is None:
        raise HTTPException(status_code=404, detail="predicted_report.json not found")
    return JSONResponse(content=data)

@app.get("/api/results/corrected")
async def get_corrected_result():
    data = load_json_file("corrected_result.json")
    if data is None:
        raise HTTPException(status_code=404, detail="corrected_result.json not found")
    return JSONResponse(content=data)

# -----------------------------------------------------
# [NEW] 음성분석 표준 엔드포인트
#   - 프론트: FormData 키 이름을 audio, script 로 보냄
#   - 둘 다 업로드된 경우를 기본으로 (요구사항 반영)
#   - STT 결과 HTML은 /static-speech 경로로 열람
# -----------------------------------------------------
def _save_upload_to_tmp(upload: UploadFile, target_dir: Path, fallback_suffix: str) -> Path:
    ext = Path(upload.filename).suffix or fallback_suffix
    out_path = target_dir / f"{uuid.uuid4().hex}{ext}"
    with out_path.open("wb") as f:
        shutil.copyfileobj(upload.file, f)
    return out_path

def _fallback_speech_result(audio_path: Path, script_path: Optional[Path]) -> SpeechAnalysisResponse:
    """팀 함수 준비 전에도 프론트 개발 가능하도록 하는 더미 결과"""
    stt_url = "/static-speech/stt_results.html"  # 프론트에서 API_BASE + stt_url 로 열람
    return SpeechAnalysisResponse(
        pronunciation_accuracy=0.82,
        wpm=126.0,
        pitch_mean=185.2,
        pitch_std=22.7,
        pause_ratio=0.14,
        filler_count=6,
        mfcc_mean=[0.1]*13,
        mfcc_std=[0.05]*13,
        scores={"speed":7.5, "intonation":6.3, "pronunciation":8.1, "filler":6.5, "pause":7.0},
        segments=[
            Segment(start_sec=0, end_sec=5,  wpm=120, pitch_mean=180, pitch_std=20, has_filler=False, is_pause=False),
            Segment(start_sec=5, end_sec=10, wpm=132, pitch_mean=190, pitch_std=24, has_filler=True,  is_pause=False),
            Segment(start_sec=10, end_sec=15, wpm=126, pitch_mean=186, pitch_std=21, has_filler=False, is_pause=True),
        ],
        feedback_text="🔶 발음은 괜찮습니다. 억양/간투사/속도 밸런스를 조금만 더 다듬어보세요.",
        stt_results_url=stt_url,
        analysis_mode="audio+script" if script_path else "audio_only",
    )

# --- segments 유연 파싱 유틸 ---
def _parse_time_range_to_secs(tr: Any) -> Optional[Tuple[float, float]]:
    """
    '00:00-00:05' / '0-5' / [0,5] → (start, end) 초 단위로 변환
    """
    try:
        # 리스트/튜플 [s, e]
        if isinstance(tr, (list, tuple)) and len(tr) == 2:
            s, e = float(tr[0]), float(tr[1])
            return (min(s, e), max(s, e))
        # 문자열 "mm:ss-mm:ss" or "s-e"
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
    """
    다양한 입력 키를 표준 Segment로 강제 변환.
    - start_sec/end_sec 있으면 그대로 사용
    - 없고 time_range만 있으면 파싱
    - 실패하면 0~5초 기본값
    """
    if "start_sec" in d and "end_sec" in d:
        return Segment(**{
            "start_sec": float(d["start_sec"]),
            "end_sec": float(d["end_sec"]),
            "wpm": d.get("wpm"),
            "pitch_mean": d.get("pitch_mean"),
            "pitch_std": d.get("pitch_std"),
            "has_filler": d.get("has_filler"),
            "is_pause": d.get("is_pause"),
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
            })
    # 마지막 안전장치
    return Segment(start_sec=0.0, end_sec=5.0)

@app.post("/speech/analyze", response_model=SpeechAnalysisResponse)
async def speech_analyze(
    audio: UploadFile = File(..., description="음성 파일(.wav/.mp3 등)"),
    script: UploadFile = File(..., description="대본 텍스트 파일(.txt)"),
):
    if not audio.filename or not script.filename:
        raise HTTPException(status_code=400, detail="audio, script 파일이 모두 필요합니다.")

    # 1) 업로드 저장 (임시)
    audio_path  = _save_upload_to_tmp(audio,  SPEECH_TMP_ROOT, ".wav")
    script_path = _save_upload_to_tmp(script, SPEECH_TMP_ROOT, ".txt")

    try:
        # 2) 실제 팀 분석 함수 호출 → 표준 스키마로 매핑
        try:
            result: Dict[str, Any] = analyze_speech(
                audio_path=str(audio_path),
                script_path=str(script_path),
            )
            # STT 결과 HTML이 팀 코드에서 생성된다면, SPEECH_RESULT_ROOT 하위로 저장하도록 팀 코드 맞춰주세요.
        except Exception:
            # 팀 함수 호출이 어려우면 더미로 응답 (프론트 개발 연속성 보장)
            return _fallback_speech_result(audio_path, script_path)

        # 3) 표준 응답 변환(키 없으면 기본값)
        stt_url = result.get("stt_results_url")
        # 상대경로로 제공되지 않았다면 기본 경로로 보정
        if stt_url and not str(stt_url).startswith("/"):
            stt_url = f"/static-speech/{stt_url}"
        if not stt_url:
            # 기본 파일명 가정(팀 코드에서 해당 파일을 SPEECH_RESULT_ROOT에 생성하도록 맞춰주세요)
            candidate = SPEECH_RESULT_ROOT / "stt_results.html"
            stt_url = f"/static-speech/{candidate.name}" if candidate.exists() else None

        segments_raw = result.get("segments", [])
        segments_norm: List[Segment] = []
        for seg in segments_raw:
            if isinstance(seg, dict):
                segments_norm.append(_coerce_segment_dict(seg))
            else:
                segments_norm.append(Segment(start_sec=0.0, end_sec=5.0))

        resp = SpeechAnalysisResponse(
            pronunciation_accuracy=float(result.get("pronunciation_accuracy", 0.0)),
            wpm=float(result.get("wpm", 0.0)),
            pitch_mean=float(result.get("pitch_mean", 0.0)),
            pitch_std=float(result.get("pitch_std", 0.0)),
            pause_ratio=float(result.get("pause_ratio", 0.0)),
            filler_count=int(result.get("filler_count", 0)),
            mfcc_mean=list(result.get("mfcc_mean", []))[:13],
            mfcc_std=list(result.get("mfcc_std", []))[:13],
            scores=result.get("scores", {}),
            segments=segments_norm,
            feedback_text=result.get("feedback_text", ""),
            stt_results_url=stt_url,
            analysis_mode="audio+script",
        )
        return resp

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"분석 중 오류: {e}")

    finally:
        # 4) 임시파일 정리 (원하면 주석처리로 보존 가능)
        try:
            if audio_path.exists():  audio_path.unlink()
            if script_path.exists(): script_path.unlink()
        except Exception:
            pass

# -----------------------------------------------------
# [NEW] 내용분석 진행률 방식 (기존 코드 유지)
# -----------------------------------------------------
# 메모리 저장(데모). 운영에선 Redis 등 외부 스토리지 권장.
JOBS: Dict[str, Dict[str, Any]] = {}  # {job_id: {"progress": int, "status": str, "message": str, "result": Optional[dict]}}

def _set_progress(job_id: str, value: int, message: str = ""):
    job = JOBS.get(job_id)
    if not job:
        return
    job["progress"] = max(0, min(100, int(value)))
    if message:
        job["message"] = message

def _set_status(job_id: str, status: str, message: str = ""):
    job = JOBS.get(job_id)
    if not job:
        return
    job["status"] = status
    if message:
        job["message"] = message

async def _ticker(job_id: str, until: int = 90, step_ms: int = 300):
    """
    내부 분석 함수가 콜백을 지원하지 않아도 UX 상 진행률이 천천히 오르게 하는 보조 태스크.
    최종 완료 시 100%로 덮어쓰기 때문에 안전.
    """
    try:
        while True:
            await asyncio.sleep(step_ms / 1000)
            job = JOBS.get(job_id)
            if not job:
                return
            if job["status"] in ("done", "error"):
                return
            cur = int(job.get("progress", 0))
            if cur < until:
                _set_progress(job_id, cur + 1)
            else:
                # until 도달 시 속도 완만히 유지
                await asyncio.sleep(0.6)
    except Exception:
        pass

async def _run_content_pipeline(job_id: str, script: str):
    """
    실제 내용 분석 파이프라인(비동기).
    - 가능하면 run_spellcheck_and_analysis 내부 단계를 수정해 중간중간 _set_progress 호출하도록 개선하면 '진짜 진행률'이 됩니다.
    - 여기서는 파일 저장 → 분석 호출 → 결과 조립 흐름을 유지합니다.
    """
    try:
        _set_status(job_id, "running", "작업 시작")
        _set_progress(job_id, 5, "입력 파싱")

        # UX 보조: 천천히 오르는 진행률
        ticker_task = asyncio.create_task(_ticker(job_id, until=90, step_ms=300))

        # (기존 /content/run 과 동일하게) 텍스트를 임시 파일로 저장 후 함수 호출
        _set_progress(job_id, 10, "분석 준비")
        tmp_txt = CONTENT_RESULT_ROOT / f"script_{uuid.uuid4().hex}.txt"
        tmp_txt.write_text(script, encoding="utf-8")

        _set_progress(job_id, 20, "맞춤법/교정 분석")
        # 동기 함수 → 스레드 풀에서 실행
        loop = asyncio.get_running_loop()
        payload = await loop.run_in_executor(None, lambda: run_spellcheck_and_analysis(str(tmp_txt)))

        _set_progress(job_id, 90, "결과 정리")
        # 파일 시스템에서 결과를 조립하여 result 구성
        result = build_content_response(payload)
        JOBS[job_id]["result"] = result

        _set_progress(job_id, 100, "완료")
        _set_status(job_id, "done", "완료")
    except Exception as e:
        traceback.print_exc()
        _set_status(job_id, "error", f"에러: {e}")
        _set_progress(job_id, 100)
        JOBS[job_id]["result"] = None
    finally:
        # 보조 ticker 종료
        try:
            ticker_task.cancel()
        except Exception:
            pass

class StartBody(BaseModel):
    script: str

@app.post("/content/start")
async def content_start(body: StartBody, background_tasks: BackgroundTasks):
    """
    (1) 진행률 방식 시작점: job_id 발급 후 백그라운드에서 파이프라인 실행
    """
    if not body.script or not body.script.strip():
        raise HTTPException(status_code=400, detail="script가 비어 있습니다.")
    job_id = uuid.uuid4().hex
    JOBS[job_id] = {"progress": 0, "status": "queued", "message": "대기 중", "result": None}
    background_tasks.add_task(_run_content_pipeline, job_id, body.script)
    return {"job_id": job_id}

@app.get("/content/progress/{job_id}")
async def content_progress(job_id: str):
    """
    (2) 진행률 조회: {progress, status, message}
        status: queued | running | done | error
    """
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job_id 없음")
    return {
        "job_id": job_id,
        "progress": job.get("progress", 0),
        "status": job.get("status", "queued"),
        "message": job.get("message", ""),
    }

@app.get("/content/result/{job_id}")
async def content_result(job_id: str):
    """
    (3) 최종 결과 조회: 완료 시 표준 응답(dict) 반환
    """
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job_id 없음")
    if job["status"] != "done" or not job["result"]:
        # 202: 아직 처리 중
        raise HTTPException(status_code=202, detail="아직 처리 중이거나 결과가 없습니다.")
    return job["result"]

# (옵션) 헬스체크
@app.get("/health")
async def health():
    return {"status": "ok"}
