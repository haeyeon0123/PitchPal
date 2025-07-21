import os

def perform_analysis(corrected_text, html_path="model/content/results/corrected_result.html"):

    # system 프롬프트 정의
    system_prompt = """
    당신은 발표 코칭 전문가입니다. 사용자가 제공한 발표 원고에 대해 다음 항목을 중심으로 피드백을 작성하세요:
    - 내용의 일관성
    - 전개 방식의 논리성
    - 발표 구성의 적절성 (도입-전개-결론)
    - 주제에서 벗어난 부분 여부
    - 반복적이거나 불필요한 내용

    각 항목별로 제목을 붙여 구분하고, 피드백에는 반드시 구체적인 문장 예시를 포함하세요.
    """

    # GPT 요청
    from openai import OpenAI
    from dotenv import load_dotenv
    load_dotenv()
    api_key = os.getenv("OPENAI_API_KEY")
    client = OpenAI(api_key=api_key)

    response = client.chat.completions.create(
        model="gpt-3.5-turbo",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": corrected_text}
        ],
        temperature=0.5
    )
    feedback_text = response.choices[0].message.content.strip()

    # HTML 이어쓰기
    with open(html_path, 'a', encoding='utf-8') as f:
        f.write(f"""
        <div class="section">
            <h2>발표 내용 피드백</h2>
            <div class="feedback" style="white-space: pre-wrap;">{feedback_text}</div>
        </div>
        </body></html>
        """)

    print(f"내용 피드백 결과 HTML 저장 완료: {html_path}")
