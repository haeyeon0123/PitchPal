"""
speech_analysis.py (patched + serialize.py 적용)
- Fix 1: 전 세그먼트 평균 기반 MFCC/Pitch 표준편차 사용
- Fix 2: 세그먼트별 'fillers'와 'silence' 배열 포함
- Fix 3: STT-원고 비교 HTML 경로 'stt_result_url' 반환
- Perf : 모델 주입/재사용 허용(미전달 시 내부 캐시된 Whisper 사용)
- New  : utils.serialize(to_jsonable, dump_json) 사용으로 JSON 직렬화 통일
"""
from __future__ import annotations
from collections import Counter

import os
import librosa
import numpy as np

from model.speech.core.stt_pronunciation import (
    transcribe_audio,
    export_differences_to_html,
    load_whisper_model,
)

from model.speech.core.stt_pronunciation import transcribe_audio, export_differences_to_html, load_whisper_model
from model.speech.utils.text_utils import evaluate_pronunciation
from model.speech.core.filler_words import detect_filler_words  
from model.speech.core.pause_ratio_calculator import calculate_pause_ratio
from model.speech.utils.serialize import dump_json

# -----------------------------
# I/O helpers
# -----------------------------

# 음성 불러오기
def load_audio(audio_path):
    try:
        return librosa.load(audio_path, sr=16000)
    except Exception as e:
        print(f"❌ 음성 파일 로딩 실패: {e}")
        return None, None
    
def read_text(path: str) -> str:
    with open(path, "r", encoding="utf-8") as f:
        return f.read()

def save_segment_features_to_json(segment_features, output_path: str):
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    """세그먼트 피처를 공통 직렬화 유틸로 저장"""
    dump_json(segment_features, output_path, ensure_ascii=False, indent=2)
    print(f"✅ 구간별 피처가 JSON으로 저장되었습니다: {output_path}")

# -----------------------------
# Feature extraction helpers
# -----------------------------
# 오디오를 5초 단위로 자르기
def segment_audio(y: np.ndarray, sr: int, segment_duration: float = 5.0):
    """고정 길이(seg_dur)로 오디오 분할 → [(y_seg, start_sec, end_sec), ...]"""
    segs = []
    seg_len = int(segment_duration * sr)
    n = len(y)
    for start in range(0, n, seg_len):
        end = min(start + seg_len, n)
        y_seg = y[start:end]
        segs.append((y_seg, start / sr, end / sr))
    return segs

# mfcc 추출
def extract_mfcc(y: np.ndarray, sr: int, n_mfcc: int = 13):
    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=n_mfcc)
    mfcc_mean = np.mean(mfcc.T, axis=0)
    mfcc_std = np.std(mfcc.T, axis=0)
    return mfcc_mean, mfcc_std

# pitch 추출
def extract_pitch(y: np.ndarray, sr: int):
    # librosa.piptrack → magnitude > 0 지점의 주파수들만 활용
    pitches, mags = librosa.piptrack(y=y, sr=sr)
    mask = mags > 0
    if np.any(mask):
        pitch_vals = pitches[mask]
        return float(np.mean(pitch_vals)), float(np.std(pitch_vals))
    return 0.0, 0.0

# 침묵 제거 후 실제 발화 시간 기반 WPM 계산
def estimate_wpm(text: str, duration_sec: float) -> float:
    words = [w for w in (text or "").strip().split() if w]
    if duration_sec <= 0:
        return 0.0
    return float(len(words) / duration_sec * 60.0)

# 구간별 stt 매핑
def match_stt_to_segments(whisper_segments, segment_times):
    """
    whisper_segments: iterable of segments with .start, .end, .text and optionally .words
    segment_times: [(start_sec, end_sec), ...]
    """
    results = []
    for (ss, ee) in segment_times:
        texts = []
        # Prefer words timestamps if available
        for seg in whisper_segments:
            # 구간 겹침 여부 체크
            if seg.start < ee and seg.end > ss:
                # If word-level exists
                if hasattr(seg, "words") and seg.words:
                    wtxt = " ".join([w.word for w in seg.words if (w.start < ee and w.end > ss)])
                    if wtxt:
                        texts.append(wtxt)
                else:
                    texts.append(seg.text or "")
        results.append(" ".join(t for t in texts if t).strip())
    return results

