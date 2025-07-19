from total_temp import SpeechAnalyzer

if __name__ == "__main__":
    analyzer = SpeechAnalyzer("data/test1.m4a", "data/test1.txt", model_size="medium")
    results = analyzer.summarize()

    for k, v in results.items():
        print(f"{k}: {v}")
