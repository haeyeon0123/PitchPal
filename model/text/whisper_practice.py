import whisper
import time
from collections import Counter

# whisper 모델 생성
model = whisper.load_model('base')

# 음성 파일 경로 설정
file_path = "data/sample.wav"

# 불필요한 단어/추임새 리스트 작성
filler_words = ["어", "음", "아", "흠", "그니까", "그러니까", "뭐랄까", "이제", "약간", "뭐지", "그러면"]

# 음성 파일 STT 변환 및 시간 기록
start_time = time.time() # 시작 시간 기록
result = model.transcribe(file_path)
end_time = time.time() # 끝 시간 기록

# 텍스트 분석
text = result["text"]
print("텍스트 변환 결과: ")
print(text)

# 텍스트를 단어 단위로 나누기
words = text.split()

# 추임새 필터링
detected_fillers = [word for word in words if word in filler_words]

# 결과 출력
filler_count = Counter(detected_fillers)
print("검출된 불필요한 단어/추임새:", filler_count)

# 단어 수 & 음성 길이 계산
word_count = len(text.split()) # 단어 수 계산
print(f"Word count: {word_count}")
audio_length = end_time - start_time # 음성 길이 계산 (초)
print(f"Audio length: {audio_length}")

# 말의 속도 계산 (단어당 초)
speech_rate = word_count / audio_length # 단어 수 / 음성 길이
print(f"Speech rate: {speech_rate} words per second")

# 자주 쓰는 단어 확인
words = text.split()
common_words = Counter(words).most_common(10)

print("\n자주 쓰인 단어:")
for word, freq in common_words:
    print(f"{word}: {freq}회")