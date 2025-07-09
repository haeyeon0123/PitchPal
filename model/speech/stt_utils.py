import whisper
import difflib

# Whisper 모델 로드 (모델은 한 번만 로드하는 것이 효율적임)
whisper_model = whisper.load_model("small")

# 음성 파일을 텍스트로 변환
def transcribe_audio(audio_path):
    result = whisper_model.transcribe(audio_path)
    return result["text"]

# 발음 정확도 평가 (텍스트 유사도)
def evaluate_pronunciation(user_text, model_text):
    sequence = difflib.SequenceMatcher(None, user_text, model_text)
    return sequence.ratio()

# 텍스트 비교 시각화 (터미널 출력용)
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
