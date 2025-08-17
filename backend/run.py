from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import os

app = FastAPI(title="PitchPal Backend")

# ==================== CORS 설정 ====================
origins = [
    "http://localhost:3000",  # React 개발 서버
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 필요에 따라 특정 origin만 허용
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==================== 업로드 폴더 ====================
UPLOAD_DIR = "uploaded_files"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# ==================== 엔드포인트 ====================
@app.post("/content/run")
async def run_content(script: UploadFile = File(...)):
    # 파일 저장
    file_location = os.path.join(UPLOAD_DIR, script.filename)
    with open(file_location, "wb") as f:
        content = await script.read()
        f.write(content)

    print(f"[INFO] 업로드된 파일명: {script.filename}")
    print(f"[INFO] 저장 경로: {file_location}")

@app.post("/analyze-voice")
async def upload_files(
    audio: UploadFile = File(...), 
    script: UploadFile = File(...)
):
    # 오디오 파일 저장
    audio_path = os.path.join(UPLOAD_DIR, audio.filename)
    with open(audio_path, "wb") as f:
        f.write(await audio.read())

    # 대본 파일 저장
    script_path = os.path.join(UPLOAD_DIR, script.filename)
    with open(script_path, "wb") as f:
        f.write(await script.read())

    print(f"[INFO] 업로드된 오디오 파일: {audio.filename}")
    print(f"[INFO] 저장 경로: {audio_path}")
    print(f"[INFO] 업로드된 대본 파일: {script.filename}")
    print(f"[INFO] 저장 경로: {script_path}")

    return {
        "message": "파일 업로드 성공",
        "audio_file": audio.filename,
        "script_file": script.filename
    }

# ==================== 실행 ====================
# 터미널에서: uvicorn backend.run:app --reload --port 8000
