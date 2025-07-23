from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import shutil
import os
import uuid

from model.video.eye_blink_counter import run_blink_analysis
from model.video.head_direction_detector import run_headpose_analysis

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "temp_uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@app.post("/analyze-video")
async def analyze_video(file: UploadFile = File(...)):
    # 1. Save uploaded file to disk
    filename = f"{uuid.uuid4()}_{file.filename}"
    file_path = os.path.join(UPLOAD_DIR, filename)
    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # 2. Run head pose + blink analysis
    headpose_result = run_headpose_analysis(file_path)
    blink_result = run_blink_analysis(file_path)

    # 3. Compose response
    response = {
        "pitch_by_frame": headpose_result["pitch_by_frame"],
        "head_pose_ratios": headpose_result["head_pose_ratios"],
        "blink_summary": blink_result["summary"],
        "blink_timeline": blink_result["timeline"],
        "tips": []
    }

    # 4. Tips (safe access)
    if headpose_result["head_pose_ratios"].get("looking_down", 0) > 0.5:
        response["tips"].append("고개를 너무 자주 숙이지 않도록 해보세요.")
    if blink_result["summary"].get("눈 깜빡임 평가 등급") == "정상":
        response["tips"].append("눈 깜빡임 속도는 좋습니다.")

    # 5. Clean up file
    os.remove(file_path)

    return response
