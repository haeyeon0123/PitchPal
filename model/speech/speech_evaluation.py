import librosa
import numpy as np
from scipy.spatial.distance import cosine

# 두 음성 파일 로드 (16kHz 권장)
tts_audio, _ = librosa.load("data/sample_tts.wav", sr=16000)
user_audio, _ = librosa.load("data/sample.wav", sr=16000)

# MFCC 추출
tts_mfcc = librosa.feature.mfcc(y=tts_audio, sr=16000, n_mfcc=13)
user_mfcc = librosa.feature.mfcc(y=user_audio, sr=16000, n_mfcc=13)

# 평균 벡터로 변환
tts_mean = np.mean(tts_mfcc, axis=1)
user_mean = np.mean(user_mfcc, axis=1)

# 유사도 계산 (Cosine Similarity)
similarity = 1 - cosine(tts_mean, user_mean)
print(f"음성 유사도: {similarity:.2f}")