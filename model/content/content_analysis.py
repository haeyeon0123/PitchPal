from soynlp.normalizer import repeat_normalize
import openai

# 1. 맞춤법 교정 함수
def correct_spelling(text):
    # 반복된 문자와 같은 부분을 교정
    corrected_text = repeat_normalize(text, num_repeats=2)  # num_repeats 값을 조정하여 교정 정도를 설정
    return corrected_text

# 2. ChatGPT로 자연스러운 흐름 개선
import openai

openai.api_key = "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"  # 여기에 본인의 OpenAI API 키를 입력하세요.
def rewrite_with_chatgpt(text):
    prompt = (
        "다음 발표 대본을 더 자연스럽고 명확하게, "
        "발표 스타일에 맞게 다듬어줘. 의미는 바꾸지 말고 흐름만 좋게 바꿔줘:\n\n" + text
    )

    response = openai.ChatCompletion.create(
        model="gpt-3.5-turbo",  # gpt-4로 바꿀 수 있음
        messages=[
            {"role": "system", "content": "너는 말하기 전문가야. 발표 대본을 자연스럽게 고쳐줘."},
            {"role": "user", "content": prompt}
        ],
        temperature=0.7,
    )

    return response['choices'][0]['message']['content'].strip()

# 3. 전체 프로세스 실행
def main():
    print("발표 대본을 입력하세요 (엔터 두 번으로 종료):")
    user_input = ""
    while True:
        line = input()
        if line.strip() == "":
            break
        user_input += line.strip() + " "

    print("\n맞춤법 및 문법 교정 결과:")
    corrected = correct_spelling(user_input)
    print(corrected)

    print("\n자연스러운 표현:")
    improved = rewrite_with_chatgpt(corrected)
    print(improved)

if __name__ == "__main__":
    main()