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

# HTML로 차이 강조 결과 저장
def export_differences_to_html(reference_text, stt_text, output_path):

    ref_words, ref_cleaned = tokenize(reference_text)
    stt_words, stt_cleaned = tokenize(stt_text)

    ref_joined = "".join(ref_cleaned)
    stt_joined = "".join(stt_cleaned)

    sm = difflib.SequenceMatcher(None, ref_joined, stt_joined)
    opcodes = sm.get_opcodes()

    ref_diff_indices = set()
    stt_diff_indices = set()

    for tag, i1, i2, j1, j2 in opcodes:
        if tag != "equal":
            ref_diff_indices.update(range(i1, i2))
            stt_diff_indices.update(range(j1, j2))

    def mark_diffs_html(words, cleaned_words, diff_indices):
        result = []
        idx_counter = 0
        for word, cleaned in zip(words, cleaned_words):
            word_len = len(cleaned)
            word_indices = set(range(idx_counter, idx_counter + word_len))
            if word_indices & diff_indices:
                result.append(f'<span style="color:red; font-weight:bold;">{word}</span>')
            else:
                result.append(word)
            idx_counter += word_len
        return result

    ref_highlighted = mark_diffs_html(ref_words, ref_cleaned, ref_diff_indices)
    stt_highlighted = mark_diffs_html(stt_words, stt_cleaned, stt_diff_indices)

    # HTML 저장
    html_content = f"""
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Pronunciation Difference Highlight</title>
    </head>
    <body>
        <h2>Original Script (Reference)</h2>
        <p>{" ".join(ref_highlighted)}</p>
        <h2>STT Result</h2>
        <p>{" ".join(stt_highlighted)}</p>
        <p><i>Words in <span style="color:red;">red</span> are mismatched.</i></p>
    </body>
    </html>
    """

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html_content)

    print(f"✅ Differences exported to {output_path}")

# STT 수행
def transcribe_audio(audio_path):
    segments, _ = model.transcribe(audio_path)
    return " ".join([seg.text.strip() for seg in segments])