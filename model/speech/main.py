# 실행
import time
from core.speech_analysis import analyze_speech
from core.stt_pronunciation import load_whisper_model

if __name__ == "__main__":
    total_start = time.time()  # ⏱ 전체 시작 시간 기록

    audio_path = "data/pitch_sample.m4a"
    script_path = "data/pitch_sample_script.txt"

    model = load_whisper_model("small") 

    analyze_speech(audio_path, script_path, model)

    total_end = time.time()  # ⏱ 전체 종료 시간 기록
    print(f"\n⏱ 총 실행 시간        : {total_end - total_start:.2f}초")