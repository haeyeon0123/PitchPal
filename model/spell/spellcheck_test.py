import openai
import os
from dotenv import load_dotenv

load_dotenv()
api_key = os.getenv("OPENAI_API_KEY")

client = openai.OpenAI(api_key=api_key)

def gpt_spell_check(text):
    response = client.chat.completions.create(
        model="gpt-3.5-turbo",
        messages=[
            {"role": "user", "content": f"다음 문장의 맞춤법을 교정해 주세요:\n\n{text}"}
        ],
        temperature=0.2
    )
    return response.choices[0].message.content.strip()

# 테스트 실행
text = "나는 좋아한다 파이썬이" # 예시 문장
print("교정 결과:", gpt_spell_check(text))