# backend/main.py
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi import BackgroundTasks  # [NEW]
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles  # 정적 파일 서빙
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
from pathlib import Path
import shutil, uuid, json, os

# [NEW] 진행률/비동기용
import asyncio
import traceback

from model.content.core.spell_checker import run_spellcheck_and_analysis
from model.speech.core.speech_analysis import analyze_speech
from model.evaluation.evaluation_model import SpeechEvaluator

app = FastAPI(title="PitchPal API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

RESULT_ROOT = Path("model") / "content" / "results"
RESULT_ROOT.mkdir(parents=True, exist_ok=True)

# 결과 디렉토리를 /static 으로 서빙 (HTML 바로 열기용)
app.mount("/static", StaticFiles(directory=str(RESULT_ROOT)), name="static")

class EvaluateBody(BaseModel):
    features: Dict[str, Any]

# ====================== 공통 유틸 ======================
def load_json_file(file_name: str) -> Optional[dict]:
    """결과 JSON 파일 읽기"""
    p = RESULT_ROOT / file_name
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
    RESULT_ROOT 내 생성된 파일들을 읽어 응답 형태를 표준화.
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
    html_path = RESULT_ROOT / "corrected_result.html"
    if not html_path.exists():
        for alt in ["corrected.html", "result.html", "content_result.html"]:
            p = RESULT_ROOT / alt
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

# ====================== 기존 엔드포인트 ======================
@app.post("/content/run")
async def content_run(script: str = Form(...)):
    """
    1) script 저장 → 2) 내부 분석 실행(HTML/JSON 파일 생성) → 3) 저장된 JSON을 읽어서 응답 구성
    """
    # 1) 요청 받은 script를 임시 파일로 저장
    tmp_txt = RESULT_ROOT / f"script_{uuid.uuid4().hex}.txt"
    tmp_txt.write_text(script, encoding="utf-8")

    # 2) 교정/분석 실행 (내부에서 corrected_result.html/json 등을 RESULT_ROOT에 저장)
    payload = run_spellcheck_and_analysis(str(tmp_txt))

    # 3) 결과 조립(파일 시스템에서 읽음)
    return build_content_response(payload)

@app.post("/analyze-voice")
async def analyze_voice(audio: UploadFile = File(...), script: str = Form("")):
    audio_path = RESULT_ROOT / f"audio_{uuid.uuid4().hex}_{audio.filename}"
    with audio_path.open("wb") as f:
        shutil.copyfileobj(audio.file, f)
    features = analyze_speech(str(audio_path), script, model=None)
    if "wpm" in features:
        features["WPM (Words Per Minute)"] = float(features.pop("wpm"))
    return features

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

# ====================== [NEW] 진행률 방식 추가 ======================
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
        tmp_txt = RESULT_ROOT / f"script_{uuid.uuid4().hex}.txt"
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
