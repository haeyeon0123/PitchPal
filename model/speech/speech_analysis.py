import librosa
import numpy as np
from stt_pronounciation import transcribe_audio, evaluate_pronunciation, highlight_differences
from speech_analysis_visualization import plot_mfcc_features, plot_pitch_summary,plot_summary_metrics

# 음성 불러오기
def load_audio(audio_path):
    audio, sr = librosa.load(audio_path, sr=16000)
    return audio, sr

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

# 추임새 단어 감지
def detect_filler_words(transcript, fillers=["음", "어", "그", "저기", "이런"]):
    words = transcript.split()
    filler_count = sum(words.count(f) for f in fillers)
    return filler_count

# 침묵 제거 후 실제 발화 시간 기반 WPM 계산
def estimate_wpm_precise(audio, sr, transcript):
    non_silent_intervals = librosa.effects.split(audio, top_db=30)
    active_speech_duration_sec = sum((end - start) for start, end in non_silent_intervals) / sr
    if active_speech_duration_sec == 0:
        return 0.0
    word_count = len(transcript.split())
    wpm = (word_count / active_speech_duration_sec) * 60
    return wpm

# 음성 전체 분석 실행
def analyze_speech(audio_path, script_path, target_wpm=140):
    with open(script_path, "r", encoding="utf-8") as f:
        script = f.read().strip()

    # STT 수행
    transcript = transcribe_audio(audio_path)
    print(f"\n[STT 변환 결과]\n{transcript}\n")

    audio, sr = load_audio(audio_path)
    mfcc_mean, mfcc_std = extract_mfcc(audio, sr)
    pitch_mean, pitch_std = extract_pitch(audio, sr)
    precise_wpm = estimate_wpm_precise(audio, sr, transcript)
    filler_count = detect_filler_words(transcript)

    # 분석 출력
    print(f"[음성 분석 결과]")
    print(f"MFCC Features (Mean): {mfcc_mean}")
    print(f"MFCC Features (STD): {mfcc_std}")
    print(f"Pitch Features (Mean): {pitch_mean:.2f} Hz")
    print(f"Pitch Features (STD): {pitch_std:.2f} Hz")
    print(f"Words Per Minute (정밀): {precise_wpm:.2f}")
    print(f"추임새 사용 횟수: {filler_count}회")

    # 유사도 점수 출력
    pronunciation_accuracy = evaluate_pronunciation(script, transcript)
    print("\n✅ 발음 유사도 점수 (공백 및 문장 부호 무시): {:.2f}%".format(pronunciation_accuracy * 100))

    # 차이 시각화 출력
    highlight_differences(script, transcript)

    # 분석 후 결과 시각화
    plot_mfcc_features(mfcc_mean, mfcc_std)
    plot_pitch_summary(pitch_mean, pitch_std)
    plot_summary_metrics(precise_wpm, pronunciation_accuracy, filler_count)


    # 평가 출력
    print("\n[발표 평가]")
    if pronunciation_accuracy > 0.8 and pitch_mean > 70 and precise_wpm > 100 and filler_count < 5:
        print("✅ 발음, 억양, 속도 모두 잘 조화되어 있습니다! 발표가 자연스럽습니다.")
    elif pronunciation_accuracy > 0.6:
        print("🔶 발음은 괜찮습니다. 억양 또는 추임새, 속도에 조금 더 주의해주세요.")
    else:
        print("❌ 발음과 억양, 속도 전반에 개선이 필요합니다. 꾸준한 연습이 도움이 됩니다.")