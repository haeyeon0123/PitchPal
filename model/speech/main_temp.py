from total_temp import SpeechAnalyzer

if __name__ == "__main__":
    analyzer = SpeechAnalyzer("data/pitch_sample.m4a", "data/pitch_sample_script.txt", model_size="medium")
    results = analyzer.summarize()

    for k, v in results.items():
        print(f"{k}: {v}")
