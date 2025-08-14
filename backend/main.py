from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Any
from pathlib import Path
import shutil, uuid

from model.content.core.spell_checker import run_spellcheck_and_analysis
from model.speech.core.speech_analysis import analyze_speech
from model.evaluation.evaluation_model import SpeechEvaluator

app = FastAPI(title="PitchPal API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"] ,
    allow_headers=["*"],
)

RESULT_ROOT = Path("model") / "content" / "results"
RESULT_ROOT.mkdir(parents=True, exist_ok=True)

class EvaluateBody(BaseModel):
    features: Dict[str, Any]

@app.post("/content/run")
async def content_run(script: str = Form(...)):
    # 기존 구현이 파일 경로를 받는다면 임시 파일에 저장한 후 호출
    tmp_txt = RESULT_ROOT / f"script_{uuid.uuid4().hex}.txt"
    tmp_txt.write_text(script, encoding="utf-8")
    payload = run_spellcheck_and_analysis(str(tmp_txt))  # 내부에서 HTML/JSON 저장
    # 평탄화
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
    # 업로드 저장
    audio_path = RESULT_ROOT / f"audio_{uuid.uuid4().hex}_{audio.filename}"
    with audio_path.open("wb") as f:
        shutil.copyfileobj(audio.file, f)
    # 분석 호출
    features = analyze_speech(str(audio_path), script, model=None)  # 내부에서 Whisper 로드 시 캐시 권장
    # 키 표준화
    if "wpm" in features:
        features["WPM (Words Per Minute)"] = float(features.pop("wpm"))
    return features

@app.post("/evaluate")
async def evaluate(body: EvaluateBody):
    evaluator = SpeechEvaluator().load_model("model/evaluation")
    # DataFrame 변환은 evaluator 내부 또는 헬퍼에서 수행한다고 가정
    scores_df, cluster = evaluator.predict_from_features(body.features)
    return {
        "scores": scores_df.to_dict(orient="records")[0],
        "cluster_id": int(cluster),
        "raw": {"model": "RF+MultiOutput"}
    }
