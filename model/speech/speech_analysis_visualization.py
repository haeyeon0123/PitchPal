import matplotlib.pyplot as plt
import seaborn as sns
import numpy as np

# 스타일 설정
sns.set(style="whitegrid")

# 1. MFCC 시각화
def plot_mfcc_features(mfcc_mean, mfcc_std):
    x = np.arange(1, len(mfcc_mean) + 1)

    plt.figure(figsize=(10, 4))
    plt.errorbar(x, mfcc_mean, yerr=mfcc_std, fmt='o-', ecolor='gray', capsize=5, label="MFCC 평균 ± 표준편차")
    plt.title("MFCC 계수 분석")
    plt.xlabel("MFCC 계수 (1~13)")
    plt.ylabel("값")
    plt.xticks(x)
    plt.legend()
    plt.tight_layout()
    plt.show()

# 2. Pitch 시각화
def plot_pitch_summary(pitch_mean, pitch_std):
    plt.figure(figsize=(6, 4))
    plt.bar(["Pitch 평균 (Hz)"], [pitch_mean], yerr=[pitch_std], capsize=10, color="skyblue")
    plt.title("Pitch 평균 및 표준편차")
    plt.ylabel("Hz")
    plt.tight_layout()
    plt.show()

# 3. WPM, 발음 정확도, 추임새 수 시각화
def plot_summary_metrics(wpm, pronunciation_accuracy, filler_count):
    labels = ["발화 속도 (WPM)", "발음 정확도 (%)", "추임새 수"]
    values = [wpm, pronunciation_accuracy * 100, filler_count]

    colors = ["#8BC34A", "#03A9F4", "#FF5722"]

    plt.figure(figsize=(8, 4))
    sns.barplot(x=labels, y=values, palette=colors)
    plt.title("발표 주요 지표 요약")
    plt.ylabel("값")
    plt.ylim(0, max(values) * 1.2)
    plt.tight_layout()
    plt.show()
