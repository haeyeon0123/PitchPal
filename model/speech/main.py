from core.speech_analysis import analyze_speech
from core.stt_pronunciation import load_whisper_model
import joblib
import time

if __name__ == "__main__":
    start = time.time()

    audio_path = "data/pitch_sample.m4a"
    script_path = "data/pitch_sample_script.txt"
    model = load_whisper_model("small")

    # 음성 피처 추출
    features = analyze_speech(audio_path, script_path, model)
    wpm = features["wpm"]
    pause_ratio = features["pause_ratio"]
    pron_score = features["pron_score"]

    # 모델 불러오기
    model_speed = joblib.load("model/evaluation/model_speed.pkl")
    model_pron = joblib.load("model/evaluation/model_pron.pkl")

    # 예측
    predicted_speed = model_speed.predict([[wpm, pause_ratio]])[0]
    predicted_pron = model_pron.predict([[pron_score]])[0]

    # 출력
    print(f"\n✅ 예측된 발화 속도     : {predicted_speed:.2f}")
    print(f"✅ 예측된 발음 정확도   : {predicted_pron:.2f}")

    print(f"\n⏱ 총 실행 시간: {time.time() - start:.2f}초")
