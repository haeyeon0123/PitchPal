import os
import difflib
from dotenv import load_dotenv
from openai import OpenAI
from core import content_analysis

# .env에서 OpenAI API 키 로드
load_dotenv()
api_key = os.getenv("OPENAI_API_KEY")
client = OpenAI(api_key=api_key)

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

def run_spellcheck_and_analysis(input_path):
    """main.py에서 호출: 텍스트 교정 후 content_analysis로 전달"""
    original_text = read_text_file(input_path)

    corrected_text = gpt_spell_check(original_text)
    highlighted = highlight_differences(original_text, corrected_text)

    output_path = "model/content/results/corrected_result.html"
    save_html(output_path, original_text, corrected_text, highlighted)

    content_analysis.perform_analysis(corrected_text)
