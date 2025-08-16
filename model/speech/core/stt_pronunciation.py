"""
stt_pronunciation.py (patched)
- Perf: cache Whisper model (load once, reuse)
- API: transcribe_audio(audio_path, model=None, word_timestamps=True) → (segments, stt_text)
- Fix: export_differences_to_html returns the saved path; default path aligned to frontend
"""
from __future__ import annotations

import os
from typing import Tuple, List
from faster_whisper import WhisperModel
from model.speech.utils.text_utils import tokenize, get_diff_indices

# -----------------------------
# Model caching
# -----------------------------
# whisper 모델 로드
_MODEL = None

def load_whisper_model(size: str = "small", device: str = "cpu", compute_type: str = "int8"):
    global _MODEL
    if _MODEL is None:
        _MODEL = WhisperModel(size, device=device, compute_type=compute_type)
    return _MODEL

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

# -----------------------------
# Transcription
# STT 변환 수행 후 간투사 감지 함수 호출
# -----------------------------
def transcribe_audio(audio_path: str, model: WhisperModel = None, **kwargs):
    model = model or load_whisper_model()

    # ensure word timestamps enabled by default
    if "word_timestamps" not in kwargs:
        kwargs["word_timestamps"] = True

    try:
        seg_iter, info = model.transcribe(audio_path, **kwargs)
        segments = [seg for seg in seg_iter]        # ✅ 제너레이터 → 리스트로 물질화 (다회 사용)
        stt_text = " ".join([(seg.text or "").strip() for seg in segments]).strip()
        return segments, stt_text
    except Exception as e:
        print(f"❌ STT 변환 실패: {e}")
        return "", []

# -----------------------------
# STT vs Script difference HTML
# HTML로 차이 강조 결과 저장
# -----------------------------
def export_differences_to_html(reference_text: str, stt_text: str, output_path: str = None) -> str:
    """
    Save an HTML diff that highlights mismatched tokens.
    Return the actual path saved.
    """
    if output_path is None:
        os.makedirs("model/speech/results", exist_ok=True)
        output_path = "model/speech/results/stt_results.html"

    # tokenize    
    ref_words, ref_cleaned = tokenize(reference_text)
    stt_words, stt_cleaned = tokenize(stt_text)

    # indices where chars differ (flattened over cleaned strings)
    ref_diff_indices, stt_diff_indices = get_diff_indices(reference_text, stt_text)
    
    # helper to wrap mismatched words in <span>
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

    html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Pronunciation Difference</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans KR", Arial, sans-serif; }}
  </style>
</head>
<body>
  <h2>Original Script</h2>
  <p>{ref_highlighted}</p>
  <h2>STT Result</h2>
  <p>{stt_highlighted}</p>
  <p><i>Words in <span style='color:red;'>red</span> are mismatched.</i></p>
</body>
</html>"""

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html_content)

    print(f"✅ Differences exported to {output_path}")
    
    # Return the actual file path
    return output_path