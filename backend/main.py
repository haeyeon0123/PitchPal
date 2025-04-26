import sys
import os
import fastapi

# 현재 파일(main.py)의 디렉토리 경로를 기준으로 상대 경로 설정
base_dir = os.path.dirname(os.path.abspath(__file__))  # backend 디렉토리 경로
model_dir = os.path.join(base_dir, '..', 'model')     # model 디렉토리 경로

# 모델 디렉토리를 sys.path에 추가
sys.path.insert(0, model_dir)

# 경로가 제대로 추가되었는지 출력
print("현재 sys.path:", sys.path)

# 이제 model 디렉토리에서 speech_analysis 모듈을 import 할 수 있음
try:
    from speech_analysis import evaluate  # model 디렉토리에서 import
except ImportError as e:
    print(f"모듈 임포트 실패: {e}")
    raise

app = FastAPI()

@app.post("/evaluate/")
async def evaluate_audio(file: UploadFile = File(...)):
    file_bytes = await file.read()
    file_io = BytesIO(file_bytes)
    result = evaluate(file_io)
    return result
