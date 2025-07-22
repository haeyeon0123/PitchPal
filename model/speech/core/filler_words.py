from model.speech.utils.text_utils import preprocess_word_for_comparison

# 추임새(간투사) 단어 감지
def detect_filler_words(segments, min_duration=0.4):
    fillers=["음", "어", "그", "저", "이", "아", "흠", "으음", "어어"]
    filler_count = 0
    filler_occurrences = []
    
    for segment in segments:
        for word_info in segment.words:
            word = preprocess_word_for_comparison(word_info.word)
            duration = word_info.end - word_info.start
            # 일정 시간 이상 지속된 간투사만 감지
            if word in fillers and duration >= min_duration:
                filler_count += 1
                filler_occurrences.append((word, word_info.start, word_info.end))
    
    return filler_count, filler_occurrences