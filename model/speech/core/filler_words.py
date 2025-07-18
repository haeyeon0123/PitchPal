from utils.text_utils import normalize_word

# 추임새(간투사) 단어 감지
def detect_filler_words(audio_path, model, fillers=["음", "어", "그", "저", "이", "아", "흠", "으음", "어어"], min_duration=0.4):
    segments, _ = model.transcribe(audio_path, word_timestamps=True)
    filler_count = 0
    filler_occurrences = []

    for segment in segments:
        for word_info in segment.words:
            raw_word = word_info.word.lower()
            word = normalize_word(raw_word)

            start = word_info.start
            end = word_info.end
            duration = end - start
            # 일정 시간 이상 지속된 간투사만 감지
            if word in fillers and duration >= min_duration:
                filler_count += 1
                filler_occurrences.append((word, start, end))

    return filler_count, filler_occurrences