from core.speech_analysis import analyze_speech
from core.stt_pronunciation import load_whisper_model
import time

if __name__ == "__main__":
    start = time.time()

    audio_path = "data/filler_test3.m4a"
    script_path = "data/filler_test3.txt"
    model = load_whisper_model("small")

    # 음성 피처 추출
    features = analyze_speech(audio_path, script_path, model)

    print(f"\n⏱ 총 실행 시간: {time.time() - start:.2f}초")