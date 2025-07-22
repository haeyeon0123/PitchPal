import librosa
import numpy as np
from faster_whisper import WhisperModel
from model.speech.utils.text_utils import evaluate_pronunciation, normalize_word

class SpeechAnalyzer:
    def __init__(self, audio_path, reference_text_path, model_size="small"):
        self.audio_path = audio_path
        self.reference_text = self._load_text(reference_text_path)

        self.model = WhisperModel(model_size, device="cpu", compute_type="int8")
        self.segments, self.transcription_info = self.model.transcribe(audio_path, word_timestamps=True)

        self.audio, self.sr = librosa.load(audio_path, sr=16000)

        self.word_infos = [w for seg in self.segments for w in seg.words]
        self.transcribed_text = " ".join([seg.text.strip() for seg in self.segments])

        self.non_silent_intervals = librosa.effects.split(self.audio, top_db=30)
        self.total_duration_sec = len(self.audio) / self.sr
        self.active_speech_duration_sec = sum((end - start) for start, end in self.non_silent_intervals) / self.sr

    def _load_text(self, path):
        with open(path, 'r', encoding='utf-8') as f:
            return f.read()

    def extract_mfcc(self):
        mfccs = librosa.feature.mfcc(y=self.audio, sr=self.sr, n_mfcc=13)
        return np.mean(mfccs.T, axis=0), np.std(mfccs.T, axis=0)

    def extract_pitch(self):
        pitches, magnitudes = librosa.piptrack(y=self.audio, sr=self.sr)
        pitch_values = pitches[magnitudes > np.median(magnitudes)]
        return (np.mean(pitch_values), np.std(pitch_values)) if len(pitch_values) > 0 else (0, 0)

    def estimate_wpm(self):
        if self.active_speech_duration_sec == 0:
            return 0.0
        word_count = len(self.transcribed_text.split())
        return (word_count / self.active_speech_duration_sec) * 60

    def calculate_pause_ratio(self):
        return 1 - (self.active_speech_duration_sec / self.total_duration_sec)

    def detect_filler_words(self, fillers=None, min_duration=0.4):
        if fillers is None:
            fillers = ["음", "어", "그", "저", "이", "아", "흠", "으음", "어어"]

        filler_count = 0
        filler_occurrences = []

        for word in self.word_infos:
            raw = word.word.lower()
            norm_word = normalize_word(raw)
            duration = word.end - word.start

            if norm_word in fillers and duration >= min_duration:
                filler_count += 1
                filler_occurrences.append((norm_word, word.start, word.end))

        return filler_count, filler_occurrences

    def evaluate_pronunciation_accuracy(self):
        return evaluate_pronunciation(self.reference_text, self.transcribed_text)

    def summarize(self):
        mfcc_mean, mfcc_std = self.extract_mfcc()
        pitch_mean, pitch_std = self.extract_pitch()
        wpm = self.estimate_wpm()
        pause_ratio = self.calculate_pause_ratio()
        filler_count, filler_occurrences = self.detect_filler_words()
        pronunciation_accuracy = self.evaluate_pronunciation_accuracy()

        return {
            "MFCC Mean": mfcc_mean,
            "MFCC Std": mfcc_std,
            "Pitch Mean": pitch_mean,
            "Pitch Std": pitch_std,
            "WPM": wpm,
            "Pause Ratio": pause_ratio,
            "Filler Count": filler_count,
            "Filler Words": filler_occurrences,
            "Pronunciation Accuracy": pronunciation_accuracy,
            "Transcribed Text": self.transcribed_text,
        }
