from core import spell_checker

if __name__ == "__main__":
    # 분석할 텍스트 경로
    txt_path = "data/pitch_sample_script.txt"

    # spell_checker에서 처리 시작
    spell_checker.run_spellcheck_and_analysis(txt_path)
