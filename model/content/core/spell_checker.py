import os
import re
import json
import difflib
from dotenv import load_dotenv
from openai import OpenAI
from . import content_analysis

# .env에서 OpenAI API 키 로드
from pathlib import Path
import os, httpx
from dotenv import load_dotenv, find_dotenv
from openai import OpenAI

from pathlib import Path
import os, httpx
from dotenv import load_dotenv
from openai import OpenAI

# ---- .env 강제 로드 (repo 루트) ----
ROOT = Path(__file__).resolve().parents[3]   # .../PitchPal
ENV_PATH = ROOT / ".env"
load_dotenv(ENV_PATH)  # 존재하지 않으면 False를 반환

api_key = os.getenv("OPENAI_API_KEY")
if not api_key:
    raise RuntimeError(f"OPENAI_API_KEY가 비어있습니다. .env 위치 확인: {ENV_PATH}")

# ---- httpx 0.28+ 방식으로 프록시/클라이언트 구성 ----
proxy_url = os.getenv("HTTPS_PROXY") or os.getenv("HTTP_PROXY") or os.getenv("ALL_PROXY")
if proxy_url:
    transport = httpx.HTTPTransport(proxy=proxy_url)
    http_client = httpx.Client(transport=transport, timeout=60.0, trust_env=False)
else:
    http_client = httpx.Client(timeout=60.0, trust_env=False)

client = OpenAI(api_key=api_key, http_client=http_client)


def read_text_file(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        return f.read()

def gpt_spell_check(text):
    """GPT를 이용한 맞춤법 및 문장 교정"""
    response = client.chat.completions.create(
        model="gpt-3.5-turbo",
        messages=[
            {"role": "user", "content": f"다음 문장의 맞춤법과 문장을 자연스럽게 고쳐 주세요:\n\n{text}"}
        ],
        temperature=0.2
    )
    return response.choices[0].message.content.strip()

def highlight_differences(original, corrected):
    """원본과 교정된 텍스트를 비교하여 변경된 부분을 <span style="color:red">로 강조"""
    original_words = original.split()
    corrected_words = corrected.split()

    matcher = difflib.SequenceMatcher(None, original_words, corrected_words)
    highlighted = []

    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == 'equal':
            highlighted.extend(corrected_words[j1:j2])
        elif tag in ('replace', 'insert'):
            for word in corrected_words[j1:j2]:
                highlighted.append(f'<span style="color:red;">{word}</span>')
        elif tag == 'delete':
            continue  # 삭제된 단어는 표시하지 않음

    return ' '.join(highlighted)

def save_html(output_path, original, corrected, highlighted_text):
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    html_content = f"""
    <!DOCTYPE html>
    <html lang="ko">
    <head>
        <meta charset="UTF-8">
        <title>맞춤법 교정 결과</title>
        <style>
            body {{
                font-family: Arial, sans-serif;
                margin: 40px;
                background-color: #f9f9f9;
                color: #333;
            }}
            h1 {{
                color: #333366;
            }}
            .section {{
                background: white;
                padding: 20px;
                margin-bottom: 20px;
                border-radius: 8px;
                box-shadow: 0 2px 5px rgba(0,0,0,0.1);
                white-space: pre-wrap;
            }}
            .highlight span {{
                font-weight: bold;
            }}
        </style>
    </head>
    <body>
        <h1>맞춤법 교정 결과</h1>
        <div class="section">
            <h2>원본 텍스트</h2>
            <div>{original}</div>
        </div>
        <div class="section">
            <h2>교정된 텍스트</h2>
            <div>{corrected}</div>
        </div>
        <div class="section highlight">
            <h2>교정 강조 표시 (빨간색)</h2>
            <div>{highlighted_text}</div>
        </div>
    </body>
    </html>
    """

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html_content)

    print(f"맞춤법 교정 결과 HTML 저장 완료: {output_path}")

# ===== JSON 저장 유틸 =====
def _to_serializable(obj):
    """넘파이/세트/날짜 등 직렬화 안전 변환"""
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
    # datetime은 content_analysis 쪽에서 반환할 수도 있어 대비
    import datetime
    if isinstance(obj, (datetime.datetime, datetime.date)):
        return obj.isoformat()
    return obj

def save_json(output_path, payload):
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2, default=_to_serializable)
    print(f"맞춤법 교정 + 내용 피드백 JSON 저장 완료: {output_path}")

def _count_spans(highlighted_html: str) -> int:
    """하이라이트된 단어(<span ...>) 개수를 간단한 수정 건수로 집계"""
    return len(re.findall(r"<span\b", highlighted_html))

def run_spellcheck_and_analysis(input_path):
    """main.py에서 호출: 텍스트 교정 후 content_analysis로 전달 + JSON/HTML 저장"""
    original_text = read_text_file(input_path)

    # 1) 교정
    corrected_text = gpt_spell_check(original_text)
    highlighted = highlight_differences(original_text, corrected_text)

    # 2) 내용 분석 (core.content_analysis 사용)
    # perform_analysis()가 dict를 반환한다고 가정.
    # 만약 HTML을 반환한다면 content_analysis에 "dict 반환" 옵션을 추가하는 걸 추천.
    analysis_result = content_analysis.perform_analysis(corrected_text)

    # 3) 저장 경로
    base_dir = "model/content/results"
    html_path = os.path.join(base_dir, "corrected_result.html")
    json_path = os.path.join(base_dir, "corrected_result.json")

    # 4) HTML 저장(기존 그대로)
    save_html(html_path, original_text, corrected_text, highlighted)

    # 5) JSON 저장(동일 정보 + 분석 결과)
    payload = {
        "meta": {
            "source_text_path": input_path,
            "language": "ko"
        },
        "spell_check": {
            "original_text": original_text,
            "corrected_text": corrected_text,
            "highlighted_html": highlighted,
            "num_highlighted_tokens": _count_spans(highlighted)
        },
        "content_feedback": analysis_result  # dict 형태 권장
    }
    save_json(json_path, payload)

    # 필요 시 반환
    return {"html_path": html_path, "json_path": json_path}
