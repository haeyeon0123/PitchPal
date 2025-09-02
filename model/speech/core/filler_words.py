import re

# ===== 기본 설정 =====
FILLER_STEMS = {"음", "어", "흠", "으음", "어어", "에", "뭐", "그"}  # 일반적 간투사 어간
DETERMINER_CANDIDATES = {"이", "그", "저"}  # 관형사/대명사로도 쓰이는 문제 단어

MIN_FILLER_DURATION = 0.30  # seconds
ELONGATED_MIN_DURATION = 0.35  # 이/그/저가 간투사라면 이 정도는 늘어짐
MAX_FILLER_LENGTH = 3

# 타이밍 기준(초)
NEAR_NEXT_WORD_GAP = 0.12   # 다음 단어가 바로 이어지면 관형사 가능성↑
NEAR_PREV_WORD_GAP = 0.15   # 앞뒤 짧은 멈춤이 있으면 간투사 가능성↑
NEAR_NEXT_SILENCE_GAP = 0.15

# 전처리
def preprocess_word(word: str) -> str:
    return re.sub(r"[^\w가-힣]", "", word.lower()).strip()

def _is_korean_token(s: str) -> bool:
    return bool(re.search(r"[가-힣]", s))

def _is_elongated_form(s: str) -> bool:
    # '이', '그', '저'의 연타/늘임 (예: "이이", "저어", "그으")
    return bool(re.fullmatch(r"(이+|그+|저+)", s))

def _gap(a_end: float, b_start: float) -> float:
    return max(0.0, b_start - a_end)

def _is_determiner_usage(idx: int, words) -> bool:
    """[이|그|저] 다음 단어가 곧바로(<=0.12s) 붙고, 두 글자 이상 한국어면 관형사로 간주."""
    cur = words[idx]
    cur_text = preprocess_word(cur.word)
    if cur_text not in DETERMINER_CANDIDATES:
        return False
    if idx + 1 >= len(words):
        return False
    nxt = words[idx + 1]
    nxt_text = preprocess_word(nxt.word)
    # 다음 단어가 바로 이어지고(간격 작음), 한국어이면서 2글자 이상이면 명사일 확률↑ → 관형사로 봄
    close = _gap(cur.end, nxt.start) <= NEAR_NEXT_WORD_GAP
    noun_like = _is_korean_token(nxt_text) and len(nxt_text) >= 2
    return close and noun_like

def _has_pause_context(idx: int, words) -> bool:
    """앞뒤에 약간의 멈춤이 있는지 확인 (간투사 특징)."""
    cur = words[idx]
    has_prev_pause = True
    has_next_pause = True
    if idx - 1 >= 0:
        prev = words[idx - 1]
        has_prev_pause = _gap(prev.end, cur.start) >= NEAR_PREV_WORD_GAP
    if idx + 1 < len(words):
        nxt = words[idx + 1]
        has_next_pause = _gap(cur.end, nxt.start) >= NEAR_NEXT_SILENCE_GAP
    return has_prev_pause and has_next_pause

def _is_contextual_filler(idx: int, words) -> bool:
    """문맥+타이밍 기반 간투사 판정."""
    cur = words[idx]
    w = preprocess_word(cur.word)
    dur = cur.end - cur.start

    # 1) 기본 간투사 어간
    if w in FILLER_STEMS and len(w) <= MAX_FILLER_LENGTH and dur >= MIN_FILLER_DURATION:
        return True

    # 2) 문제 단어(이/그/저) 특수 처리
    if w in DETERMINER_CANDIDATES:
        # 관형사/대명사 용법이면 제외
        if _is_determiner_usage(idx, words):
            return False

        # 늘임/반복 + 앞뒤 멈춤이 있어야 간투사로 인정
        elongated = (dur >= ELONGATED_MIN_DURATION) or _is_elongated_form(w)
        if elongated and _has_pause_context(idx, words):
            return True
        return False

    return False

# ===== 텍스트 기반 보완 =====
def detect_filler_from_text(text: str):
    """
    텍스트에서 간투사 후보를 찾되,
    - '이/그/저'는 문장 끝/쉼표/줄바꿈에 단독 등장하거나 반복(이이, 저어 등)일 때만 인정
    """
    count = 0
    occurrences = []

    # 토큰화(아주 단순)
    tokens = re.findall(r"[^\s]+", text)

    for i, token in enumerate(tokens):
        t = preprocess_word(token)
        if not t:
            continue

        # 일반 간투사
        if t in FILLER_STEMS and len(t) <= MAX_FILLER_LENGTH:
            count += 1
            occurrences.append((t, None, None))
            continue

        # 문제 단어 특수 처리
        if t in DETERMINER_CANDIDATES:
            prev_tok = tokens[i - 1] if i - 1 >= 0 else ""
            next_tok = tokens[i + 1] if i + 1 < len(tokens) else ""

            # (A) 반복/늘임 표기
            elongated_text = bool(re.fullmatch(r"(이+|그+|저+)[\.…,\?!]*", token))

            # (B) 단독-말줄임/문장부호/줄끝
            next_punct_or_end = (next_tok == "" or re.fullmatch(r"[\.…,\?!,]+", next_tok))

            # (C) 다음이 명사처럼 2글자 이상 한국어면 관형사로 간주 → 제외
            next_clean = preprocess_word(next_tok)
            next_noun_like = _is_korean_token(next_clean) and len(next_clean) >= 2

            if (elongated_text or next_punct_or_end) and not next_noun_like:
                count += 1
                occurrences.append((t, None, None))

    return count, occurrences

# ===== 메인: Whisper 세그먼트 기반 감지 =====
def detect_filler_words(segments, stt_text):
    """
    segments: Whisper의 segment 객체 리스트 (segment.words 사용)
    stt_text: 전체 STT 텍스트 (보완용)
    """
    count = 0
    occurrences = []

    for segment in segments:
        words = list(getattr(segment, "words", []) or [])
        for idx, _ in enumerate(words):
            if _is_contextual_filler(idx, words):
                w = preprocess_word(words[idx].word)
                occurrences.append((w, words[idx].start, words[idx].end))
                count += 1

    # 2차 보완: 아예 한 개도 못 잡았을 때만 텍스트 기반
    if count == 0 and stt_text:
        add_cnt, add_occ = detect_filler_from_text(stt_text)
        count += add_cnt
        occurrences.extend(add_occ)

    return count, occurrences
