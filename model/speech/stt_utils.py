import whisper
import difflib
import string

# Whisper 모델 로드
whisper_model = whisper.load_model("medium")

# 음성 파일을 텍스트로 변환
def transcribe_audio(audio_path):
    result = whisper_model.transcribe(audio_path)
    return result["text"]

# 비교용: 공백 및 문장부호 제거
def clean_text_for_comparison(text):
    no_punct = text.translate(str.maketrans("", "", string.punctuation))
    no_space = no_punct.replace(" ", "")
    return no_space.lower()

# 유사도 평가
def evaluate_pronunciation(user_text, model_text):
    user_clean = clean_text_for_comparison(user_text)
    model_clean = clean_text_for_comparison(model_text)
    sequence = difflib.SequenceMatcher(None, user_clean, model_clean)
    return sequence.ratio()

# 시각화 출력: 문장 부호 및 공백은 유지
def highlight_differences(ref_text, stt_text):
    ref_words = ref_text.split()
    stt_words = stt_text.split()

    diff = list(difflib.ndiff(ref_words, stt_words))

    ref_highlighted = []
    stt_highlighted = []

    for d in diff:
        code = d[:2]
        word = d[2:]

        if code == "  ":
            ref_highlighted.append(word)
            stt_highlighted.append(word)
        elif code == "- ":
            ref_highlighted.append(f"\033[91m{word}\033[0m")  # 빨간색
        elif code == "+ ":
            stt_highlighted.append(f"\033[94m{word}\033[0m")  # 파란색

    print("\n[원문 텍스트 (차이 강조)]")
    print(" ".join(ref_highlighted))

    print("\n[STT 결과 텍스트 (차이 강조)]")
    print(" ".join(stt_highlighted))

# 파일 경로
audio_path = "data/pitch_sample.m4a"
script_path = "data/pitch_sample_script.txt"

# 대본 로드
with open(script_path, 'r', encoding='utf-8') as f:
    reference_text = f.read()

# STT 수행
transcribed_text = transcribe_audio(audio_path)

# 유사도 계산
similarity_score = evaluate_pronunciation(transcribed_text, reference_text)

# 출력
print("\n✅ 발음 유사도 점수 (공백 및 문장 부호 무시): {:.2f}%".format(similarity_score * 100))
highlight_differences(reference_text, transcribed_text)
