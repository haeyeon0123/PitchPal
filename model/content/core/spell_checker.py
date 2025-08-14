import os, sys

try:
    from model.speech.utils.serialize import dump_json, ensure_dir
except ModuleNotFoundError:
    try:
        from ...speech.utils.serialize import dump_json, ensure_dir  # when run as package
    except Exception:
        ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
        if ROOT not in sys.path:
            sys.path.insert(0, ROOT)
        from model.speech.utils.serialize import dump_json, ensure_dir  # final attempt
        
import re
import difflib
from datetime import datetime, timezone, timedelta

from dotenv import load_dotenv
from model.speech.utils.serialize import dump_json, ensure_dir
from model.content.core import content_analysis  # 기존 경로 유지

# .env에서 OpenAI API 키 로드
load_dotenv()
KST = timezone(timedelta(hours=9))

def read_text_file(file_path: str) -> str:
    with open(file_path, 'r', encoding='utf-8') as f:
        return f.read()
    

def gpt_spell_check(text: str) -> str:
    """
    GPT를 이용한 맞춤법/문장 교정.
    - OPENAI_API_KEY가 없거나, 호출 실패 시 원문을 그대로 반환(폴백).
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return text  # 폴백

    try:
        from openai import OpenAI  # 지연 임포트
        client = OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "user", "content": f"다음 문장의 맞춤법과 문장을 자연스럽게 고쳐 주세요:\n\n{text}"}
            ],
            temperature=0.2
        )
        return response.choices[0].message.content.strip()
    except Exception:
        # API 호출 실패 시에도 폴백
        return text
    

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


def highlight_differences(original: str, corrected: str) -> str:
    """
    원본과 교정된 텍스트를 비교하여 변경된 부분을 <span style="color:red">로 강조.
    단어 시퀀스 매칭 기반 단순 하이라이팅.
    """
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
            # 삭제 단어는 표시하지 않음
            continue

    return ' '.join(highlighted)


def save_html(output_path: str, original: str, corrected: str, highlighted_text: str):
    ensure_dir(output_path)

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
            h1 {{ color: #333366; }}
            .section {{
                background: white;
                padding: 20px;
                margin-bottom: 20px;
                border-radius: 8px;
                box-shadow: 0 2px 5px rgba(0,0,0,0.1);
                white-space: pre-wrap;
            }}
            .highlight span {{ font-weight: bold; }}
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


def _count_spans(highlighted_html: str) -> int:
    """하이라이트된 단어(<span ...>) 개수를 간단한 수정 건수로 집계"""
    return len(re.findall(r"<span\b", highlighted_html))


def run_spellcheck_and_analysis(input_path: str):
    """
    텍스트 교정 → 하이라이트 HTML 저장 → 내용 분석(perform_analysis) 호출 → JSON 저장
    """
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
            "created_at": datetime.now(KST).isoformat(),
            "source_text_path": input_path,
            "language": "ko",
            "html_url": "/" + html_path if not html_path.startswith("/") else html_path,
        },
        "spell_check": {
            "original_text": original_text,
            "corrected_text": corrected_text,
            "highlighted_html": highlighted,
            "num_highlighted_tokens": _count_spans(highlighted)
        },
        "content_feedback": analysis_result  # dict 형태 권장
    }
    ensure_dir(json_path)
    dump_json(payload, json_path, ensure_ascii=False, indent=2)
    print(f"맞춤법 교정 + 내용 피드백 JSON 저장 완료: {json_path}")

    # 필요 시 반환
    return {"html_path": html_path, "json_path": json_path}
