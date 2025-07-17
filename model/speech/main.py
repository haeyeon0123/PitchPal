# 실행
from core.speech_analysis import analyze_speech, detect_filler_words
#from pause_ratio_calculator import calculate_pause_ratio

if __name__ == "__main__":
    audio_path = "data/pitch_sample2.m4a"
    script_path = "data/pitch_sample_script.txt"
    detect_filler_words(audio_path)
    #analyze_speech(audio_path, script_path)
    #calculate_pause_ratio(audio_path)