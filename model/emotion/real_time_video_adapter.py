# model/emotion/real_time_video_adapter.py
from __future__ import annotations

import os
import json
import shutil
import tempfile
from pathlib import Path
from typing import Dict, Any, List

import cv2
import numpy as np
from keras.preprocessing.image import img_to_array
from keras.models import load_model
from collections import Counter


# =========================
# 경로/파일 유틸
# =========================
def _has_non_ascii(s: str) -> bool:
    """문자열에 비-ASCII 문자가 포함되어 있으면 True."""
    try:
        s.encode("ascii")
        return False
    except UnicodeEncodeError:
        return True


def _copy_to_ascii_temp(src: Path, subdir: str | None = None) -> Path:
    """
    src 경로가 비-ASCII를 포함하거나, 라이브러리가 경로 인코딩에 민감할 때
    %TEMP%/pitchpal_models/<subdir>/<name>로 복사하여 ASCII 전용 경로를 만들어 반환.
    - src가 디렉터리(SavedModel)면 트리 전체 복사, 파일(h5/xml)이면 파일 복사.
    """
    root = Path(tempfile.gettempdir()) / "pitchpal_models"
    if subdir:
        root = root / subdir
    root.mkdir(parents=True, exist_ok=True)

    dst = root / src.name
    if dst.exists():
        if dst.is_dir():
            shutil.rmtree(dst)
        else:
            dst.unlink()

    if src.is_dir():
        shutil.copytree(src, dst)
    else:
        shutil.copy2(src, dst)

    return dst


def _ascii_safe_path(p: Path, subdir: str | None = None) -> Path:
    """
    경로 p가 비-ASCII 문자를 포함하면 TEMP로 복사한 ASCII 경로를 반환.
    아니면 원본 경로를 그대로 반환.
    """
    if _has_non_ascii(str(p)):
        return _copy_to_ascii_temp(p, subdir=subdir)
    return p


# =========================
# 모델/정의 상수
# =========================
BASE = Path(__file__).resolve().parents[1]  # .../model

# 환경변수로 경로 오버라이드 가능 (ASCII 위치에 두면 가장 안전)
# - EMOTION_MODEL_PATH: h5 파일 또는 SavedModel 디렉터리
# - EMOTION_HAAR_PATH : haarcascade xml 파일 경로
ENV_MODEL = os.getenv("EMOTION_MODEL_PATH", "").strip()
ENV_HAAR = os.getenv("EMOTION_HAAR_PATH", "").strip()

# 레포 기본 경로 (필요 시 실제 파일/폴더명에 맞게 수정)
# h5 단일 파일 예시:
DEFAULT_MODEL_PATH = BASE / "emotion" / "models" / "_mini_XCEPTION.102-0.66.hdf5"
# SavedModel 디렉터리라면 위 줄 대신 폴더명을 두세요.
DEFAULT_HAAR_PATH = BASE / "emotion" / "haarcascade_files" / "haarcascade_frontalface_default.xml"

RAW_MODEL_PATH = Path(ENV_MODEL) if ENV_MODEL else DEFAULT_MODEL_PATH
RAW_HAAR_PATH = Path(ENV_HAAR) if ENV_HAAR else DEFAULT_HAAR_PATH

# 감정 라벨/메시지
_EMOTIONS = ["angry", "disgust", "scared", "happy", "sad", "surprised", "neutral"]
_NEGATIVE = {"angry", "disgust", "scared", "sad", "surprised"}
_WARNING = {
    "angry": "화난 표정 비중이 높아요. 보다 평온하고 중립적인 표정을 권장합니다.",
    "disgust": "불쾌한 표정 비중이 높아요. 보다 평온하고 중립적인 표정을 권장합니다.",
    "scared": "두려운 표정 비중이 높아요. 보다 평온하고 중립적인 표정을 권장합니다.",
    "sad": "슬픈 표정 비중이 높아요. 보다 평온하고 중립적인 표정을 권장합니다.",
    "surprised": "놀란 표정 비중이 높아요. 보다 평온하고 중립적인 표정을 권장합니다.",
}

# 전역 캐시
_FACE_DETECTOR = None
_EMO_MODEL = None


