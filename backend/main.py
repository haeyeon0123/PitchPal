from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Dict, Any
from pathlib import Path
import shutil, uuid, json
import os

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

class EvaluateBody(BaseModel):
    features: Dict[str, Any]


# ---------------------- 기존 엔드포인트 ----------------------

@app.post("/content/run")
async def content_run(script: str = Form(...)):
    tmp_txt = RESULT_ROOT / f"script_{uuid.uuid4().hex}.txt"
    tmp_txt.write_text(script, encoding="utf-8")
    payload = run_spellcheck_and_analysis(str(tmp_txt))  # 내부에서 HTML/JSON 저장
    return {
        "html_url": payload.get("html_url"),
        "original_text": payload.get("original_text"),
        "corrected_text": payload.get("corrected_text"),
        "highlighted_html": payload.get("highlighted_html"),
        "feedback_text": payload.get("feedback_text"),
        "meta": payload.get("meta", {}),
    }


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


# ---------------------- 새로 추가된 JSON 결과 조회 엔드포인트 ----------------------

def load_json_file(file_name: str):
    """결과 JSON 파일 읽기"""
    file_path = RESULT_ROOT / file_name
    if not os.path.exists(file_path):
        return None
    with open(file_path, "r", encoding="utf-8") as f:
        return json.load(f)

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
