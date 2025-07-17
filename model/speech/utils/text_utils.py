import string
import difflib

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

# 두 텍스트를 비교하여 차이 추출
def get_diff_indices(text1, text2):
    _, cleaned1 = tokenize(text1)
    _, cleaned2 = tokenize(text2)
    joined1 = "".join(cleaned1)
    joined2 = "".join(cleaned2)
    sm = difflib.SequenceMatcher(None, joined1, joined2)
    ref_indices = set()
    stt_indices = set()
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag != "equal":
            ref_indices.update(range(i1, i2))
            stt_indices.update(range(j1, j2))
    return ref_indices, stt_indices