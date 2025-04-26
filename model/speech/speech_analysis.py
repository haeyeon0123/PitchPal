import librosa
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity

# 1. 오디오 파일 로드
def load_audio(file_path):
    audio, sr = librosa.load(file_path, sr=16000)
    return audio, sr

# 2. MFCC 특징 추출
def extract_mfcc(audio, sr):
    mfccs = librosa.feature.mfcc(y=audio, sr=sr, n_mfcc=13)
    mfccs_mean = np.mean(mfccs.T, axis=0)
    return mfccs_mean

# 3. Pitch(억양) 특징 추출
def extract_pitch(audio, sr):
    pitches, magnitudes = librosa.piptrack(y=audio, sr=sr)
    pitch_values = pitches[magnitudes > np.median(magnitudes)]
    if len(pitch_values) == 0:
        return np.array([0])
    pitch_mean = np.mean(pitch_values)
    return np.array([pitch_mean])

# 4. 속도(WPM) 추정 (오디오 길이 기반 단순 추정)
def estimate_wpm(audio_duration_sec, estimated_word_count=150):
    """
    사용자가 약 estimated_word_count 단어를 발화했다고 가정하고,
    WPM을 추정하는 함수입니다.
    """
    wpm = (estimated_word_count / audio_duration_sec) * 60
    return wpm

# 5. 특징 비교 (코사인 유사도)
def compare_features(feature1, feature2):
    similarity = cosine_similarity([feature1], [feature2])[0][0]
    return similarity

# 6. 전체 평가
def speech_evaluate(user_audio_path):
    print("1️⃣ 오디오 불러오기")
    user_audio, sr = load_audio(user_audio_path)

    print("2️⃣ MFCC(발음 특성) 추출")
    user_mfcc = extract_mfcc(user_audio, sr)

    print("3️⃣ Pitch(억양 특성) 추출")
    user_pitch = extract_pitch(user_audio, sr)

    print("4️⃣ 속도 계산 (WPM)")
    duration_sec = librosa.get_duration(filename=user_audio_path)
    user_wpm = estimate_wpm(duration_sec)

    # =========================
    # 기준값 (모델) 설정 부분
    # =========================
    model_mfcc = np.random.normal(0, 1, 13)  # 예시 기준 MFCC (추후 실제 데이터로 교체)
    model_pitch = np.array([150])            # 평균 pitch 기준값 예시 (Hz)
    target_wpm = 140                         # 목표 발화 속도 (WPM)
    # =========================

    print("5️⃣ 발음 유사도 평가 (MFCC)")
    mfcc_similarity = compare_features(user_mfcc, model_mfcc)
    print(f" - 발음 유사도 점수: {mfcc_similarity:.2f}")

    print("6️⃣ 억양 유사도 평가 (Pitch)")
    pitch_similarity = compare_features(user_pitch, model_pitch)
    print(f" - 억양 유사도 점수: {pitch_similarity:.2f}")

    print("7️⃣ 속도 비교 (Words Per Minute)")
    print(f" - 사용자 WPM 추정값: {user_wpm:.2f}")
    print(f" - 목표 WPM: {target_wpm}")

    print("\n8️⃣ 최종 평가 결과")
    if mfcc_similarity > 0.85 and pitch_similarity > 0.85 and abs(user_wpm - target_wpm) < 30:
        print("발음, 억양, 속도 모두 매우 우수합니다! 😎")
    elif mfcc_similarity > 0.7:
        print("좋은 발표입니다! 약간 다듬으면 완벽해요. 🙂")
    else:
        print("추가 연습이 필요합니다. 발음과 억양을 개선해봅시다. 💪")

# 사용 예시
if __name__ == "__main__":
    user_audio_path = "data/sample.wav"  # 샘플 음성 파일
    speech_evaluate(user_audio_path)
