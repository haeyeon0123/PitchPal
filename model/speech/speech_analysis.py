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

# 전체 음성 분석
def analyze_speech(audio_path, target_wpm=140, model_text="이것은 예시 텍스트입니다."):
    # 텍스트 변환 (Whisper)
    transcript = transcribe_audio(audio_path)
    print(f"Transcript: {transcript}")

    # 음성 분석 (Librosa)
    audio, sr = load_audio(audio_path)
    mfcc_mean, mfcc_std = extract_mfcc(audio, sr)
    pitch_mean, pitch_std = extract_pitch(audio, sr)
    wpm = estimate_wpm(audio_path, transcript)
    
    print(f"MFCC Features (Mean): {mfcc_mean}")
    print(f"MFCC Features (STD): {mfcc_std}")
    print(f"Pitch Features (Mean): {pitch_mean}")
    print(f"Pitch Features (STD): {pitch_std}")
    print(f"Words Per Minute: {wpm:.2f}")
    
    # 발음 정확도 평가
    pronunciation_accuracy = evaluate_pronunciation(transcript, model_text)
    print(f"Pronunciation Accuracy: {pronunciation_accuracy:.2f}")
    
    # MFCC 평균이 0.2 이상이면 발음이 안정적
    # Pitch 평균이 70 Hz 이상이면 억양이 자연스럽
    # WPM이 90 이상이면 속도가 적당
    if np.mean(mfcc_mean) > 0.2 and pitch_mean > 70 and wpm > 90 and pronunciation_accuracy > 0.6:
        print("발음, 억양, 속도 모두 잘 조화되어 있습니다! 발표가 자연스럽습니다.")
    elif np.mean(mfcc_mean) > 0.1:
        print("발음은 좋습니다! 억양과 속도를 더 조정하면 좋겠습니다.")
    elif pronunciation_accuracy > 0.5:
        print("발음은 괜찮은 편입니다! 억양과 속도를 자연스럽게 조정해보세요.")
    else:
        print("발음, 억양, 속도에 더 많은 연습이 필요합니다.")

# 예시 음성 파일 경로
audio_path = "data/sample2.wav"
analyze_speech(audio_path)
