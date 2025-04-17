import torch
import torch.nn as nn
from feature_extraction import extract_features

# CNN 모델 정의
class SpeechAnalysisCNN(nn.Module):
    def __init__(self, in_channels):
        super(SpeechAnalysisCNN, self).__init__()
        self.conv1 = nn.Conv1d(in_channels=in_channels, out_channels=32, kernel_size=1)
        self.relu = nn.ReLU()
        self.pool = nn.AdaptiveAvgPool1d(1)
        self.fc = nn.Linear(32, 1)  # 회귀 모델 기준 (감정 분류면 클래스 수로 수정)

    def forward(self, x):
        x = self.conv1(x)
        x = self.relu(x)
        x = self.pool(x)
        x = x.view(x.size(0), -1)
        return self.fc(x)

# 오디오에서 feature 추출
feature_vector = extract_features("sample.wav", sr = 16000)  # shape: (n_features, time)

# PyTorch Tensor로 변환 (Conv1D 입력 형식으로 reshape)
input_tensor = torch.tensor(feature_vector, dtype=torch.float32).unsqueeze(0)  # shape: (1, in_channels, length)

# 모델 생성
model = SpeechAnalysisCNN(in_channels=input_tensor.shape[1])

# 모델 실행
output = model(input_tensor)

# 출력 결과 확인
print("모델 출력값:", output)
