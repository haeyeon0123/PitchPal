import os
import sys
import pandas as pd
import time
from core.speech_analysis import analyze_speech
from core.stt_pronunciation import load_whisper_model
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from evaluation.evaluation_model import SpeechEvaluator

if __name__ == "__main__":
    start = time.time()

    audio_path = "data/pitch_sample.m4a"
    script_path = "data/pitch_sample_script.txt"
    model = load_whisper_model("small")

    # 현재 실행 파일 기준 model/speech/result 경로 설정
    RESULT_DIR = os.path.join(os.path.dirname(__file__), "results")
    os.makedirs(RESULT_DIR, exist_ok=True)

    # Whisper 모델 로드
    model = load_whisper_model("small")

    # 음성 분석 (피처 추출)
    features = analyze_speech(audio_path, script_path, model)

    # 모델 입력 형식 변환
    input_df = pd.DataFrame([{
        "발음 유사도 점수": float(features["발음 유사도 점수"]) * 100,
        "MFCC 평균": features["MFCC 평균"][0],
        "MFCC 표준편차": features["MFCC 표준편차"][0],
        "Pitch 평균 (Hz)": features["Pitch 평균"],
        "Pitch 표준편차 (Hz)": features["Pitch 표준편차"],
        "WPM (Words Per Minute)": features["wpm"],
        "무음 구간 비율": features["무음 구간 비율"],
        "간투사 수": features["간투사 수"]
    }])

    # 학습된 평가 모델 로드 및 예측 수행
    evaluator = SpeechEvaluator()
    evaluator.load_model()
    predicted_df, cluster_id = evaluator.predict(input_df)

    # 예측 결과 출력
    print("\n📊 예측된 발표 평가 점수:")
    print(predicted_df.to_string(index=False))

    # 리포트 JSON 저장
    json_path = os.path.join(RESULT_DIR, "predicted_report.json")
    predicted_df.to_json(json_path, orient="records", force_ascii=False, indent=2)
    print(f"\n📁 결과가 {json_path} 로 저장되었습니다.")


    print(f"\n⏱ 총 실행 시간: {time.time() - start:.2f}초")
