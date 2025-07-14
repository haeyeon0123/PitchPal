import librosa
import numpy as np
from model.speech.stt_pronounciation import transcribe_audio, evaluate_pronunciation, highlight_differences

def load_audio(audio_path):
    audio, sr = librosa.load(audio_path, sr=16000)
    return audio, sr

def extract_mfcc(audio, sr):
    mfccs = librosa.feature.mfcc(y=audio, sr=sr, n_mfcc=13)
    mfccs_mean = np.mean(mfccs.T, axis=0)
    mfccs_std = np.std(mfccs.T, axis=0)
    return mfccs_mean, mfccs_std

def extract_pitch(audio, sr):
    pitches, magnitudes = librosa.piptrack(y=audio, sr=sr)
    pitch_values = pitches[magnitudes > np.median(magnitudes)]
    if len(pitch_values) == 0:
        return np.array([0])
    pitch_mean = np.mean(pitch_values)
    pitch_std = np.std(pitch_values)
    return pitch_mean, pitch_std

def estimate_wpm(audio_path, transcript):
    audio, sr = librosa.load(audio_path, sr=16000)
    audio_duration_sec = librosa.get_duration(y=audio, sr=sr)
    word_count = len(transcript.split())
    wpm = (word_count / audio_duration_sec) * 60
    return wpm

def analyze_speech(audio_path, script_path, target_wpm=140):
    with open(script_path, "r", encoding="utf-8") as f:
        script = f.read().strip()

    # STT 수행
    transcript = transcribe_audio(audio_path)
    print(f"\n[STT 변환 결과]\n{transcript}\n")

    audio, sr = load_audio(audio_path)
    mfcc_mean, mfcc_std = extract_mfcc(audio, sr)
    pitch_mean, pitch_std = extract_pitch(audio, sr)
    wpm = estimate_wpm(audio_path, transcript)
    
    print(f"[음성 분석 결과]")
    print(f"MFCC Features (Mean): {mfcc_mean}")
    print(f"MFCC Features (STD): {mfcc_std}")
    print(f"Pitch Features (Mean): {pitch_mean}")
    print(f"Pitch Features (STD): {pitch_std}")
    print(f"Words Per Minute: {wpm:.2f}")

    # 유사도 점수 출력
    pronunciation_accuracy = evaluate_pronunciation(script, transcript)
    print("\n✅ 발음 유사도 점수 (공백 및 문장 부호 무시): {:.2f}%".format(pronunciation_accuracy * 100))

    # 시각화 출력
    highlight_differences(script, transcript)

    print("\n[발표 평가]")
    if np.mean(mfcc_mean) > 0.2 and pitch_mean > 70 and wpm > 90 and pronunciation_accuracy > 0.7:
        print("✅ 발음, 억양, 속도 모두 잘 조화되어 있습니다! 발표가 자연스럽습니다.")
    elif np.mean(mfcc_mean) > 0.1:
        print("🔶 발음은 좋습니다! 억양과 속도를 더 조정하면 좋겠습니다.")
    elif pronunciation_accuracy > 0.5:
        print("🔶 발음은 괜찮은 편입니다! 억양과 속도를 자연스럽게 조정해보세요.")
    else:
        print("❌ 발음, 억양, 속도에 더 많은 연습이 필요합니다.")
