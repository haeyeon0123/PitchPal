import librosa
import numpy as np
import soundfile as sf
import re, os
import time
from faster_whisper import WhisperModel

def normalize_word(word):
    return re.sub(r"[.~,·…]", "", word).strip()

def load_whisper_model(size="medium", device="cpu", compute_type="int8"):
    return WhisperModel(size, device=device, compute_type=compute_type)

def detect_filler_and_silence_stats(audio_path, model, 
                                     fillers=["음", "어", "그", "저", "이", "아", "흠", "으음", "어어"], 
                                     min_duration=0.4, 
                                     top_db=30):
    # 1. 원본 오디오 로드
    y, sr = librosa.load(audio_path, sr=16000)
    original_duration = len(y) / sr  # 초 단위

    # 2. 무음 구간 제거
    intervals = librosa.effects.split(y, top_db=top_db)
    non_silent_audio = np.concatenate([y[start:end] for start, end in intervals])
    non_silent_duration = len(non_silent_audio) / sr  # 초 단위

    # 3. 임시 파일로 저장 (Whisper는 파일 기반 입력이 필요)
    tmp_path = "temp_no_silence.wav"
    sf.write(tmp_path, non_silent_audio, sr)

    # 4. 간투사 감지
    segments, _ = model.transcribe(tmp_path, word_timestamps=True)
    filler_count = 0
    filler_occurrences = []

    for segment in segments:
        for word_info in segment.words:
            raw_word = word_info.word.lower()
            word = normalize_word(raw_word)
            start = word_info.start
            end = word_info.end
            duration = end - start

            if word in fillers and duration >= min_duration:
                filler_count += 1
                filler_occurrences.append((word, start, end))

    # 5. 무음 길이 및 비율 계산
    silence_duration = original_duration - non_silent_duration
    silence_ratio = silence_duration / original_duration

    # 6. 임시 파일 삭제
    os.remove(tmp_path)

    return {
        "filler_count": filler_count,
        "filler_occurrences": filler_occurrences,
        "original_duration": original_duration,
        "non_silent_duration": non_silent_duration,
        "silence_duration": silence_duration,
        "silence_ratio": silence_ratio
    }

total_start = time.time()
audio_path = "data/pitch_sample.m4a"
model = load_whisper_model("small") 
result = detect_filler_and_silence_stats(audio_path, model)
print(result)
total_end = time.time()  # ⏱ 전체 종료 시간 기록
elapsed = total_end - total_start
print(f"\n⏱ 총 실행 시간: {elapsed:.2f}초")