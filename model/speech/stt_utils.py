import whisper
import difflib
import string

# Whisper 모델 로드
whisper_model = whisper.load_model("medium")

# 문장 부호 제거 함수
def remove_punctuation(text):
    return text.translate(str.maketrans("", "", string.punctuation))

# 음성 파일을 텍스트로 변환
def transcribe_audio(audio_path):
    result = whisper_model.transcribe(
        audio_path,
        temperature=0.3,  # 디폴트는 0.0~1.0 사이. 낮출수록 반복 줄고 보수적으로 동작
        language="ko"
    )
    return result["text"]

# 발음 정확도 평가 (문장 부호 무시)
def evaluate_pronunciation(user_text, model_text):
    user_clean = remove_punctuation(user_text).lower()
    model_clean = remove_punctuation(model_text).lower()
    sequence = difflib.SequenceMatcher(None, user_clean, model_clean)
    return sequence.ratio()

# 차이 색상 강조: 빨간색 (-), 파란색 (+), 동일 단어는 그대로
def highlight_differences(ref_text, stt_text):
    ref_words = remove_punctuation(ref_text).split()
    stt_words = remove_punctuation(stt_text).split()

    diff = list(difflib.ndiff(ref_words, stt_words))

    ref_highlighted = []
    stt_highlighted = []

    ref_idx, stt_idx = 0, 0
    for d in diff:
        code = d[:2]
        word = d[2:]

        if code == "  ":  # 공통 단어
            ref_highlighted.append(word)
            stt_highlighted.append(word)
            ref_idx += 1
            stt_idx += 1
        elif code == "- ":  # 대본에만 있음 → 빨간색
            ref_highlighted.append(f"\033[91m{word}\033[0m")
            ref_idx += 1
        elif code == "+ ":  # STT에만 있음 → 파란색
            stt_highlighted.append(f"\033[94m{word}\033[0m")
            stt_idx += 1

    print("\n[원문 텍스트 (차이 강조)]")
    print(" ".join(ref_highlighted))

    print("\n[STT 결과 텍스트 (차이 강조)]")
    print(" ".join(stt_highlighted))

# 경로 설정
audio_path = "data/pitch_sample.m4a"
script_path = "data/pitch_sample_script.txt"

# 원문 텍스트 로드
with open(script_path, 'r', encoding='utf-8') as f:
    reference_text = f.read()

# STT 수행
transcribed_text = transcribe_audio(audio_path)

# 발음 유사도 평가
similarity_score = evaluate_pronunciation(transcribed_text, reference_text)

# 출력
print("\n✅ 발음 유사도 점수 (문장 부호 제외): {:.2f}%".format(similarity_score * 100))
highlight_differences(reference_text, transcribed_text)
