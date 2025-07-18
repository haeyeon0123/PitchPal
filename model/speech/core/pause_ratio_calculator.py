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