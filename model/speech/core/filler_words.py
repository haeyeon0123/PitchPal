import whisper
import re

# 간투사 리스트
FILLER_WORDS = ["음", "어", "그", "저", "아", "흠", "으음", "어어"]
MIN_FILLER_DURATION = 0.4  # 간투사로 간주할 최소 지속 시간 (초)

def preprocess_word(word):
    """특수 문자 제거 및 소문자 처리"""
    return re.sub(r'[^\w가-힣]', '', word.lower()).strip()

def is_filler(word_info):
    word = preprocess_word(word_info.word)  # ✅ 객체 속성 접근
    duration = word_info.end - word_info.start
    return word in FILLER_WORDS and duration >= MIN_FILLER_DURATION

def detect_filler_words(segments, stt_text):
    filler_occurrences = []

    # 1차: Whisper word timestamps 기반 감지
    segments = list(segments)

    for segment in segments:
        for word_info in getattr(segment, "words", []):
            if is_filler(word_info):
                filler_occurrences.append({
                    "word": word_info.word,
                    "start": word_info.start,
                    "end": word_info.end,
                    "duration": round(word_info.end - word_info.start, 2)
                })

    filler_count = len(filler_occurrences)

    # 2차: 감지 실패 시 텍스트 기반 보완 감지
    if filler_count == 0:
        pattern = r'\b(음|어|그\.\.\.|저\.\.\.|아|흠|으음|어어|이\.\.\.)\b'
        matches = re.findall(pattern, stt_text)
        count = len(matches)
        occurrences = [(match, None, None) for match in matches]  # 시간 정보는 없음
        return count, occurrences
    
    return filler_count, filler_occurrences
