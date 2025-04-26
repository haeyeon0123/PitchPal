import sys
import os
from fastapi import FastAPI, File, UploadFile

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# 현재 파일(main.py)의 디렉토리 경로를 기준으로 상대 경로 설정
base_dir = os.path.dirname(os.path.abspath(__file__))  # backend 디렉토리 경로
model_dir = os.path.join(base_dir, '..', 'model')     # model 디렉토리 경로

# 모델 디렉토리를 sys.path에 추가
sys.path.insert(0, model_dir)

from fastapi import FastAPI
from model.speech.speech_analysis import speech_evaluate  # 평가 함수 임포트

app = FastAPI()

@app.get("/speech_evaluate/")
async def evaluate_audio():
    # 'data/sample.wav' 파일을 사용하여 평가 수행
    result = speech_evaluate("data/sample.wav")  # 평가 함수 실행

    # 결과 반환 (여기선 평가 결과 텍스트로 반환)
    return {"evaluation_result": result}
