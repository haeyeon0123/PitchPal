import re

def preprocess_word_for_comparison(word):
    word = word.lower()
    return re.sub(r'[^\w가-힣]', '', word).strip()

def is_filler_word(word_info, fillers, min_duration=0.3, max_word_len=2):
    norm_word = preprocess_word_for_comparison(word_info.word)
    duration = word_info.end - word_info.start

    return (
        norm_word in fillers and
        len(norm_word) <= max_word_len and
        duration >= min_duration
    )

# segment.words 기반 감지
def detect_filler_words(segments, fillers, min_duration=1):
    count = 0
    occurrences = []

    for segment in segments:
        for word_info in getattr(segment, "words", []):
            if is_filler_word(word_info, fillers, min_duration):
                norm_word = preprocess_word_for_comparison(word_info.word)
                occurrences.append((norm_word, word_info.start, word_info.end))
                count += 1
    return count, occurrences

def detect_fillers_from_text(text, fillers):
    count = 0
    occurrences = []

    # word boundary를 고려한 정규식
    pattern = r'\b(' + '|'.join([re.escape(f) for f in fillers]) + r')\b'
    matches = re.finditer(pattern, text)

    for match in matches:
        word = match.group()
        occurrences.append((word, match.start(), match.end()))
        count += 1

    return count, occurrences

# 완성형: segment.words 실패 시 text fallback
def detect_filler_words_safe(segments, stt_text, fillers=None, min_duration=0.3):
    if fillers is None:
        fillers = ["음", "어", "그", "저", "이", "아", "흠", "으음", "어어"]

    count, occurrences = detect_filler_words(segments, fillers, min_duration)
    if count > 0:
        return count, occurrences

    print("⚠️ 단어 기반 간투사 감지 실패 → 텍스트 기반 보완 감지 실행")
    return detect_fillers_from_text(stt_text, fillers)
