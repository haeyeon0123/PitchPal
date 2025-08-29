import os
import json
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv
from openai import OpenAI
from model.speech.utils.serialize import dump_json, ensure_dir

KST = timezone(timedelta(hours=9))
load_dotenv()
api_key = os.getenv("OPENAI_API_KEY")


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


def _get_feedback_with_fallback(corrected_text):
    """
    GPT 피드백 생성: 항상 한국어 점수 사용, JSON 블록 없는 경우 fallback
    """
    default_scores = {"논리성": 6, "일관성": 6, "구조화": 6, "전달력": 6, "간결성": 6}

    if not api_key:
        return {"feedback": "API 키가 없어 기본 피드백만 제공합니다.", "scores": default_scores}

    try:
        client = OpenAI(api_key=api_key)

        system_prompt = """
        당신은 발표 코칭 전문가입니다. 사용자가 제공한 발표 원고를 분석하고, 다음을 수행하세요:

        1. **피드백 구체화**:
        - 발표의 각 핵심 요소(도입, 전개, 결론)별로 명확히 평가합니다.
        - 장점과 개선점 모두 구체적으로 작성합니다.
        - 모든 피드백은 한국어로 작성합니다.
        - 절대 영어로 변환하지 말고, 한국어 문장은 그대로 유지, 혼합 언어 문장도 그대로 유지합니다.
        - 점수는 포함하지 말고 종합적으로 평가합니다.

        2. **점수 부여**:
        - 다섯 가지 평가 기준(한국어 키 사용): 논리성, 일관성, 구조화, 전달력, 간결성
        - 각 항목 10점 만점
        - 논리성: 발표 내용의 주장과 근거가 명확히 연결되어 있는지, 주장의 흐름이 논리적으로 구성되었는지 평가
        - 일관성: 문단과 문장 사이의 흐름이 자연스러운지, 동일 주제 내 내용이 일관되게 유지되는지 평가
        - 구조화: 발표가 도입-전개-결론 구조로 잘 구성되어 있는지, 각 부분이 목적에 맞게 적절히 배치되었는지 평가
        - 전달력: 핵심 메시지가 청중에게 명확히 전달되는지, 발표자가 의도한 의미가 충분히 이해되는지 평가
        - 간결성: 불필요한 반복이나 장황한 표현이 없는지, 핵심 내용 중심으로 간결하게 전달되는지 평가

        3. **반드시 JSON 반환**:
        ```json
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

        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": corrected_text}
            ],
            temperature=0.3
        )

        raw_content = response.choices[0].message.content.strip()
        if not raw_content:
            return {"feedback": "LLM 피드백 생성 실패.", "scores": default_scores}

        # JSON 블록 추출
        import re
        json_match = re.search(r"\{.*\}", raw_content, re.DOTALL)
        if json_match:
            try:
                parsed = json.loads(json_match.group())
                scores = parsed.get("scores", {})
                for k in default_scores:
                    if k not in scores or not isinstance(scores[k], int):
                        scores[k] = default_scores[k]
                parsed["scores"] = scores
                feedback_text = parsed.get("feedback", "")
                parsed["feedback"] = feedback_text
                return parsed
            except Exception:
                return {"feedback": raw_content, "scores": default_scores}
        else:
            return {"feedback": raw_content, "scores": default_scores}

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
</html>"""
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

    score_keys = ["논리성", "일관성", "구조화", "전달력", "간결성"]

    result = _get_feedback_with_fallback(corrected_text)
    feedback_text = result.get("feedback", "")
    scores = result.get("scores", {k: 6 for k in score_keys})

    # ===== HTML 저장 =====
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

    # ===== JSON 저장 (dump_json 호환) =====
    payload = {
        "meta": {
            "created_at": datetime.now(KST).isoformat(),
            "language": "ko"
        },
        "content_feedback": {
            "corrected_text": corrected_text,
            "feedback_text": feedback_text,
            "scores": scores
        }
    }

    # json.dumps → 문자열 전달
    ensure_dir(json_path)
    serialized_payload = json.dumps(payload, ensure_ascii=False, indent=2, default=_to_serializable)
    dump_json(serialized_payload, json_path)
    print(f"내용 피드백 결과 JSON 저장 완료: {json_path}")

    return payload
