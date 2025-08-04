import re

# 기본 설정
FILLER_WORDS = ["음", "어", "그", "저", "아", "흠", "으음", "어어", "이", "에", "뭐"]
MIN_FILLER_DURATION = 0.3  # seconds
MAX_FILLER_LENGTH = 3      # 글자 수 제한 (긴 단어 방지)

# 전처리 함수
def preprocess_word(word):
    return re.sub(r"[^\w가-힣]", "", word.lower()).strip()

# Whisper word 객체 기반 필터링
def is_filler_word(word_info):
    word = preprocess_word(word_info.word)
    duration = word_info.end - word_info.start
    return word in FILLER_WORDS and len(word) <= MAX_FILLER_LENGTH and duration >= MIN_FILLER_DURATION

# 텍스트 기반 감지 (보완용)
def detect_filler_from_text(text):
    count = 0
    occurrences = []
    words = re.findall(r"\b[\w가-힣]+\b", text)
    for i, word in enumerate(words):
        cleaned = preprocess_word(word)
        if cleaned in FILLER_WORDS and len(cleaned) <= MAX_FILLER_LENGTH:
            count += 1
            occurrences.append((cleaned, None, None))  # 시간정보 없음
    return count, occurrences

# 메인 감지 함수
def detect_filler_words(segments, stt_text):
    count = 0
    occurrences = []

    # 1차: Whisper 단어 단위 감지
    for segment in segments:
        for word_info in getattr(segment, "words", []):
            if is_filler_word(word_info):
                word = preprocess_word(word_info.word)
                occurrences.append((word, word_info.start, word_info.end))
                count += 1

    # 2차: 감지 실패 시 텍스트 기반 보완
    if count == 0:
        count, occurrences = detect_filler_from_text(stt_text)

    return count, occurrences
