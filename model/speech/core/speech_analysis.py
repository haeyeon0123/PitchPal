import librosa
import numpy as np
from core.stt_pronunciation import transcribe_audio, export_differences_to_html
from utils.text_utils import evaluate_pronunciation
#from visualization.speech_analysis_visualization import plot_mfcc_features, plot_pitch_summary, plot_summary_metrics
from filler_words import detect_filler_words
from pause_ratio_calculator import calculate_pause_ratio

# 음성 불러오기
def load_audio(audio_path):
    return librosa.load(audio_path, sr=16000)

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
        return np.array([0])
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
def analyze_speech(audio_path, reference_text_path, target_wpm=140):

    with open(reference_text_path, 'r', encoding='utf-8') as f:
        reference_text = f.read()

    # STT 수행
    stt_text = transcribe_audio(audio_path)

    # 음성 분석 수행
    audio, sr = load_audio(audio_path)
    mfcc_mean, mfcc_std = extract_mfcc(audio, sr)
    pitch_mean, pitch_std = extract_pitch(audio, sr)
    precise_wpm = estimate_wpm_precise(audio, sr, stt_text)
    filler_count, filler_occurrences = detect_filler_words(audio_path)
    pause_ratio = calculate_pause_ratio(audio_path)

    # STT와 대본을 비교하여 발음 정확도 계산
    pronunciation_accuracy = evaluate_pronunciation(reference_text, stt_text)
    print(f"\n✅ 발음 유사도 점수 (공백 및 문장 부호 무시): {pronunciation_accuracy * 100:.2f}%")

    # 분석 결과 출력
    print(f"[음성 분석 결과]")
    print(f"MFCC Features (Mean): {mfcc_mean}")
    print(f"MFCC Features (STD): {mfcc_std}")
    print(f"Pitch Features (Mean): {pitch_mean:.2f} Hz")
    print(f"Pitch Features (STD): {pitch_std:.2f} Hz")
    print(f"Words Per Minute (정밀): {precise_wpm:.2f}")
    print(f"추임새 사용 횟수: {filler_count}회")
    print(f"무음 구간 비율: {pause_ratio:.2f}")
    if filler_count > 0:
        print(f"사용한 추임새: {filler_occurrences}")

    # stt 변환 및 발음 분석 결과를 해당 html 파일 경로에 저장
    output_html_path = "model/speech/results/stt_results.html" 
    export_differences_to_html(reference_text, stt_text, output_html_path)

    # 음성 분석 후 결과 시각화
    #plot_mfcc_features(mfcc_mean, mfcc_std)
    #plot_pitch_summary(pitch_mean, pitch_std)
    #plot_summary_metrics(precise_wpm, pronunciation_accuracy, filler_count)

    # 평가 출력
    print("\n[발표 평가]")
    if pronunciation_accuracy > 0.8 and pitch_mean > 70 and precise_wpm > 100 and filler_count < 5:
        print("✅ 발음, 억양, 속도 모두 잘 조화되어 있습니다! 발표가 자연스럽습니다.")
    elif pronunciation_accuracy > 0.6:
        print("🔶 발음은 괜찮습니다. 억양 또는 추임새, 속도에 조금 더 주의해주세요.")
    else:
        print("❌ 발음과 억양, 속도 전반에 개선이 필요합니다. 꾸준한 연습이 도움이 됩니다.")