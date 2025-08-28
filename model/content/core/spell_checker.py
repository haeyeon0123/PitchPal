import os
import sys
import re
import difflib
import logging
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv
import nltk

# 경로 설정
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))
from model.speech.utils.serialize import dump_json, ensure_dir
from model.content.core import content_analysis  # 기존 모듈

# .env에서 OpenAI API 키 로드
load_dotenv()
KST = timezone(timedelta(hours=9))
logging.basicConfig(level=logging.INFO)

# NLTK punkt / punkt_tab 자동 확인 및 다운로드
for resource in ["punkt", "punkt_tab"]:
    try:
        nltk.data.find(f"tokenizers/{resource}")
    except LookupError:
        nltk.download(resource, quiet=True)

from nltk.tokenize import sent_tokenize


def read_text_file(file_path: str) -> str:
    with open(file_path, 'r', encoding='utf-8') as f:
        return f.read()


def gpt_spell_check_sentence(sentence: str) -> str:
    """
    한 문장 단위 교정.
    한글/영어 혼합 문장에서도 언어 변경 없이 교정.
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        logging.warning("OPENAI_API_KEY가 없습니다. 원문 반환.")
        return sentence

    try:
        from openai import OpenAI
        client = OpenAI(api_key=api_key)

        prompt = (
            "Correct the spelling and grammar of the following text.\n"
            "Keep every word in its original language.\n"
            "Do NOT remove, translate, or change any word's language.\n\n"
            f"{sentence}"
        )

        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2
        )
        corrected = response.choices[0].message.content.strip()
        return corrected

    except Exception as e:
        logging.error(f"GPT 요청 실패: {e}")
        return sentence


def gpt_spell_check(text: str) -> str:
    """
    전체 텍스트를 문장 단위로 나누어 교정
    """
    sentences = sent_tokenize(text)
    corrected_sentences = []

    for sent in sentences:
        sent = sent.strip()
        if not sent:
            continue
        corrected = gpt_spell_check_sentence(sent)
        corrected_sentences.append(corrected)

    # 원문 순서대로 합치기
    return " ".join(corrected_sentences)


def highlight_differences(original: str, corrected: str) -> str:
    """
    원본과 교정된 텍스트를 비교하여 변경된 부분을 <span style="color:red">로 강조
    """
    original_words = re.findall(r"\w+|[^\w\s]", original)
    corrected_words = re.findall(r"\w+|[^\w\s]", corrected)

    matcher = difflib.SequenceMatcher(None, original_words, corrected_words)
    highlighted = []

    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == 'equal':
            highlighted.extend(corrected_words[j1:j2])
        elif tag in ('replace', 'insert'):
            for word in corrected_words[j1:j2]:
                highlighted.append(f'<span style="color:red;">{word}</span>')
        elif tag == 'delete':
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
    logging.info(f"맞춤법 교정 결과 HTML 저장 완료: {output_path}")


def _count_spans(highlighted_html: str) -> int:
    return len(re.findall(r"<span\b", highlighted_html))


def run_spellcheck_and_analysis(input_path: str):
    """
    텍스트 교정 → 하이라이트 HTML 저장 → 내용 분석 호출 → JSON 저장
    """
    original_text = read_text_file(input_path)

    # 1) 교정
    corrected_text = gpt_spell_check(original_text)
    highlighted = highlight_differences(original_text, corrected_text)

    # 2) 내용 분석
    analysis_result = content_analysis.perform_analysis(corrected_text)

    # 3) 저장 경로
    base_dir = "model/content/results"
    html_path = os.path.join(base_dir, "corrected_result.html")
    json_path = os.path.join(base_dir, "corrected_result.json")

    # 4) HTML 저장
    save_html(html_path, original_text, corrected_text, highlighted)

    # 5) JSON 저장
    payload = {
        "meta": {
            "created_at": datetime.now(KST).isoformat(),
            "source_text_path": input_path,
            "html_url": "/" + html_path if not html_path.startswith("/") else html_path,
        },
        "spell_check": {
            "original_text": original_text,
            "corrected_text": corrected_text,
            "highlighted_html": highlighted,
            "num_highlighted_tokens": _count_spans(highlighted)
        },
        "content_feedback": analysis_result
    }
    ensure_dir(json_path)
    dump_json(payload, json_path, ensure_ascii=False, indent=2)
    logging.info(f"맞춤법 교정 + 내용 피드백 JSON 저장 완료: {json_path}")

    return {"html_path": html_path, "json_path": json_path}
