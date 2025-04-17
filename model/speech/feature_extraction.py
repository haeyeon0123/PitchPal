import librosa
import librosa.display
import numpy as np
import matplotlib.pyplot as plt
import os
import torch

# 음성 파일 경로
AUDIO_PATH = "data/sample.wav"

# 오디오 파일 로드
y, sr = librosa.load(AUDIO_PATH, sr=16000)
print(f"샘플링 레이트: {sr}, 오디오 길이: {len(y)/sr:.2f}초")

# 파형 시각화
plt.figure(figsize=(10, 3))
librosa.display.waveshow(y, sr=sr)
plt.title("Waveform")
plt.show()

# 특징 추출
def extract_features(y, sr):
    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13) # 음성 신호를 주파수 영역에서 분석하여 인간의 청각 시스템에 근사한 특징을 추출
    zcr = librosa.feature.zero_crossing_rate(y) # 음성이 0을 지나는 횟수를 측정하여 음성의 특성을 나타냄
    energy = np.array([np.sum(np.square(y[i:i+2048])) for i in range(0, len(y), 2048)]) # 음성 신호의 에너지 크기를 계산
    pitch, _ = librosa.piptrack(y=y, sr=sr) # 음성의 주파수 대역에 대한 정보 
    contrast = librosa.feature.spectral_contrast(y=y, sr=sr) # 음성 신호에서 주파수 피치를 추출

    # 평균값으로 요약
    feature_vector = np.concatenate([
        np.mean(mfcc, axis=1),
        np.mean(zcr, axis=1),
        [np.mean(energy)],
        [np.mean(pitch)],
        np.mean(contrast, axis=1)
    ])
    return feature_vector

feature_vector = extract_features(y, sr)
print("추출된 특징 벡터 길이:", len(feature_vector))

# 차원 확장 (배치 크기=1, 채널=길이, 시간=1)
x_input = torch.tensor(feature_vector, dtype=torch.float32).unsqueeze(0).unsqueeze(2)  # (1, channels, 1

# 데이터 정규화 (특징 벡터 평균 0, 표준편차 1로 변환)
def normalize_features(feature_vector):
    return (feature_vector - np.mean(feature_vector)) / np.std(feature_vector)

normalized_feature_vector = normalize_features(feature_vector)