# -----------------------------
# New helpers for Fix (2): fillers/silence per segment
# -----------------------------
def bucket_occurrences_by_segments(occurrences, segment_times):
    """
    occurrences: [(word, start, end), ...] in seconds
    segment_times: [(seg_start, seg_end), ...]
    return: list of list -> per-segment occurrences
    """
    per_seg = [[] for _ in segment_times]
    for word, s, e in occurrences or []:
        if s is None or e is None:
            continue
        for i, (ss, ee) in enumerate(segment_times):
            if s < ee and e > ss:       # 겹치면 해당 세그먼트에 부착
                per_seg[i].append((word, float(s), float(e)))
                break
    return per_seg

def silence_intervals_in_segment(y: np.ndarray, sr: int, top_db: float = 30.0):
    """
    librosa.effects.split → 발화(비무음) 구간 반환
    → 이를 반전하여 '무음' 구간 리스트 생성
    """
    non_silent = librosa.effects.split(y, top_db=top_db)    # 샘플 인덱스 구간
    silences = []
    last = 0
    n = len(y)
    for start, end in non_silent:
        if start > last:
            silences.append((last / sr, start / sr))
        last = end
    if last < n:
        silences.append((last / sr, n / sr))
    # 너무 짧은 무음(50ms 미만) 제거
    silences = [(s, e) for (s, e) in silences if (e - s) >= 0.05]
    return silences

