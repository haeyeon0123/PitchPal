from TTS.api import TTS
import os
from TTS.utils.manage import ModelManager

manager = ModelManager()
model_path = manager.download_model("tts_models/ko/kss/tacotron2-DDC")

# 저장 디렉토리 생성
os.makedirs("data", exist_ok=True)

# 한국어 TTS 모델 불러오기
tts = TTS(model_name="tts_models/ko/kss/tacotron2-DDC", progress_bar=False)

# 텍스트 → 음성 변환 및 저장
tts.tts_to_file(text="성함이 어떻게 되세요?", file_path="data/sample_tts.wav")
