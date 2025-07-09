import whisper
import librosa
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
import difflib

# Whisper 모델 로드
whisper_model = whisper.load_model("small")

# 음성 파일을 텍스트로 변환
def transcribe_audio(audio_path):
    result = whisper_model.transcribe(audio_path)
    return result["text"]

# Librosa로 음성 특성 분석
def load_audio(audio_path):
    audio, sr = librosa.load(audio_path, sr=16000)
    return audio, sr

# MFCC 특징 추출
def extract_mfcc(audio, sr):
    mfccs = librosa.feature.mfcc(y=audio, sr=sr, n_mfcc=13)
    mfccs_mean = np.mean(mfccs.T, axis=0)
    mfccs_std = np.std(mfccs.T, axis=0)
    return mfccs_mean, mfccs_std

# Pitch(억양) 특징 추출
def extract_pitch(audio, sr):
    pitches, magnitudes = librosa.piptrack(y=audio, sr=sr)
    pitch_values = pitches[magnitudes > np.median(magnitudes)]
    if len(pitch_values) == 0:
        return np.array([0])
    pitch_mean = np.mean(pitch_values)
    pitch_std = np.std(pitch_values)
    return pitch_mean, pitch_std

# 속도(WPM) 추정
def estimate_wpm(audio_path, transcript):
    audio, sr = librosa.load(audio_path, sr=16000)
    audio_duration_sec = librosa.get_duration(y=audio, sr=sr)
    word_count = len(transcript.split())
    wpm = (word_count / audio_duration_sec) * 60
    return wpm

# 발음 정확도 평가
def evaluate_pronunciation(user_text, model_text):
    sequence = difflib.SequenceMatcher(None, user_text, model_text)
    return sequence.ratio()

# 텍스트 비교 시각화
def show_text_differences(reference, transcript):
    diff = difflib.ndiff(reference.split(), transcript.split())
    print("\n[원문 vs. 음성 텍스트 비교 결과]")
    for d in diff:
        if d.startswith("-"):
            print(f"\033[91m{d}\033[0m")  # 빨간색: 누락됨
        elif d.startswith("+"):
            print(f"\033[94m{d}\033[0m")  # 파란색: 추가됨
        elif d.startswith("?"):
            continue
        else:
            print(d)

# 전체 음성 분석
def analyze_speech(audio_path, script_path, target_wpm=140):
    # 대본 파일 읽기
    with open(script_path, "r", encoding="utf-8") as f:
        model_text = f.read().strip()

    # 텍스트 변환 (Whisper)
    transcript = transcribe_audio(audio_path)
    print(f"\n[STT 변환 결과]\n{transcript}\n")

    # 음성 분석 (Librosa)
    audio, sr = load_audio(audio_path)
    mfcc_mean, mfcc_std = extract_mfcc(audio, sr)
    pitch_mean, pitch_std = extract_pitch(audio, sr)
    wpm = estimate_wpm(audio_path, transcript)
    
    print(f"[음성 분석 결과]")
    print(f"MFCC Features (Mean): {mfcc_mean}")
    print(f"MFCC Features (STD): {mfcc_std}")
    print(f"Pitch Features (Mean): {pitch_mean}")
    print(f"Pitch Features (STD): {pitch_std}")
    print(f"Words Per Minute: {wpm:.2f}")
    
    # 발음 정확도 평가
    pronunciation_accuracy = evaluate_pronunciation(transcript, model_text)
    print(f"\n[발음 정확도 (텍스트 유사도 기준)]: {pronunciation_accuracy:.2f}")
    
    # 텍스트 비교 시각화
    show_text_differences(model_text, transcript)

    # 종합 평가
    print("\n[발표 평가]")
    if np.mean(mfcc_mean) > 0.2 and pitch_mean > 70 and wpm > 90 and pronunciation_accuracy > 0.6:
        print("✅ 발음, 억양, 속도 모두 잘 조화되어 있습니다! 발표가 자연스럽습니다.")
    elif np.mean(mfcc_mean) > 0.1:
        print("🔶 발음은 좋습니다! 억양과 속도를 더 조정하면 좋겠습니다.")
    elif pronunciation_accuracy > 0.5:
        print("🔶 발음은 괜찮은 편입니다! 억양과 속도를 자연스럽게 조정해보세요.")
    else:
        print("❌ 발음, 억양, 속도에 더 많은 연습이 필요합니다.")

# 예시 파일 경로
audio_path = "data/pitch_sample.m4a"      # 사용자 음성 입력
script_path = "data/pitch_sample_script.txt"     # 발표 대본 텍스트 파일

analyze_speech(audio_path, script_path)
