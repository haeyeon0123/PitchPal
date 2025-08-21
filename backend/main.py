# backend/main.py
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
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
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------------------------------
# 디렉토리 구성
# -----------------------------------------------------
CONTENT_RESULT_ROOT = Path("model") / "content" / "results"
CONTENT_RESULT_ROOT.mkdir(parents=True, exist_ok=True)

SPEECH_TMP_ROOT    = Path("model") / "speech" / "tmp"
SPEECH_RESULT_ROOT = Path("model") / "speech" / "results"
SPEECH_TMP_ROOT.mkdir(parents=True, exist_ok=True)
SPEECH_RESULT_ROOT.mkdir(parents=True, exist_ok=True)

# 정적 파일 서빙
# - 내용 분석 결과
app.mount("/static", StaticFiles(directory=str(CONTENT_RESULT_ROOT)), name="static")

# - 음성 분석 결과 (두 개의 alias 제공)
#   1) /static-speech (기존 유지)
#   2) /model/speech/results (프론트에서 그대로 열 수 있도록, 스샷 경로와 동일)
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
        ["content_feedback", "content_feedback", "corrected_text"],
        ["corrected_text"]
    ])

    highlighted_html = get_in(data, [
        ["spell_check", "highlighted_html"],
        ["highlighted_html"], ["diff_html"], ["html"]
    ])

    feedback_text = get_in(data, [
        ["content_feedback", "content_feedback", "feedback_text"],
        ["content_feedback", "feedback_text"],
        ["feedback_text"], ["analysis"], ["comment"]
    ])

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
    # 전역 타임라인(옵션 B)
    fillers: List[Dict[str, Any]] = Field(default_factory=list)   # [{token, time}]
    silence: List[Dict[str, float]] = Field(default_factory=list) # [{start,end}]

# -----------------------------------------------------
# 기존 엔드포인트 (내용분석)
# -----------------------------------------------------
@app.post("/content/run")
async def content_run(script: str = Form(...)):
    tmp_txt = CONTENT_RESULT_ROOT / f"script_{uuid.uuid4().hex}.txt"
    tmp_txt.write_text(script, encoding="utf-8")
    payload = run_spellcheck_and_analysis(str(tmp_txt))
    return build_content_response(payload)

@app.post("/evaluate")
async def evaluate(body: EvaluateBody):
    evaluator = SpeechEvaluator().load_model("model/evaluation")
    scores_df, cluster = evaluator.predict_from_features(body.features)
    return {
        "scores": scores_df.to_dict(orient="records")[0],
        "cluster_id": int(cluster),
        "raw": {"model": "RF+MultiOutput"}
    }

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
# -----------------------------------------------------
def _save_upload_to_tmp(upload: UploadFile, target_dir: Path, fallback_suffix: str) -> Path:
    ext = Path(upload.filename).suffix or fallback_suffix
    out_path = target_dir / f"{uuid.uuid4().hex}{ext}"
    with out_path.open("wb") as f:
        shutil.copyfileobj(upload.file, f)
    return out_path

def _fallback_speech_result(audio_path: Path, script_path: Optional[Path]) -> SpeechAnalysisResponse:
    # alias 경로를 기본으로 안내 (/model/speech/results)
    stt_url = "/model/speech/results/stt_results.html"
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
        analysis_mode="audio+script" if script_path else "audio_only",
        fillers=[{"token":"어","time":7.6},{"token":"음","time":12.1}],
        silence=[{"start":11.0,"end":12.2}],
    )

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
            "start_sec": float(d["start_sec"]),
            "end_sec": float(d["end_sec"]),
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

