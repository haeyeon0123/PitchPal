import os, sys

try:
    from model.content.core import content_analysis
except ModuleNotFoundError:
    try:
        from . import content_analysis
    except Exception:
        ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
        if ROOT not in sys.path:
            sys.path.insert(0, ROOT)
        from model.content.core import content_analysis
        
from datetime import datetime, timezone, timedelta
from model.speech.utils.serialize import dump_json, ensure_dir

KST = timezone(timedelta(hours=9))

def _get_feedback_with_fallback(corrected_text: str) -> str:
    """
    OpenAI가 설정되어 있으면 LLM 피드백을, 없으면 간단한 휴리스틱 피드백을 반환.
    """
    api_key = os.getenv("OPENAI_API_KEY")
    try:
        if api_key:
            from openai import OpenAI  # 지연 임포트
            client = OpenAI(api_key=api_key)

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
            resp = client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": corrected_text}
                ],
                temperature=0.5
            )
            return resp.choices[0].message.content.strip()
    except Exception as e:
        # OpenAI 호출 실패 시 폴백으로 진행
        pass


def _ensure_html_scaffold(html_path: str):
    """
    기존 파일이 없으면 기본 HTML 스켈레톤을 생성한다.
    기존 파일이 있으면 아무 것도 하지 않는다.
    """
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
  </style>
</head>
<body>
</body>
</html>
"""
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(skeleton)


def _append_section_to_html(html_path: str, section_html: str):
    """
    HTML 파일의 </body> 직전에 section_html을 삽입한다.
    </body> 태그가 없으면 맨 끝에 section_html과 함께 </body></html>를 추가한다.
    """
    with open(html_path, "r", encoding="utf-8") as f:
        html = f.read()

    insert_pt = html.rfind("</body>")
    if insert_pt != -1:
        new_html = html[:insert_pt] + section_html + "\n" + html[insert_pt:]
    else:
        # 비정상 파일 구조 방어
        new_html = html + section_html + "\n</body></html>"

    with open(html_path, "w", encoding="utf-8") as f:
        f.write(new_html)


def perform_analysis(corrected_text, 
                     html_path="model/content/results/corrected_result.html",
                     json_path="model/content/results/corrected_result.json"):
    """
    발표 원고 내용 분석:
    - HTML에 피드백 섹션을 추가(파일 없으면 스켈레톤 자동 생성)
    - JSON 파일에도 피드백 저장 (utils.serialize.dump_json 사용)
    """
    # 1) 피드백 생성 (OpenAI → 폴백 순)
    feedback_text = _get_feedback_with_fallback(corrected_text)

    # 2) HTML 저장
    _ensure_html_scaffold(html_path)
    section = f"""
    <div class="section">
      <h2>발표 내용 피드백</h2>
      <div class="feedback">{feedback_text}</div>
    </div>
    """
    _append_section_to_html(html_path, section)
    print(f"내용 피드백 결과 HTML 저장 완료: {html_path}")

    # 3) JSON 저장 (공통 직렬화 유틸 사용)
    payload = {
        "meta": {
            "created_at": datetime.now(KST).isoformat(),
            "language": "ko",
            "html_url": "/" + html_path if not html_path.startswith("/") else html_path,
        },
        "content_feedback": {
            "corrected_text": corrected_text,
            "feedback_text": feedback_text
        }
    }
    dump_json(payload, json_path, ensure_ascii=False, indent=2)
    print(f"내용 피드백 결과 JSON 저장 완료: {json_path}")

    return payload
