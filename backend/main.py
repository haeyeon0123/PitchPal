import os
import sys
import shutil
import tempfile
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware

print("🔍 sys.path[0]:", sys.path[0])
print("📁 current working dir:", os.getcwd())
print("📂 listing current dir:", os.listdir())

# ✅ 핵심: sys.path에 'PitchPal' 루트 디렉토리를 넣는다
current_file = os.path.abspath(__file__)  # backend/main.py
project_root = os.path.dirname(os.path.dirname(current_file))  # PitchPal/
sys.path.insert(0, project_root)

# ✅ 필요한 분석 함수 및 모델 불러오기
from model.speech.core.speech_analysis import analyze_speech
from model.speech.core.stt_pronunciation import load_whisper_model

# ✅ whisper 모델 미리 로드
model = load_whisper_model()

# 🚀 FastAPI 앱 생성
app = FastAPI()

# 🌐 CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 🎯 음성 + 대본 분석 API
@app.post("/analyze-speech")
async def evaluate_uploaded_speech(
    audio_file: UploadFile = File(...),
    script_file: UploadFile = File(...)
):
    print("📥 분석 요청 들어옴!")

    try:
        # 📁 업로드된 음성 파일 임시 저장
        import tempfile
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as tmp_audio:
            tmp_audio.write(await audio_file.read())  # ✅ await 사용 OK
            tmp_audio_path = tmp_audio.name
            print(f"✅ 오디오 저장 완료: {tmp_audio_path}")

        # 📄 대본 파일을 문자열로 읽음
        script_text = (await script_file.read()).decode("utf-8")  # ✅ await 사용 OK
        print("✅ 대본 텍스트 로드 완료")

        # 🧠 분석 실행
        result = analyze_speech(tmp_audio_path, script_text, model)
        print("✅ 분석 완료")

        return {
            "stats": {
                "speed": float(result["speed"]),
                "accuracy": float(result["accuracy"]),
                "fillerCount": result["fillerCount"],
                "pauseAvg": float(result["pauseAvg"])
            },
            "speedData": result["speedData"],
            "pitchAndVolumeData": result["pitchAndVolumeData"],
            "fillerData": result["fillerData"],
            "pauseData": result["pauseData"],
            "tips": result["tips"]
        }

    except Exception as e:
        print(f"❌ 백엔드 처리 중 오류 발생: {e}")
        raise e

