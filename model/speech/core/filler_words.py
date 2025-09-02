import re

# ===== 기본 설정 =====
FILLER_STEMS = {"음", "어", "흠", "으음", "어어", "에", "뭐", "그"}  # 일반 간투사 어간 + '그'(문맥필요)
DETERMINER_CANDIDATES = {"이", "그", "저"}  # 관형사/대명사 겸용 문제 단어

MIN_FILLER_DURATION = 0.30     # seconds
ELONGATED_MIN_DURATION = 0.35  # '이/그/저'가 간투사라면 이 정도는 늘어짐
MAX_FILLER_LENGTH = 3

# 타이밍 기준(초)
NEAR_NEXT_WORD_GAP = 0.25      # 관형사라도 이 정도 짧은 멈춤은 흔함 → 완화
NEAR_PREV_WORD_GAP = 0.15
NEAR_NEXT_SILENCE_GAP = 0.15

# 관형구 판단용: '조사' 목록(끝글자/끝음절로 확인)
JOSA_SUFFIXES = {
    "은","는","이","가","을","를","의","에","에게","께서","에서","으로","로","과","와",
    "도","만","까지","부터","처럼","보다","조차","마저","라도","뿐","마다","밖에"
}

def preprocess_word(word: str) -> str:
    return re.sub(r"[^\w가-힣]", "", word.lower()).strip()

def _is_korean_token(s: str) -> bool:
    return bool(re.search(r"[가-힣]", s))

def _is_elongated_form(s: str) -> bool:
    # '이/그/저' 반복/늘임 (예: "이이", "저어", "그으")
    return bool(re.fullmatch(r"(이+|그+|저+)", s))

def _gap(a_end: float, b_start: float) -> float:
    return max(0.0, b_start - a_end)

def _ends_with_josa(token: str) -> bool:
    # 토큰 끝이 조사로 끝나는지(예: "기능은", "사람을")
    t = preprocess_word(token)
    return any(t.endswith(j) for j in JOSA_SUFFIXES)

def _is_determiner_usage(idx: int, words) -> bool:
    """
    [이|그|저] 다음에 '명사구(+조사)'가 이어지는 관형사/대명사 용법 차단.
    - 다음 단어가 곧바로 붙으면(<=0.25s) 관형사 가능성 ↑
    - 또는 다음 1~3 토큰 안에 '조사로 끝나는 토큰'이 있으면 관형구로 간주
    """
    cur = words[idx]
    cur_text = preprocess_word(cur.word)
    if cur_text not in DETERMINER_CANDIDATES:
        return False

    # 1) 바로 다음 단어가 가깝고(<=0.25s) 한국어 2글자 이상 → 관형사 가능성 높음
    if idx + 1 < len(words):
        nxt = words[idx + 1]
        nxt_text = preprocess_word(nxt.word)
        close = _gap(cur.end, nxt.start) <= NEAR_NEXT_WORD_GAP
        noun_like = _is_korean_token(nxt_text) and len(nxt_text) >= 2
        if close and noun_like:
            return True

    # 2) 다음 1~3 토큰 안에 '조사로 끝나는 토큰'이 있으면
    #    "그 주요 기능은" 같은 구조를 관형구로 판정 → 간투사 제외
    lookahead = min(3, len(words) - (idx + 1))
    for k in range(1, lookahead + 1):
        t = preprocess_word(words[idx + k].word)
        if not t:
            continue
        if _ends_with_josa(t):
            return True

    return False

def _has_pause_context(idx: int, words) -> bool:
    """앞뒤에 약간의 멈춤이 있는지 확인(간투사 특징)."""
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
    cur = words[idx]
    w = preprocess_word(cur.word)
    dur = cur.end - cur.start

    # 1) 일반 간투사
    if w in FILLER_STEMS and len(w) <= MAX_FILLER_LENGTH and dur >= MIN_FILLER_DURATION:
        # 단, '그'는 아래 특수 처리로 재판정
        if w != "그":
            return True

    # 2) 이/그/저 특수 처리
    if w in DETERMINER_CANDIDATES:
        # (A) 관형구로 보이면 무조건 제외 (우선 차단)
        if _is_determiner_usage(idx, words):
            return False
        # (B) 늘임/반복 + 앞뒤 멈춤 + 다음 단어와의 간격이 '충분히 큼'(≥0.20s) → 간투사 인정
        elongated = (dur >= ELONGATED_MIN_DURATION) or _is_elongated_form(w)
        next_gap_ok = True
        if idx + 1 < len(words):
            next_gap_ok = _gap(cur.end, words[idx + 1].start) >= 0.20
        if elongated and next_gap_ok and _has_pause_context(idx, words):
            return True
        return False

    return False

# ===== 텍스트 기반 보완 =====
def detect_filler_from_text(text: str):
    """
    텍스트 보완 시에도 '그/이/저'는
    - 다음 1~3 토큰 안에 조사로 끝나는 토큰이 있으면 관형구로 보고 제외
    - 아니면, 단독+말줄임/문장부호 또는 반복/늘임일 때만 인정
    """
    count = 0
    occurrences = []
    tokens = re.findall(r"[^\s]+", text)

    for i, token in enumerate(tokens):
        t = preprocess_word(token)
        if not t:
            continue

        # 일반 간투사
        if t in (FILLER_STEMS - DETERMINER_CANDIDATES) and len(t) <= MAX_FILLER_LENGTH:
            count += 1
            occurrences.append((t, None, None))
            continue

        # 문제 단어
        if t in DETERMINER_CANDIDATES:
            # 관형구(조사 포함) 패턴이면 제외
            ahead = tokens[i+1:i+4]
            if any(_ends_with_josa(preprocess_word(a)) for a in ahead):
                continue

            elongated_text = bool(re.fullmatch(r"(이+|그+|저+)[\.…,\?!]*", token))
            # 단독+문장부호/줄끝
            nxt = tokens[i+1] if i+1 < len(tokens) else ""
            next_punct_or_end = (nxt == "" or re.fullmatch(r"[\.…,\?!]+", nxt))

            if elongated_text or next_punct_or_end:
                count += 1
                occurrences.append((t, None, None))

    return count, occurrences

# ===== 메인 =====
def detect_filler_words(segments, stt_text):
    total = 0
    occ = []

    for seg in segments:
        words = list(getattr(seg, "words", []) or [])
        for idx in range(len(words)):
            if _is_contextual_filler(idx, words):
                w = preprocess_word(words[idx].word)
                occ.append((w, words[idx].start, words[idx].end))
                total += 1

    if total == 0 and stt_text:
        c, o = detect_filler_from_text(stt_text)
        total += c
        occ.extend(o)

    return total, occ