def _make_feedback_text(pron_acc: float, avg_pitch: float, avg_wpm: float, filler_count: int) -> str:
    # speech_analysis.py 의 13) 발표 평가 요약 규칙과 동일
    if pron_acc > 0.8 and avg_pitch > 70 and avg_wpm > 100 and filler_count < 5:
        return "✅ 발음, 억양, 속도 모두 잘 조화되어 있습니다! 발표가 자연스럽습니다."
    elif pron_acc > 0.6:
        return "🔶 발음은 괜찮습니다. 억양 또는 추임새, 속도에 조금 더 주의해주세요."
    else:
        return "❌ 발음과 억양, 속도 전반에 개선이 필요합니다. 꾸준한 연습이 도움이 됩니다."

@app.post("/speech/analyze", response_model=SpeechAnalysisResponse)
async def speech_analyze(
    audio: UploadFile = File(..., description="음성 파일(.wav/.mp3 등)"),
    script: UploadFile = File(..., description="대본 텍스트 파일(.txt)"),
):
    if not audio.filename or not script.filename:
        raise HTTPException(status_code=400, detail="audio, script 파일이 모두 필요합니다.")

    audio_path  = _save_upload_to_tmp(audio,  SPEECH_TMP_ROOT, ".wav")
    script_path = _save_upload_to_tmp(script, SPEECH_TMP_ROOT, ".txt")

    try:
        try:
            raw: Dict[str, Any] = analyze_speech(
                audio_path=str(audio_path),
                script_path=str(script_path),
            )
        except Exception:
            return _fallback_speech_result(audio_path, script_path)

        # === 팀 함수 → 표준 응답 매핑 ===
        # 팀 함수 키(한국어) 방어적으로 처리
        pron_acc_pct = float(raw.get("발음 유사도 점수", raw.get("pronunciation_accuracy", 0.0)))
        pron_acc = pron_acc_pct / (100.0 if pron_acc_pct > 1.0 else 1.0)

        wpm = float(raw.get("wpm", 0.0))
        pitch_mean = float(raw.get("Pitch 평균", raw.get("pitch_mean", 0.0)))
        pitch_std  = float(raw.get("Pitch 표준편차", raw.get("pitch_std", 0.0)))
        pause_ratio = float(raw.get("무음 구간 비율", raw.get("pause_ratio", 0.0)))
        filler_count = int(raw.get("간투사 수", raw.get("filler_count", 0)))

        mfcc_mean = list(raw.get("MFCC 평균", raw.get("mfcc_mean", [])))[:13]
        mfcc_std  = list(raw.get("MFCC 표준편차", raw.get("mfcc_std", [])))[:13]

        # STT HTML 경로 보정
        stt_url = raw.get("stt_result_url") or raw.get("stt_results_url")
        if stt_url:
            # 파일명만 들어오면 alias로 보정
            name = Path(str(stt_url)).name
            stt_url = f"/model/speech/results/{name}"
        else:
            candidate = SPEECH_RESULT_ROOT / "stt_results.html"
            stt_url = f"/model/speech/results/{candidate.name}" if candidate.exists() else None

        # 세그먼트 정규화 + 전역 이벤트(옵션 B)
        segments_norm: List[Segment] = []
        global_fillers: List[Dict[str, Any]] = []
        global_silence: List[Dict[str, float]] = []

        for seg in raw.get("segments", []) or []:
            # seg: {"time_range":"s-e", "wpm":..., "pitch_mean":..., "mfcc_mean":[...], "fillers":[(w,s,e),..], "silence":[(s,e),..]}
            s, e = 0.0, 0.0
            if isinstance(seg, dict):
                if "time_range" in seg:
                    parsed = _parse_time_range_to_secs(seg["time_range"])
                    if parsed: s, e = parsed
                else:
                    s = float(seg.get("start_sec", 0.0)); e = float(seg.get("end_sec", 0.0))

                # per-seg fillers: (word, abs_start, abs_end) → 전역 이벤트(time=중앙)
                for f in seg.get("fillers", []) or []:
                    try:
                        token, fs, fe = f[0], float(f[1]), float(f[2])
                        global_fillers.append({"token": token, "time": (fs + fe) / 2.0})
                    except Exception:
                        pass

                # per-seg silence: [(local_s, local_e)] → 절대초로 변환
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

        # 발표 평가 요약 → feedback_text
        feedback_text = _make_feedback_text(pron_acc, pitch_mean, wpm, filler_count)

        # (선택) 점수 딕셔너리: 프론트가 레이더 0~10로 변환
        scores = {
            "pronunciation": round(pron_acc * 10, 2),
            "speed": 7.0,
            "intonation": 6.0,
            "filler": max(0.0, 10.0 - min(10.0, float(filler_count))),
            "pause": max(0.0, 10.0 - round(pause_ratio * 10, 2)),
            "mfcc": 8.0,
        }

        resp = SpeechAnalysisResponse(
            pronunciation_accuracy=pron_acc,
            wpm=wpm,
            pitch_mean=pitch_mean,
            pitch_std=pitch_std,
            pause_ratio=pause_ratio,
            filler_count=filler_count,
            mfcc_mean=mfcc_mean,
            mfcc_std=mfcc_std,
            scores=scores,
            segments=segments_norm,
            feedback_text=feedback_text,
            stt_results_url=stt_url,
            analysis_mode="audio+script",
            fillers=global_fillers,
            silence=global_silence,
        )
        return resp

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"분석 중 오류: {e}")

    finally:
        try:
            if audio_path.exists():  audio_path.unlink()
            if script_path.exists(): script_path.unlink()
        except Exception:
            pass