# -----------------------------
# Main
# -----------------------------
# 음성 전체 분석 및 STT 변환 실행
def analyze_speech(audio_path: str, script_path: str, model=None, segment_duration: float = 5.0):

    # 0) Whisper 모델 준비(주입 없으면 캐시된 모델 사용)
    model = model or load_whisper_model()

    # 1) Load audio
    audio, sr = load_audio(audio_path)
    if audio is None:
        raise RuntimeError("Audio load failed.")

    # 2) STT 수행 + 세그먼트 정보 처리
    whisper_segments, stt_text = transcribe_audio(audio_path, model=model, word_timestamps=True)
    if not whisper_segments or stt_text is None:
        print("❌ STT 실패 또는 결과 없음")
        return None

    # 3) 대본 로드
    try:
        with open(script_path, 'r', encoding='utf-8') as f:
            script_text = f.read()
    except Exception as e:
        print(f"❌ 대본 로딩 실패: {e}")
        return None

    # 4) 오디오를 고정 길이 버킷으로 분할
    audio_segments = segment_audio(audio, sr, segment_duration=segment_duration)
    segment_times = [(st, et) for (_, st, et) in audio_segments]

    # 5) 세그먼트별 STT 텍스트 매핑
    stt_per_seg = match_stt_to_segments(whisper_segments, segment_times)

    # 6) Global metrics
    pause_ratio = float(calculate_pause_ratio(audio_path))
    pronunciation_accuracy = float(evaluate_pronunciation(script_text, stt_text))

    # 7) 간투사(전역)
    filler_count, filler_occurrences = detect_filler_words(whisper_segments, stt_text)

    # >>> 추가: 종류/빈도 요약
    by_type_counter = Counter([w for (w, _s, _e) in (filler_occurrences or [])])
    filler_by_type = {k: int(v) for k, v in by_type_counter.items()}

    # 8) 간투사를 세그먼트별로 버킷팅
    fillers_per_seg = bucket_occurrences_by_segments(filler_occurrences, segment_times)

    # 9) 구간별 피처 저장
    # 세그먼트 피처 계산 + 전역 통계 누적
    segment_features = []
    mfcc_means, mfcc_stds = [], []
    pitch_means, pitch_stds = [], []
    wpms = []

    for i, (audio_seg, st, et) in enumerate(audio_segments):
        seg_text = stt_per_seg[i]
        seg_dur = max(1e-6, (et - st))

        # features
        mfcc_mean, mfcc_std = extract_mfcc(audio_seg, sr)
        pitch_mean, pitch_std = extract_pitch(audio_seg, sr)
        wpm = estimate_wpm(seg_text, seg_dur)
        silences = silence_intervals_in_segment(audio_seg, sr)

        # 전체 평균용 리스트
        mfcc_means.append(mfcc_mean)
        mfcc_stds.append(mfcc_std)
        pitch_means.append(pitch_mean)
        pitch_stds.append(pitch_std)
        wpms.append(wpm)

        # build segment dict
        segment_features.append({
            "time_range": f"{st:05.2f}-{et:05.2f}",
            "stt_text": seg_text,
            "wpm": float(wpm),
            "pitch_mean": float(pitch_mean),
            "mfcc_mean": mfcc_mean.tolist(),
            "silence": [(float(s), float(e)) for (s, e) in silences],
            "fillers": [(w, float(s), float(e)) for (w, s, e) in (fillers_per_seg[i] if i < len(fillers_per_seg) else [])],
        })

    # 10) 전체 평균 계산
    avg_mfcc_mean = np.mean(np.stack(mfcc_means, axis=0), axis=0).tolist() if mfcc_means else [0.0]*13
    avg_mfcc_std  = np.mean(np.stack(mfcc_stds,  axis=0), axis=0).tolist() if mfcc_stds  else [0.0]*13
    avg_pitch_mean = float(np.mean(pitch_means)) if pitch_means else 0.0
    avg_pitch_std  = float(np.mean(pitch_stds))  if pitch_stds  else 0.0
    avg_wpm = float(np.mean(wpms)) if wpms else 0.0

    # 11) STT vs Script 비교 결과 HTML 저장
    os.makedirs("model/speech/results", exist_ok=True)
    stt_html_path = export_differences_to_html(script_text, stt_text, output_path="model/speech/results/stt_results.html")
    stt_result_url = "/" + stt_html_path if not stt_html_path.startswith("/") else stt_html_path

    # 12) 결과 출력(전역 평균 기준으로 출력값 수정)
    print(f"\n✅ 발음 유사도 점수: {pronunciation_accuracy * 100:.2f}%")
    print(f"✅ MFCC 평균: {avg_mfcc_mean}")
    print(f"✅ MFCC 표준편차: {mfcc_std}")              # ← 전역 평균 사용
    print(f"✅ Pitch 평균: {avg_pitch_mean:.2f} Hz")
    print(f"✅ Pitch 표준편차: {pitch_std:.2f} Hz")     # ← 전역 평균 사용
    print(f"✅ Words Per Minute(WPM): {avg_wpm:.2f}")
    print(f"✅ 무음 구간 비율: {pause_ratio:.2f}")
    print(f"✅ 간투사 수: {filler_count}회")
    if filler_count > 0:
        print(f"✅ 감지된 간투사: {filler_occurrences}")

    # 13) 발표 평가 요약
    print("\n[발표 평가]")
    if pronunciation_accuracy > 0.8 and avg_pitch_mean > 70 and avg_wpm > 100 and filler_count < 5:
        print("✅ 발음, 억양, 속도 모두 잘 조화되어 있습니다! 발표가 자연스럽습니다.")
    elif pronunciation_accuracy > 0.6:
        print("🔶 발음은 괜찮습니다. 억양 또는 추임새, 속도에 조금 더 주의해주세요.")
    else:
        print("❌ 발음과 억양, 속도 전반에 개선이 필요합니다. 꾸준한 연습이 도움이 됩니다.")

    # 14) 분석 결과 반환(JSON 직렬화는 호출부에서 dump_json 사용 권장)
    return {
        "segments": segment_features,
        "발음 유사도 점수": pronunciation_accuracy * 100.0,
        "MFCC 평균": avg_mfcc_mean,
        "MFCC 표준편차": avg_mfcc_std,       # FIXED
        "Pitch 평균": avg_pitch_mean,
        "Pitch 표준편차": avg_pitch_std,     # FIXED
        "wpm": avg_wpm,
        "무음 구간 비율": pause_ratio,
        "간투사 수": int(filler_count),
        # >>> 추가된 전역 요약
        "간투사 종류": filler_occurrences,         # 예: ["어","음","그"]
        "간투사_빈도": filler_by_type,       # 예: {"어":3,"음":2,"그":1}
        "stt_result_url": stt_result_url,     # NEW
    }

# -----------------------------
# (선택) 결과 저장 래퍼
# -----------------------------
def save_analysis_result_json(result: dict, output_path: str):
    """최종 분석 결과를 공통 직렬화 유틸로 저장"""
    dump_json(result, output_path, ensure_ascii=False, indent=2)