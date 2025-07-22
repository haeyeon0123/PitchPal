import librosa
import numpy as np

# ✔️ stt 도구
from model.speech.core.stt_pronunciation import transcribe_audio, export_differences_to_html

# ✔️ 발음 평가 도구 (utils → speech.utils)
from model.speech.utils.text_utils import evaluate_pronunciation

# ✔️ 간투사 탐지, 멈춤 분석
from model.speech.core.filler_words import detect_filler_words
from model.speech.core.pause_ratio_calculator import calculate_pause_ratio

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

# ✅ 수정된 analyze_speech (reference_text를 문자열로 직접 받음)
def analyze_speech(audio_path, reference_text, model, target_wpm=140):
    # STT 수행
    stt_text, segments = transcribe_audio(audio_path, model)

    audio, sr = load_audio(audio_path)
    if audio is None: return

    # 음성 분석 수행
    mfcc_mean, mfcc_std = extract_mfcc(audio, sr)
    pitch_mean, pitch_std = extract_pitch(audio, sr)
    precise_wpm = estimate_wpm_precise(audio, sr, stt_text)
    filler_count, filler_occurrences = detect_filler_words(segments)
    pause_ratio = calculate_pause_ratio(audio_path)

    # STT와 대본을 비교하여 발음 정확도 계산
    pronunciation_accuracy = evaluate_pronunciation(reference_text, stt_text)

    # 분석 결과 출력
    print(f"\n✅ 발음 유사도 점수 (공백 및 문장 부호 무시): {pronunciation_accuracy * 100:.2f}%")
    print(f"✅ 음성 분석 결과")
    print(f"✅ MFCC 평균: {mfcc_mean}")
    print(f"✅ MFCC 표준편차: {mfcc_std}")
    print(f"✅ Pitch 평균: {pitch_mean:.2f} Hz")
    print(f"✅ Pitch 표준편차: {pitch_std:.2f} Hz")
    print(f"✅ Words Per Minute(WPM): {precise_wpm:.2f}")
    print(f"✅ 무음 구간 비율: {pause_ratio:.2f}")
    print(f"✅ 간투사 수: {filler_count}회")
    if filler_count > 0:
        print(f"✅ 사용된 간투사: {filler_occurrences}")

    # STT와 대본 비교 결과를 HTML로 저장
    output_html_path = "model/speech/results/stt_results.html"
    export_differences_to_html(reference_text, stt_text, output_html_path)

    # 결과 요약 반환 (백엔드 JSON 응답용)
    return {
    "stats": {
        "speed": float(round(precise_wpm, 2)),
        "accuracy": float(round(pronunciation_accuracy * 100, 2)),
        "fillerCount": int(filler_count),
        "pauseAvg": float(round(pause_ratio, 2))
    },
    "speedData": [
        {"time": i * 10, "wpm": float(round(precise_wpm + np.random.randn() * 5, 2))}
        for i in range(6)
    ],
    "pitchAndVolumeData": [
        {
            "pitch": float(round(pitch_mean, 2)),
            "pitchStd": float(round(pitch_std, 2))
        },
        {
            "mfccMean": [float(x) for x in mfcc_mean.tolist()],
            "mfccStd": [float(x) for x in mfcc_std.tolist()]
        }
    ],
    "fillerData": [
        {"word": word, "count": int(count)}
        for word, count in filler_occurrences.items()
    ],
    "pauseData": [
        {"length": float(round(pause_ratio, 2)), "freq": 1}
    ],
    "tips": generate_tips(pronunciation_accuracy, pitch_mean, precise_wpm, filler_count)
}

# 팁 생성 함수
def generate_tips(accuracy, pitch, wpm, filler_count):
    tips = []
    if wpm > 180:
        tips.append("말이 너무 빠를 수 있어요. 천천히 또박또박 말해보세요.")
    if accuracy < 0.7:
        tips.append("발음 정확도를 높이기 위해 문장을 천천히 따라 읽는 연습을 해보세요.")
    if filler_count > 3:
        tips.append("‘음’, ‘어’ 같은 간투사를 줄이기 위해 잠깐 멈추는 습관을 길러보세요.")
    if pitch < 70:
        tips.append("억양이 단조로워요. 강조하고 싶은 단어에 힘을 줘보세요.")
    return tips