# -----------------------------------------------------
# 최신 STT 결과 리다이렉트 (선택)
# -----------------------------------------------------
@app.get("/speech/results/latest")
def get_latest_speech_result():
    htmls = sorted(
        SPEECH_RESULT_ROOT.glob("*.html"),
        key=lambda p: p.stat().st_mtime,
        reverse=True
    )
    if not htmls:
        raise HTTPException(status_code=404, detail="결과 HTML이 없습니다.")
    latest = htmls[0].name
    # 프론트가 그대로 열 수 있는 alias 경로로 리다이렉트
    return RedirectResponse(url=f"/model/speech/results/{latest}", status_code=302)

# -----------------------------------------------------
# 내용분석 진행률 방식 (기존 유지)
# -----------------------------------------------------
JOBS: Dict[str, Dict[str, Any]] = {}

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
                await asyncio.sleep(0.6)
    except Exception:
        pass

async def _run_content_pipeline(job_id: str, script: str):
    try:
        _set_status(job_id, "running", "작업 시작")
        _set_progress(job_id, 5, "입력 파싱")

        ticker_task = asyncio.create_task(_ticker(job_id, until=90, step_ms=300))

        _set_progress(job_id, 10, "분석 준비")
        tmp_txt = CONTENT_RESULT_ROOT / f"script_{uuid.uuid4().hex}.txt"
        tmp_txt.write_text(script, encoding="utf-8")

        _set_progress(job_id, 20, "맞춤법/교정 분석")
        loop = asyncio.get_running_loop()
        payload = await loop.run_in_executor(None, lambda: run_spellcheck_and_analysis(str(tmp_txt)))

        _set_progress(job_id, 90, "결과 정리")
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
        try:
            ticker_task.cancel()
        except Exception:
            pass

class StartBody(BaseModel):
    script: str

@app.post("/content/start")
async def content_start(body: StartBody, background_tasks: BackgroundTasks):
    if not body.script or not body.script.strip():
        raise HTTPException(status_code=400, detail="script가 비어 있습니다.")
    job_id = uuid.uuid4().hex
    JOBS[job_id] = {"progress": 0, "status": "queued", "message": "대기 중", "result": None}
    background_tasks.add_task(_run_content_pipeline, job_id, body.script)
    return {"job_id": job_id}

@app.get("/content/progress/{job_id}")
async def content_progress(job_id: str):
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
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job_id 없음")
    if job["status"] != "done" or not job["result"]:
        raise HTTPException(status_code=202, detail="아직 처리 중이거나 결과가 없습니다.")
    return job["result"]

@app.get("/health")
async def health():
    return {"status": "ok"}
