import whisper
import csv
from pydub import AudioSegment, silence

def calculate_pause_ratio(audio_path, silence_thresh=-40, min_silence_len=300):
    # 1. 전체 길이 계산
    audio = AudioSegment.from_file(audio_path)
    total_duration_ms = len(audio)  # in milliseconds

    # 2. 무음 구간 탐지
    silent_ranges = silence.detect_silence(audio, min_silence_len=min_silence_len, silence_thresh=silence_thresh)

    # 3. 무음 구간 길이 합산
    total_silence_ms = sum(end - start for start, end in silent_ranges)

    # 4. 무음 비율 계산
    pause_ratio = total_silence_ms / total_duration_ms
    return pause_ratio

results = []

# pitch1부터 pitch10까지 반복
for i in range(1, 11):
    file_path = f"data/pitch{i}.m4a"  # 경로 구분자를 /로 수정
    pause_ratio = calculate_pause_ratio(file_path)
    print(f"{file_path} - Pause ratio: {pause_ratio:.2%}")
    results.append({"filename": f"pitch{i}.m4a", "pause_ratio": pause_ratio})

# CSV 파일로 저장
csv_file = "model/speech/results/pause_ratios.csv"
with open(csv_file, mode="w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=["filename", "pause_ratio"])
    writer.writeheader()
    writer.writerows(results)

print(f"\n결과가 '{csv_file}' 파일로 저장되었습니다.")