import whisper
import time
import librosa
from collections import Counter
import re

# whisper 모델 생성
model = whisper.load_model('base')

# 음성 파일 경로 설정
file_path = "data/SPK082SBSCU081M003.wav"

# 불필요한 단어/추임새 리스트 작성
filler_words = ["어", "음", "아", "흠", "그니까", "그러니까", "뭐랄까", "이제", "약간", "뭐지", "그러면"]

# 실제 오디오 길이 계산 (librosa 사용)
audio, sr = librosa.load(file_path)
audio_duration = librosa.get_duration(y=audio, sr=sr)

# STT 변환 시간 측정
start_time = time.time()
result = model.transcribe(file_path)
end_time = time.time()

# 텍스트 추출
text = result["text"]
print("📝 텍스트 변환 결과:\n", text)

# 정규표현식으로 단어 추출 (한글+영어)
words = re.findall(r'\b[\w가-힣]+\b', text)

# 추임새 검출
detected_fillers = [word for word in words if word in filler_words]
filler_count = Counter(detected_fillers)
print("\n🙊 검출된 불필요한 단어/추임새:", filler_count)

# 말의 속도 계산(단어 기반)
word_count = len(words)
wpm = (word_count / audio_duration) * 60  # Words Per Minute
wps = word_count / audio_duration         # Words Per Second

# 말의 속도 계산(글자수 기반)
char_count = len(text.replace(" ", ""))
char_speed = char_count / audio_duration

# 속도 피드백
if wpm < 90:
    feedback = "⚠️ 말이 다소 느립니다."
elif wpm > 160:
    feedback = "⚠️ 말이 빠른 편입니다."
else:
    feedback = "✅ 적절한 속도입니다."

# 출력
print(f"\n📊 단어 수: {word_count}개")
print(f"🎧 오디오 길이: {audio_duration:.2f}초")
print(f"🚀 단어 기반 말의 속도: {wpm:.2f} WPM / {wps:.2f} WPS")
print(f"🧾 문자 기반 말 속도: {char_speed:.2f} chars/sec")
print(f"🗣️ 속도 피드백: {feedback}")

# 자주 쓰인 단어
common_words = Counter(words).most_common(10)
print("\n🔁 자주 쓰인 단어:")
for word, freq in common_words:
    print(f"{word}: {freq}회")