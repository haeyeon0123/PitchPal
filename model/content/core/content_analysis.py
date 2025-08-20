import os
from dotenv import load_dotenv
from datetime import datetime, timezone, timedelta
from model.speech.utils.serialize import dump_json, ensure_dir

KST = timezone(timedelta(hours=9))

load_dotenv()  # .env 파일 읽기
api_key = os.getenv("OPENAI_API_KEY")
print("API Key:", api_key)  # 실제로 값이 출력되는지 확인

def _get_feedback_with_fallback(corrected_text: str):
    """
    OpenAI가 설정되어 있으면 LLM 피드백 + 점수 평가를, 없으면 기본 엄격 점수/피드백을 반환.
    항상 dict를 반환한다.
    """
    api_key = os.getenv("OPENAI_API_KEY")
    try:
        if api_key:
            from openai import OpenAI  # 지연 임포트
            client = OpenAI(api_key=api_key)

            system_prompt = """
            당신은 발표 코칭 전문가입니다. 사용자가 제공한 발표 원고에 대해 다음을 수행하세요:

            1. 발표 피드백 작성 (항목별: 내용의 일관성, 전개 방식의 논리성, 발표 구성, 주제 적합성, 반복/불필요 내용).
            2. 다섯 가지 평가 기준에 대해 10점 만점으로 점수를 부여하세요. 엄격하게 평가하며, 각 항목에 대해 세부 기준을 명시하세요:
               - 논리성: 주장과 근거가 명확히 연결되어 있는지
               - 일관성: 문단 및 문장 흐름이 자연스러운지
               - 구조화: 도입-전개-결론이 잘 구성되어 있는지
               - 전달력: 핵심 메시지가 명확히 전달되는지
               - 간결성: 불필요한 반복이나 장황한 표현이 없는지
            3. 반드시 JSON 형식으로 반환하세요:
            {
              "feedback": "텍스트 피드백 ...",
              "scores": {
                "논리성": int,
                "일관성": int,
                "구조화": int,
                "전달력": int,
                "간결성": int
              }
            }
            """

            resp = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": corrected_text}
                ],
                temperature=0.3
            )

            import json
            raw_content = resp.choices[0].message.content.strip()

            try:
                parsed = json.loads(raw_content)
                # 점수가 없거나 비정상 값이면 fallback 점수 적용
                scores = parsed.get("scores", {})
                for k in ["논리성", "일관성", "구조화", "전달력", "간결성"]:
                    if k not in scores or not isinstance(scores[k], int):
                        scores[k] = 6  # 기본 엄격 점수
                parsed["scores"] = scores
                return parsed
            except Exception:
                # JSON 파싱 실패 시 fallback
                return {
                    "feedback": raw_content,
                    "scores": {
                        "논리성": 6,
                        "일관성": 6,
                        "구조화": 6,
                        "전달력": 6,
                        "간결성": 6,
                    }
                }

    except Exception as e:
        # OpenAI 호출 실패 시 엄격 폴백
        return {
            "feedback": "LLM 피드백을 불러오지 못했습니다. 발표를 더 명확하고 논리적으로 구성하세요. 반복과 장황함을 줄이세요.",
            "scores": {
                "논리성": 5,
                "일관성": 5,
                "구조화": 5,
                "전달력": 5,
                "간결성": 5,
            }
        }

    # API key가 없을 경우에도 dict 반환
    return {
        "feedback": "OpenAI API 키가 설정되지 않았습니다. 기본 엄격 피드백만 제공합니다.",
        "scores": {
            "논리성": 5,
            "일관성": 5,
            "구조화": 5,
            "전달력": 5,
            "간결성": 5,
        }
    }


def _ensure_html_scaffold(html_path: str):
    if os.path.exists(html_path):
        return
    ensure_dir(html_path)
    skeleton = """<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>교정/피드백 결과</title>
  <style>
    body { font-family: -apple-system, 'Segoe UI', Roboto, 'Noto Sans KR', Arial, sans-serif; margin: 32px; }
    h2 { margin-bottom: 8px; }
    .section { margin-top: 20px; padding: 12px 16px; border: 1px solid #e5e7eb; border-radius: 10px; background: #fafafa; }
    .feedback { white-space: pre-wrap; }
    .scores { margin-top: 10px; }
    .scores table { border-collapse: collapse; }
    .scores td, .scores th { border: 1px solid #ddd; padding: 6px 10px; }
  </style>
</head>
<body>
</body>
</html>
"""
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(skeleton)


def _append_section_to_html(html_path: str, section_html: str):
    with open(html_path, "r", encoding="utf-8") as f:
        html = f.read()
    insert_pt = html.rfind("</body>")
    if insert_pt != -1:
        new_html = html[:insert_pt] + section_html + "\n" + html[insert_pt:]
    else:
        new_html = html + section_html + "\n</body></html>"
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(new_html)


def perform_analysis(corrected_text,
                     html_path="model/content/results/corrected_result.html",
                     json_path="model/content/results/corrected_result.json"):
    """
    발표 원고 내용 분석:
    - HTML에 피드백 섹션 추가
    - JSON 파일에 결과 저장
    """
    # 1) 피드백 + 점수 생성
    result = _get_feedback_with_fallback(corrected_text)
    feedback_text = result.get("feedback", "")
    scores = result.get("scores", {})

    # 2) HTML 저장
    _ensure_html_scaffold(html_path)

    score_html = "<div class='scores'><h3>평가 점수 (10점 만점)</h3><table><tr><th>항목</th><th>점수</th></tr>"
    for k, v in scores.items():
        score_html += f"<tr><td>{k}</td><td>{v}</td></tr>"
    score_html += "</table></div>"

    section = f"""
    <div class="section">
      <h2>발표 내용 피드백</h2>
      <div class="feedback">{feedback_text}</div>
      {score_html}
    </div>
    """
    _append_section_to_html(html_path, section)
    print(f"내용 피드백 결과 HTML 저장 완료: {html_path}")

    # 3) JSON 저장
    payload = {
        "meta": {
            "created_at": datetime.now(KST).isoformat(),
            "language": "ko",
            "html_url": "/" + html_path if not html_path.startswith("/") else html_path,
        },
        "content_feedback": {
            "corrected_text": corrected_text,
            "feedback_text": feedback_text,
            "scores": scores
        }
    }
    dump_json(payload, json_path, ensure_ascii=False, indent=2)
    print(f"내용 피드백 결과 JSON 저장 완료: {json_path}")

    return payload
