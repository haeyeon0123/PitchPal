from faster_whisper import WhisperModel
from utils.text_utils import tokenize, get_diff_indices

# whisper 모델 로드
def load_whisper_model(size="medium", device="cpu", compute_type="int8"):
    return WhisperModel(size, device=device, compute_type=compute_type)

"""# Word-level 정보 출력 함수(확인용)
def print_word_level_output(audio_path, model):
    # STT 수행 (word timestamps 활성화)
    segments, info = model.transcribe(audio_path, word_timestamps=True)
    print(f"Transcription Info: duration={info.duration:.2f}s\n")

    for i, segment in enumerate(segments):
        print(f"--- Segment {i+1} ---")
        print(f"[{segment.start:.2f} - {segment.end:.2f}]: {segment.text.strip()}")
        print("Words:")
        for word_info in segment.words:
            print(f"  - {word_info.word.strip()} ({word_info.start:.2f}s ~ {word_info.end:.2f}s)")
        print()"""

# STT 변환 수행 후 간투사 감지 함수 호출
def transcribe_audio(audio_path, model):
    try:
        segments, _ = model.transcribe(audio_path, word_timestamps=True)
        stt_text = " ".join([seg.text.strip() for seg in segments])
        return stt_text, segments
    except Exception as e:
        print(f"❌ STT 변환 실패: {e}")
        return "", []

# HTML로 차이 강조 결과 저장
def export_differences_to_html(reference_text, stt_text, output_path):
    ref_words, ref_cleaned = tokenize(reference_text)
    stt_words, stt_cleaned = tokenize(stt_text)
    ref_diff_indices, stt_diff_indices = get_diff_indices(reference_text, stt_text)

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

    html_content = f"""
    <html>
    <head><meta charset='UTF-8'><title>Pronunciation Difference</title></head>
    <body>
        <h2>Original Script</h2>
        <p>{' '.join(ref_highlighted)}</p>
        <h2>STT Result</h2>
        <p>{' '.join(stt_highlighted)}</p>
        <p><i>Words in <span style='color:red;'>red</span> are mismatched.</i></p>
    </body>
    </html>"""

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html_content)

    print(f"✅ Differences exported to {output_path}")