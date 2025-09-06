import os
import json
from datetime import datetime, timezone, timedelta

def _to_serializable(obj):
    """넘파이/날짜/세트 직렬화 대응"""
    try:
        import numpy as np
        if isinstance(obj, (np.integer, np.floating)):
            return obj.item()
        if isinstance(obj, np.ndarray):
            return obj.tolist()
    except Exception:
        pass
    if isinstance(obj, set):
        return list(obj)
    import datetime as dt
    if isinstance(obj, (dt.datetime, dt.date)):
        return obj.isoformat()
    return obj

def perform_analysis(corrected_text, 
                     html_path="model/content/results/corrected_result.html",
                     json_path="model/content/results/corrected_result.json"):
    """
    발표 원고 내용 분석:
    - HTML에 피드백 추가
    - JSON 파일에도 피드백 저장
    - 피드백은 도입/전개/결론 구분 없이 최대한 자세히 작성
    """
    # system 프롬프트 정의
    system_prompt = """
    당신은 발표 코칭 전문가입니다. 사용자가 제공한 발표 원고를 분석하고, 다음을 수행하세요:

    1. 피드백:
       - 발표 내용 전체를 대상으로 구체적 장점과 개선점을 자세히 작성합니다.
       - 모든 피드백은 한국어로 작성합니다.
       - 점수는 포함하지 말고 종합적으로 평가합니다.
       - 반드시 피드백과 관련된 내용만 포함합니다. (~에 대한 피드백을 드리겠습니다. 등과 같은 내용은 제외)

    2. 점수 부여:
       - 다섯 가지 평가 기준: 논리성, 일관성, 구조화, 전달력, 간결성
       - 각 항목 10점 만점
       - 논리성: 발표 내용의 주장과 근거가 명확히 연결되어 있는지, 주장의 흐름이 논리적으로 구성되었는지 평가
       - 일관성: 문단과 문장 사이의 흐름이 자연스러운지, 동일 주제 내 내용이 일관되게 유지되는지 평가
       - 구조화: 발표가 도입-전개-결론 구조로 잘 구성되어 있는지, 각 부분이 목적에 맞게 적절히 배치되었는지 평가
       - 전달력: 핵심 메시지가 청중에게 명확히 전달되는지, 발표자가 의도한 의미가 충분히 이해되는지 평가
       - 간결성: 불필요한 반복이나 장황한 표현이 없는지, 핵심 내용 중심으로 간결하게 전달되는지 평가

    3. 반드시 JSON 반환:
    {
      "feedback": "발표 내용 피드백 텍스트 (구체적, 개선 포인트 포함)",
      "scores": {
        "논리성": 8,
        "일관성": 9,
        "구조화": 7,
        "전달력": 9,
        "간결성": 8
      }
    }
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
    feedback_json_text = response.choices[0].message.content.strip()

    # GPT가 반환한 JSON 문자열을 실제 JSON 객체로 변환
    try:
        feedback_data = json.loads(feedback_json_text)
    except json.JSONDecodeError:
        feedback_data = {
            "feedback": feedback_json_text,
            "scores": {
                "논리성": None,
                "일관성": None,
                "구조화": None,
                "전달력": None,
                "간결성": None
            }
        }

    # ===== HTML 저장 =====
    os.makedirs(os.path.dirname(html_path), exist_ok=True)
    with open(html_path, 'a', encoding='utf-8') as f:
        f.write(f"""
        <div class="section">
            <h2>발표 내용 피드백</h2>
            <div class="feedback" style="white-space: pre-wrap;">{feedback_data.get('feedback')}</div>
        </div>
        </body></html>
        """)
    print(f"내용 피드백 결과 HTML 저장 완료: {html_path}")

    # ===== JSON 저장 =====
    os.makedirs(os.path.dirname(json_path), exist_ok=True)
    payload = {
        "meta": {
            "created_at": datetime.now(timezone(timedelta(hours=9))).isoformat(),
            "source_text_path": "",  # 필요시 경로 입력
            "html_url": html_path,
            "language": "ko"
        },
        "spell_check": {
            "original_text": "",   # 필요시 원문 입력
            "corrected_text": corrected_text,
            "highlighted_html": "",  # 필요시 강조 HTML 입력
            "num_highlighted_tokens": 0  # 필요시 토큰 수 입력
        },
        "content_feedback": {
            "corrected_text": corrected_text,
            "feedback": feedback_data.get("feedback"),
            "scores": feedback_data.get("scores")
        }
    }

    with open(json_path, "w", encoding="utf-8") as jf:
        json.dump(payload, jf, ensure_ascii=False, indent=2, default=_to_serializable)
    print(f"내용 피드백 결과 JSON 저장 완료: {json_path}")

    return payload