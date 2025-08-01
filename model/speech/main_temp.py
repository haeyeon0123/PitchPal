from core.stt_pronunciation import transcribe_audio, load_whisper_model
from core.filler_words import detect_filler_words

if __name__ == "__main__":
    audio_path = "data/test3.m4a"  # 경로에 맞게 수정

    model = load_whisper_model('small')

    # STT 수행
    stt_text, segments = transcribe_audio(audio_path, model)

    filler_count, fillers = detect_filler_words(audio_path, stt_text, model)

    print(f"감지된 간투사 개수: {filler_count}")
    for f in fillers:
        print(f"👉 '{f['word']}' at {f['start']}s ~ {f['end']}s (⏱ {f['duration']}s)")
    
    print(f"\nstt 텍스트: {stt_text}")