# =========================
# 로더
# =========================
def _ensure_models() -> None:
    """
    - Windows 비-ASCII 경로에서도 안전하게 동작하도록
      모델/캐스케이드 파일을 ASCII 전용 임시 경로로 복사 후 로드.
    - keras.load_model()은 파일(h5)이나 폴더(SavedModel) 모두 지원.
    """
    global _FACE_DETECTOR, _EMO_MODEL

    # --- Haar Cascade ---
    if _FACE_DETECTOR is None:
        if not RAW_HAAR_PATH.exists():
            raise FileNotFoundError(f"haar cascade not found: {RAW_HAAR_PATH}")

        haar_path = _ascii_safe_path(RAW_HAAR_PATH, subdir="emotion")
        # OpenCV는 보통 유니코드 경로도 잘 읽지만, 일관성을 위해 ascii 경로 사용
        _FACE_DETECTOR = cv2.CascadeClassifier(str(haar_path))

    # --- Emotion Model ---
    if _EMO_MODEL is None:
        if not RAW_MODEL_PATH.exists():
            raise FileNotFoundError(f"emotion model not found: {RAW_MODEL_PATH}")

        model_path = _ascii_safe_path(RAW_MODEL_PATH, subdir="emotion")
        # keras/tf가 Windows 경로에서 인코딩 이슈가 있을 수 있어 as_posix() 우선 시도
        try:
            _EMO_MODEL = load_model(model_path.as_posix(), compile=False)
        except Exception:
            # as_posix 실패 시 원문 문자열로 재시도
            _EMO_MODEL = load_model(str(model_path), compile=False)


# =========================
# 메인 분석 함수
# =========================
def run_emotion_analysis(
    video_path: str,
    *,
    out_dir: str | Path,
    save_timeline: bool = False,
    timeline_every_s: int = 1,
) -> Dict[str, Any]:
    """
    비디오에서 주기적으로 얼굴을 검출하여 64x64 그레이스케일 ROI를
    감정 분류 모델에 입력. 최빈 감정/분포/부정 감정 비율 등을 요약.
    """
    _ensure_models()

    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    cap = cv2.VideoCapture(str(video_path))
    fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
    if not fps or fps <= 0:
        fps = 30.0

    emotion_list: List[str] = []
    timeline: List[Dict[str, Any]] = []
    frame_idx = 0
    sample_every = max(1, int(fps * timeline_every_s))

    while cap.isOpened():
        ok, frame = cap.read()
        if not ok or frame is None:
            break

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = _FACE_DETECTOR.detectMultiScale(
            gray,
            scaleFactor=1.05,
            minNeighbors=3,
            minSize=(30, 30),
            flags=cv2.CASCADE_SCALE_IMAGE,
        )

        if len(faces) > 0:
            # 가장 큰 얼굴 1개만 사용
            faces = sorted(faces, reverse=True, key=lambda x: x[2] * x[3])
            fX, fY, fW, fH = faces[0]
            roi = gray[fY : fY + fH, fX : fX + fW]

            try:
                roi = cv2.resize(roi, (64, 64))
            except Exception:
                frame_idx += 1
                continue

            roi = (roi.astype("float32") / 255.0)
            roi = img_to_array(roi)[None, ...]  # (1, 64, 64, 1)

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
        cnt = Counter(emotion_list)
        total = sum(cnt.values())
        top = cnt.most_common(1)[0][0]
        neg = sum(int(cnt.get(e, 0)) for e in _NEGATIVE)

        res.update(
            {
                "most_common_emotion": top,
                "warning": _WARNING.get(
                    top, "적절하고 안정감있는 표정을 잘 유지하고 있습니다."
                ),
                "counts": {emo: int(cnt.get(emo, 0)) for emo in _EMOTIONS},
                "distribution": {
                    emo: round((cnt.get(emo, 0) / total), 4) for emo in _EMOTIONS
                },
                "negative_emotion_ratio": round(neg / total, 4),
            }
        )

        if save_timeline:
            res["timeline"] = timeline
    else:
        res.update(
            {
                "most_common_emotion": None,
                "warning": "영상에서 얼굴을 감지하지 못했습니다.",
                "counts": {emo: 0 for emo in _EMOTIONS},
                "distribution": {emo: 0.0 for emo in _EMOTIONS},
                "negative_emotion_ratio": 0.0,
            }
        )

    json_path = out_dir / "emotion_summary.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False, indent=2)
    res["emotion_summary_path"] = str(json_path)

    return res


__all__ = ["run_emotion_analysis"]
