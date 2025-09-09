# model/emotion/real_time_video_adapter.py
from __future__ import annotations
import os, json
from pathlib import Path
from typing import Dict, Any, List

import cv2
import numpy as np
from keras.preprocessing.image import img_to_array
from keras.models import load_model
from pathlib import Path
from collections import Counter

BASE = Path(__file__).resolve().parents[1]   # model/emotion/.. → model
HAAR_PATH = str(BASE / "emotion" / "haarcascade_files" / "haarcascade_frontalface_default.xml")
MODEL_PATH = str(BASE / "emotion" / "models" / "_mini_XCEPTION.102-0.66.hdf5")

_FACE_DETECTOR = None
_EMO_MODEL = None
_EMOTIONS = ["angry", "disgust", "scared", "happy", "sad", "surprised", "neutral"]
_NEGATIVE = {"angry", "disgust", "scared", "sad", "surprised"}
_WARNING = {
    "angry": "화난 표정 비중이 높아요. 보다 평온하고 중립적인 표정을 권장합니다.",
    "disgust": "불쾌한 표정 비중이 높아요. 보다 평온하고 중립적인 표정을 권장합니다.",
    "scared": "두려운 표정 비중이 높아요. 보다 평온하고 중립적인 표정을 권장합니다.",
    "sad": "슬픈 표정 비중이 높아요. 보다 평온하고 중립적인 표정을 권장합니다.",
    "surprised": "놀란 표정 비중이 높아요. 보다 평온하고 중립적인 표정을 권장합니다.",
}

def _ensure_models():
    global _FACE_DETECTOR, _EMO_MODEL
    if _FACE_DETECTOR is None:
        if not Path(HAAR_PATH).exists():
            raise FileNotFoundError(f"haar cascade not found: {HAAR_PATH}")
        _FACE_DETECTOR = cv2.CascadeClassifier(HAAR_PATH)
    if _EMO_MODEL is None:
        if not Path(MODEL_PATH).exists():
            raise FileNotFoundError(f"emotion model not found: {MODEL_PATH}")
        _EMO_MODEL = load_model(MODEL_PATH, compile=False)

def run_emotion_analysis(
    video_path: str,
    *,
    out_dir: str | Path,
    save_timeline: bool = False,
    timeline_every_s: int = 1
) -> Dict[str, Any]:
    _ensure_models()
    out_dir = Path(out_dir); out_dir.mkdir(parents=True, exist_ok=True)

    cap = cv2.VideoCapture(str(video_path))
    fps = cap.get(cv2.CAP_PROP_FPS) or 0.0
    if not fps or fps <= 0: fps = 30.0

    emotion_list: List[str] = []
    timeline: List[Dict[str, Any]] = []
    frame_idx = 0
    sample_every = max(1, int(fps * timeline_every_s))

    while cap.isOpened():
        ok, frame = cap.read()
        if not ok or frame is None: break
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = _FACE_DETECTOR.detectMultiScale(gray, scaleFactor=1.05, minNeighbors=3, minSize=(30,30), flags=cv2.CASCADE_SCALE_IMAGE)
        if len(faces) > 0:
            faces = sorted(faces, reverse=True, key=lambda x: x[2]*x[3])
            fX,fY,fW,fH = faces[0]
            roi = gray[fY:fY+fH, fX:fX+fW]
            try:
                roi = cv2.resize(roi, (64,64))
            except:
                frame_idx += 1; continue
            roi = (roi.astype("float32")/255.0)
            roi = img_to_array(roi)[None, ...]
            preds = _EMO_MODEL.predict(roi, verbose=0)[0]
            label = _EMOTIONS[int(np.argmax(preds))]
            emotion_list.append(label)
            if save_timeline and (frame_idx % sample_every == 0):
                timeline.append({"t_sec": round(frame_idx / fps, 2), "emotion": label})
        frame_idx += 1
    cap.release()

    res: Dict[str, Any] = {
        "fps": float(fps),
        "frames_total": int(frame_idx),
        "frames_with_prediction": int(len(emotion_list)),
        "estimated_duration_sec": round(frame_idx / fps, 2) if fps > 0 else None,
    }

    if emotion_list:
        cnt = Counter(emotion_list); total = sum(cnt.values())
        top = cnt.most_common(1)[0][0]
        neg = sum(int(cnt.get(e, 0)) for e in _NEGATIVE)
        res.update({
            "most_common_emotion": top,
            "warning": _WARNING.get(top, "적절하고 안정감있는 표정을 잘 유지하고 있습니다."),
            "counts": {emo: int(cnt.get(emo, 0)) for emo in _EMOTIONS},
            "distribution": {emo: round(cnt.get(emo,0)/total, 4) for emo in _EMOTIONS},
            "negative_emotion_ratio": round(neg/total, 4),
        })
        if save_timeline: res["timeline"] = timeline
    else:
        res.update({
            "most_common_emotion": None,
            "warning": "영상에서 얼굴을 감지하지 못했습니다.",
            "counts": {emo: 0 for emo in _EMOTIONS},
            "distribution": {emo: 0.0 for emo in _EMOTIONS},
            "negative_emotion_ratio": 0.0,
        })

    json_path = Path(out_dir) / "emotion_summary.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False, indent=2)
    res["emotion_summary_path"] = str(json_path)
    return res
