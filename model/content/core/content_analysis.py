import os
import json
import re
from dotenv import load_dotenv
from datetime import datetime, timezone, timedelta
from langdetect import detect
from model.speech.utils.serialize import dump_json, ensure_dir

KST = timezone(timedelta(hours=9))
load_dotenv()

api_key = os.getenv("OPENAI_API_KEY")
print("API Key:", "설정됨" if api_key else "없음")


def _get_feedback_with_fallback(text: str):
    """
    GPT를 이용한 발표 피드백 + 점수 생성.
    - 항상 한국어 점수 키 사용
    - JSON 블록 없이 반환되더라도 fallback 처리
    - 반환: {"feedback": str, "scores": dict}
    """
    default_scores = {"논리성": 6, "일관성": 6, "구조화": 6, "전달력": 6, "간결성": 6}

    if not api_key:
        return {"feedback": "API 키가 없어 기본 피드백만 제공합니다.", "scores": default_scores}

    try:
        from openai import OpenAI
        client = OpenAI(api_key=api_key)

        # 한국어 시스템 프롬프트: 반드시 JSON 형식으로 반환
        system_prompt = """
        당신은 발표 코칭 전문가입니다. 사용자가 제공한 발표 원고에 대해 다음을 수행하세요:

        1. 발표 내용에 대한 피드백 구체적으로 작성 (내용의 일관성, 논리성, 구조, 전달력, 간결성 중심)
        2. 다섯 가지 평가 기준에 대해 10점 만점으로 점수 부여
           - 논리성, 일관성, 구조화, 전달력, 간결성
        3. 반드시 JSON 형식으로 반환
        예시:
        {
            "feedback": "발표 내용이 명확하고 논리적입니다.",
            "scores": {
                "논리성": 9,
                "일관성": 8,
                "구조화": 8,
                "전달력": 9,
                "간결성": 8
            }
        }
        """

        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": text}
            ],
            temperature=0.3
        )

        raw_content = response.choices[0].message.content.strip()
        if not raw_content:
            return {"feedback": "LLM 피드백 생성 실패. 텍스트를 더 명확하고 논리적으로 구성하세요.",
                    "scores": default_scores}

        # JSON 블록 추출
        json_match = re.search(r"\{.*\}", raw_content, re.DOTALL)
        if json_match:
            try:
                parsed = json.loads(json_match.group())
                # scores 유효성 검사
                scores = parsed.get("scores", {})
                for k in default_scores:
                    if k not in scores or not isinstance(scores[k], int):
                        scores[k] = default_scores[k]
                parsed["scores"] = scores

                feedback_text = parsed.get("feedback", "")
                if isinstance(feedback_text, dict):
                    feedback_text = "LLM 피드백 생성 실패. 텍스트를 더 명확하고 논리적으로 구성하세요."
                parsed["feedback"] = feedback_text
                return parsed
            except Exception:
                # JSON 파싱 실패 fallback
                return {"feedback": raw_content, "scores": default_scores}
        else:
            # JSON 블록 없는 경우 fallback
            # 텍스트 내 점수 추출 시도
            scores = default_scores.copy()
            score_matches = re.findall(r"논리성[:\s]*(\d+)", raw_content)
            if score_matches:
                try:
                    scores["논리성"] = int(score_matches[0])
                except:
                    pass
            # 나머지 점수도 비슷한 방식으로 필요시 추출 가능
            return {"feedback": raw_content, "scores": scores}

    except Exception as e:
        return {"feedback": f"LLM 피드백 생성 실패: {str(e)}", "scores": default_scores}



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
    new_html = html[:insert_pt] + section_html + "\n" + html[insert_pt:]
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(new_html)


def perform_analysis(corrected_text,
                     html_path="model/content/results/corrected_result.html",
                     json_path="model/content/results/corrected_result.json"):
    """
    발표 원고 분석 → HTML & JSON 저장
    피드백 텍스트는 항상 한국어, 점수는 10점 기준 한국어 키
    """
    score_keys = ["논리성","일관성","구조화","전달력","간결성"]

    result = _get_feedback_with_fallback(corrected_text)
    feedback_text = result.get("feedback", "")
    scores = result.get("scores", {k: 6 for k in score_keys})

    # HTML 저장
    _ensure_html_scaffold(html_path)
    score_html = "<div class='scores'><h3>평가 점수 (10점 만점)</h3><table><tr><th>항목</th><th>점수</th></tr>"
    for k in score_keys:
        score_html += f"<tr><td>{k}</td><td>{scores.get(k, 6)}</td></tr>"
    score_html += "</table></div>"

    section = f"""
    <div class="section">
      <h2>발표 내용 피드백 (한국어)</h2>
      <div class="feedback">{feedback_text}</div>
      {score_html}
    </div>
    """
    _append_section_to_html(html_path, section)
    print(f"내용 피드백 결과 HTML 저장 완료: {html_path}")

    # JSON 저장
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
    ensure_dir(json_path)
    dump_json(payload, json_path, ensure_ascii=False, indent=2)
    print(f"내용 피드백 결과 JSON 저장 완료: {json_path}")

    return payload
