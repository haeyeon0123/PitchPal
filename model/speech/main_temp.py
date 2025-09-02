from model.speech.core.stt_pronunciation import transcribe_audio, load_whisper_model
from model.speech.core.filler_words import detect_filler_words
from model.speech.core.speech_analysis import analyze_speech, save_segment_features_to_json
import time

if __name__ == "__main__":
    start = time.time()
    audio_path = "data/pitch_sample.m4a"
    script_path = "data/pitch_sample_script.txt"
    model = load_whisper_model("small")

    output_path = "model/speech/results/segments_results.json"

    features = analyze_speech(audio_path, script_path, model)
    save_segment_features_to_json(features["segments"], output_path)

    print(f"\n⏱ 총 실행 시간: {time.time() - start:.2f}초")

    """
    # STT 수행
    stt_text, segments = transcribe_audio(audio_path, model)

    filler_count, fillers = detect_filler_words(audio_path, stt_text, model)

    print(f"감지된 간투사 개수: {filler_count}")
    for f in fillers:
        print(f"👉 '{f['word']}' at {f['start']}s ~ {f['end']}s (⏱ {f['duration']}s)")
    
    print(f"\nstt 텍스트: {stt_text}")"""
