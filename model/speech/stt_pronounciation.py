from faster_whisper import WhisperModel
import difflib
import string

# 모델 로드
model = WhisperModel("medium", device="cpu", compute_type="int8")

# 정제 함수: 문장부호 + 공백 제거
def clean_text(text):
    return text.translate(str.maketrans("", "", string.punctuation + " ")).lower()

# 텍스트를 단어 리스트로 분할하고 각 단어의 정제된 형태도 같이 반환
def tokenize(text):
    words = text.split()
    cleaned_words = [clean_text(w) for w in words]
    return words, cleaned_words

# 정제된 텍스트 비교
def evaluate_pronunciation(text1, text2):
    return difflib.SequenceMatcher(None, clean_text(text1), clean_text(text2)).ratio()

# 차이 강조 출력
def highlight_differences(ref_text, stt_text):
    ref_words, ref_cleaned = tokenize(ref_text)
    stt_words, stt_cleaned = tokenize(stt_text)

    # 정제된 단어들을 이어 붙여 전체 비교용 텍스트 생성
    ref_joined = "".join(ref_cleaned)
    stt_joined = "".join(stt_cleaned)

    # difflib로 문자 단위 비교 수행
    sm = difflib.SequenceMatcher(None, ref_joined, stt_joined)
    opcodes = sm.get_opcodes()

    # 차이 위치를 기록할 index set 생성
    ref_diff_indices = set()
    stt_diff_indices = set()

    for tag, i1, i2, j1, j2 in opcodes:
        if tag != "equal":
            ref_diff_indices.update(range(i1, i2))
            stt_diff_indices.update(range(j1, j2))

    # 정제된 단어들의 문자 길이 누적
    def mark_diffs(words, cleaned_words, diff_indices):
        result = []
        idx_counter = 0
        for word, cleaned in zip(words, cleaned_words):
            word_len = len(cleaned)
            word_indices = set(range(idx_counter, idx_counter + word_len))
            if word_indices & diff_indices:
                # 차이가 있는 단어
                result.append(f"\033[91m{word}\033[0m")  # 빨간색
            else:
                result.append(word)
            idx_counter += word_len
        return result

    # 강조 적용
    ref_highlighted = mark_diffs(ref_words, ref_cleaned, ref_diff_indices)
    stt_highlighted = mark_diffs(stt_words, stt_cleaned, stt_diff_indices)

    print("\n[원문 텍스트 (차이 강조)]")
    print(" ".join(ref_highlighted))

    print("\n[STT 결과 텍스트 (차이 강조)]")
    print(" ".join(stt_highlighted))

# STT 수행
def transcribe_audio(audio_path):
    segments, _ = model.transcribe(audio_path)
    return " ".join([seg.text.strip() for seg in segments])
