import matplotlib.pyplot as plt
import seaborn as sns
import numpy as np

sns.set(style="whitegrid")

# 1. MFCC Visualization
def plot_mfcc_features(mfcc_mean, mfcc_std):
    x = np.arange(1, len(mfcc_mean) + 1)

    plt.figure(figsize=(10, 4))
    plt.errorbar(
        x, mfcc_mean, yerr=mfcc_std, fmt='o-', ecolor='gray', capsize=5,
        label="MFCC Mean ± Std Dev"
    )
    plt.title("MFCC Coefficient Analysis")
    plt.xlabel("MFCC Coefficient (1–13)")
    plt.ylabel("Value")
    plt.xticks(x)
    plt.legend()
    plt.tight_layout()
    plt.show()

# 2. Pitch Visualization
def plot_pitch_summary(pitch_mean, pitch_std):
    plt.figure(figsize=(6, 4))
    y_min = pitch_mean - pitch_std
    y_max = pitch_mean + pitch_std

    # 평균값 선 (파란색 실선)
    plt.axhline(y=pitch_mean, color='blue', linestyle='-', linewidth=2, label="Pitch Mean")

    # 표준편차 영역 (회색 음영)
    plt.fill_between([0, 1], y_min, y_max, color='lightgray', alpha=0.5, label="±1 Std Dev")

    plt.xlim(0, 1)
    plt.ylim(0, y_max * 1.2)
    plt.ylabel("Pitch (Hz)")
    plt.title("Pitch Mean and Variability")
    plt.legend()
    plt.tight_layout()
    plt.show()

# 3. Summary Metrics Visualization
def plot_summary_metrics(wpm, pronunciation_accuracy, filler_count):
    labels = ["Speech Rate (WPM)", "Pronunciation Accuracy (%)", "Filler Words"]
    values = [wpm, pronunciation_accuracy * 100, filler_count]

    colors = ["#8BC34A", "#03A9F4", "#FF5722"]

    plt.figure(figsize=(8, 4))
    sns.barplot(x=labels, y=values, palette=colors)
    plt.title("Speech Analysis Summary")
    plt.ylabel("Value")
    plt.ylim(0, max(values) * 1.2)
    plt.tight_layout()
    plt.show()
