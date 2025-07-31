import whisper
import re

# 간투사 리스트
FILLER_WORDS = ["음", "어", "그", "저", "아", "흠", "으음", "어어"]
MIN_FILLER_DURATION = 0.3  # 간투사로 간주할 최소 지속 시간 (초)

# 특수 문자 제거 및 소문자 처리
def preprocess_word(word):
    return re.sub(r'[^\w가-힣]', '', word.lower()).strip()

def is_filler(word_info):
    word = preprocess_word(word_info['word'])
    duration = word_info['end'] - word_info['start']
    return word in FILLER_WORDS and duration >= MIN_FILLER_DURATION

def detect_filler_words(audio_path, model_size="small"):
    model = whisper.load_model(model_size)
    result = model.transcribe(audio_path, word_timestamps=True)

    if "segments" not in result:
        raise ValueError("Transcription result does not contain 'segments'.")

    filler_occurrences = []

    for segment in result["segments"]:
        for word_info in segment["words"]:
            if is_filler(word_info):
                filler_occurrences.append({
                    "word": word_info["word"],
                    "start": word_info["start"],
                    "end": word_info["end"],
                    "duration": round(word_info["end"] - word_info["start"], 2)
                })

    filler_count = len(filler_occurrences)
    return filler_count, filler_occurrences

# 예시 실행
if __name__ == "__main__":
    audio_path = "data/test1.m4a"  # 경로에 맞게 수정
    filler_count, fillers = detect_filler_words(audio_path)
    print(f"감지된 간투사 개수: {filler_count}")
    for f in fillers:
        print(f"👉 '{f['word']}' at {f['start']}s ~ {f['end']}s (⏱ {f['duration']}s)")