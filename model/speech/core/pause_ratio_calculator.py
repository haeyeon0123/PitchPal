# pause_ratio_calculator.py — librosa 기반으로 교체
import numpy as np
import librosa

def calculate_pause_ratio_from_waveform(y, sr, top_db=30.0, min_silence_dur=0.3):
    """
    librosa.effects.split은 유성(발화) 구간 indices를 반환.
    이를 반전해 무음 구간 비율을 계산.
    """
    non_silent = librosa.effects.split(y, top_db=top_db)
    if len(y) == 0:
        return 0.0

    # 유성 구간 총 길이
    voiced = 0
    for start, end in non_silent:
        # 너무 짧은 유성은 무시하고 싶다면 필터 가능
        voiced += (end - start)

    total = len(y)
    silent = total - voiced
    # "짧은 무음은 제외" 로직을 넣고 싶다면, non_silent를 기반으로 무음 세그를 복원해 길이 필터링
    # 다만 여기서는 간단히 전체 비율만 반환
    return float(silent / total)
