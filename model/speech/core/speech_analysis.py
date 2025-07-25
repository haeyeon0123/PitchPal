import librosa
import numpy as np
from core.stt_pronunciation import transcribe_audio, export_differences_to_html
from utils.text_utils import evaluate_pronunciation
from core.filler_words import detect_filler_words_safe  # 변경된 통합 함수
from core.pause_ratio_calculator import calculate_pause_ratio

# 음성 불러오기
def load_audio(audio_path):
    try:
        return librosa.load(audio_path, sr=16000)
    except Exception as e:
        print(f"❌ 음성 파일 로딩 실패: {e}")
        return None, None

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

# 음성 전체 분석 및 STT 변환 실행
def analyze_speech(audio_path, reference_text_path, model, target_wpm=140):
    try:
        with open(reference_text_path, 'r', encoding='utf-8') as f:
            reference_text = f.read()
    except Exception as e:
        print(f"❌ 대본 로딩 실패: {e}")
        return

    # STT 수행
    stt_text, segments = transcribe_audio(audio_path, model)

    audio, sr = load_audio(audio_path)
    if audio is None:
        return

    # 음성 분석 수행
    mfcc_mean, mfcc_std = extract_mfcc(audio, sr)
    pitch_mean, pitch_std = extract_pitch(audio, sr)
    precise_wpm = estimate_wpm_precise(audio, sr, stt_text)

    # ✅ 간투사 감지 (보완 포함)
    filler_count, filler_occurrences = detect_filler_words_safe(segments, stt_text)

    # 무음 비율 계산
    pause_ratio = calculate_pause_ratio(audio_path)

    # 발음 유사도
    pronunciation_accuracy = evaluate_pronunciation(reference_text, stt_text)

    # 분석 결과 출력
    print(f"\n✅ 발음 유사도 점수: {pronunciation_accuracy * 100:.2f}%")
    print(f"✅ MFCC 평균: {mfcc_mean}")
    print(f"✅ MFCC 표준편차: {mfcc_std}")
    print(f"✅ Pitch 평균: {pitch_mean:.2f} Hz")
    print(f"✅ Pitch 표준편차: {pitch_std:.2f} Hz")
    print(f"✅ Words Per Minute(WPM): {precise_wpm:.2f}")
    print(f"✅ 무음 구간 비율: {pause_ratio:.2f}")
    print(f"✅ 간투사 수: {filler_count}회")
    if filler_count > 0:
        print(f"✅ 감지된 간투사: {filler_occurrences}")

    # STT 비교 결과 저장
    output_html_path = "model/speech/results/stt_results.html"
    export_differences_to_html(reference_text, stt_text, output_html_path)

    # 평가 출력
    print("\n[발표 평가]")
    if pronunciation_accuracy > 0.8 and pitch_mean > 70 and precise_wpm > 100 and filler_count < 5:
        print("✅ 발음, 억양, 속도 모두 잘 조화되어 있습니다! 발표가 자연스럽습니다.")
    elif pronunciation_accuracy > 0.6:
        print("🔶 발음은 괜찮습니다. 억양 또는 추임새, 속도에 조금 더 주의해주세요.")
    else:
        print("❌ 발음과 억양, 속도 전반에 개선이 필요합니다. 꾸준한 연습이 도움이 됩니다.")
