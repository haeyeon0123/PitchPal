import librosa
import numpy as np
import csv
from core.stt_pronunciation import transcribe_audio, export_differences_to_html
from utils.text_utils import evaluate_pronunciation
from core.filler_words import detect_filler_words  
from core.pause_ratio_calculator import calculate_pause_ratio

# 음성 불러오기
def load_audio(audio_path):
    try:
        return librosa.load(audio_path, sr=16000)
    except Exception as e:
        print(f"❌ 음성 파일 로딩 실패: {e}")
        return None, None
    
# 오디오를 5초 단위로 자르기
def segment_audio(audio, sr, segment_duration=5.0):
    segment_samples = int(segment_duration * sr)
    segments = []

    for i in range(0, len(audio), segment_samples):
        start_sample = i
        end_sample = min(i + segment_samples, len(audio))
        segment = audio[start_sample:end_sample]
        start_time = start_sample / sr
        end_time = end_sample / sr
        segments.append((segment, start_time, end_time))

    return segments

# mfcc 추출
def extract_mfcc(audio, sr):
    mfccs = librosa.feature.mfcc(y=audio, sr=sr, n_mfcc=13)
    mfccs_mean = np.mean(mfccs.T, axis=0)
    mfccs_std = np.std(mfccs.T, axis=0)
    return mfccs_mean, mfccs_std

# pitch 추출
def extract_pitch(audio, sr):
    pitches, magnitudes = librosa.piptrack(y=audio, sr=sr)
    pitch_values = pitches[magnitudes > np.median(magnitudes)]
    if len(pitch_values) == 0:
        return 0.0, 0.0
    pitch_mean = np.mean(pitch_values)
    pitch_std = np.std(pitch_values)
    return pitch_mean, pitch_std

# 침묵 제거 후 실제 발화 시간 기반 WPM 계산
def estimate_wpm_precise(audio, sr, text):
    non_silent_intervals = librosa.effects.split(audio, top_db=30)
    active_speech_duration_sec = sum((end - start) for start, end in non_silent_intervals) / sr
    if active_speech_duration_sec == 0:
        return 0.0
    word_count = len(text.split())
    wpm = (word_count / active_speech_duration_sec) * 60
    return wpm

def save_segment_features_to_csv(segment_features, output_path):

    with open(output_path, mode="w", encoding="utf-8", newline='') as f:
        writer = csv.writer(f)
        # 헤더 작성
        header = ["time_range", "wpm", "pitch_mean"] + [f"mfcc_{i+1}" for i in range(len(segment_features[0]['mfcc_mean']))]
        writer.writerow(header)

        # 데이터 작성
        for segment in segment_features:
            row = [segment["time_range"], segment["wpm"], segment["pitch_mean"]] + segment["mfcc_mean"]
            writer.writerow(row)

    print(f"✅ 구간별 피처가 CSV로 저장되었습니다: {output_path}")

# 음성 전체 분석 및 STT 변환 실행
def analyze_speech(audio_path, reference_text_path, model, segment_duration=5.0):
    try:
        with open(reference_text_path, 'r', encoding='utf-8') as f:
            reference_text = f.read()
    except Exception as e:
        print(f"❌ 대본 로딩 실패: {e}")
        return None

    # STT 수행 + 세그먼트 정보 처리
    stt_text, segments = transcribe_audio(audio_path, model)
    audio, sr = load_audio(audio_path)
    if audio is None:
        return None
    
    # 오디오를 일정 길이로 분할
    audio_segments = segment_audio(audio, sr, segment_duration)

    # 구간별 피처 저장
    mfcc_means, pitch_means, wpms = [], [], []
    segment_features = []

    for segment, start_time, end_time in audio_segments:
        mfcc_mean, mfcc_std = extract_mfcc(segment, sr)
        pitch_mean, pitch_std = extract_pitch(segment, sr)
        segment_text = stt_text  # 기본적으로 전체 텍스트를 사용 (이후 개선 가능)
        wpm = estimate_wpm_precise(segment, sr, segment_text)

        time_range_str = f"{start_time:05.2f}-{end_time:05.2f}"

        segment_features.append({
            "time_range": time_range_str,
            "wpm": wpm,
            "pitch_mean": pitch_mean,
            "mfcc_mean": mfcc_mean.tolist()  # JSON 직렬화 대비
        })

        # 전체 평균용 리스트
        mfcc_means.append(mfcc_mean)
        pitch_means.append(pitch_mean)
        wpms.append(wpm)

    # 전체 평균 계산
    avg_mfcc_mean = np.mean(mfcc_means, axis=0)
    avg_pitch_mean = np.mean(pitch_means)
    avg_wpm = np.mean(wpms)
    
    """
    # 음성 분석
    mfcc_mean, mfcc_std = extract_mfcc(audio, sr)
    pitch_mean, pitch_std = extract_pitch(audio, sr)
    precise_wpm = estimate_wpm_precise(audio, sr, stt_text)"""

    filler_count, filler_occurrences = detect_filler_words(segments, stt_text)
    pause_ratio = calculate_pause_ratio(audio_path)
    pronunciation_accuracy = evaluate_pronunciation(reference_text, stt_text)

    # 결과 출력 (콘솔 확인용)
    print(f"\n✅ 발음 유사도 점수: {pronunciation_accuracy * 100:.2f}%")
    print(f"✅ MFCC 평균: {avg_mfcc_mean}")
    print(f"✅ MFCC 표준편차: {mfcc_std}")
    print(f"✅ Pitch 평균: {avg_pitch_mean:.2f} Hz")
    print(f"✅ Pitch 표준편차: {pitch_std:.2f} Hz")
    print(f"✅ Words Per Minute(WPM): {avg_wpm:.2f}")
    print(f"✅ 무음 구간 비율: {pause_ratio:.2f}")
    print(f"✅ 간투사 수: {filler_count}회")
    if filler_count > 0:
        print(f"✅ 감지된 간투사: {filler_occurrences}")

    # HTML 비교 결과 저장
    output_html_path = "model/speech/results/stt_results.html"
    export_differences_to_html(reference_text, stt_text, output_html_path)

    # 발표 평가 요약
    print("\n[발표 평가]")
    if pronunciation_accuracy > 0.8 and avg_pitch_mean > 70 and avg_wpm > 100 and filler_count < 5:
        print("✅ 발음, 억양, 속도 모두 잘 조화되어 있습니다! 발표가 자연스럽습니다.")
    elif pronunciation_accuracy > 0.6:
        print("🔶 발음은 괜찮습니다. 억양 또는 추임새, 속도에 조금 더 주의해주세요.")
    else:
        print("❌ 발음과 억양, 속도 전반에 개선이 필요합니다. 꾸준한 연습이 도움이 됩니다.")

    # ✅ 회귀 예측용 피처 반환
    return {
        "wpm": avg_wpm,
        "pause_ratio": pause_ratio,
        "pron_score": pronunciation_accuracy * 100,
        "segments": segment_features
    }