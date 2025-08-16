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
UPLOAD_DIR = "uploaded_scripts"
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

# ==================== 실행 ====================
# 터미널에서: uvicorn backend.run:app --reload --port 8000
