from keras.preprocessing.image import img_to_array
from keras.models import load_model
import cv2
import numpy as np
from collections import Counter
import os, json

# ===== 설정 =====
detection_model_path = 'model/emotion/haarcascade_files/haarcascade_frontalface_default.xml'
emotion_model_path   = 'model/emotion/models/_mini_XCEPTION.102-0.66.hdf5'
video_path           = 'data/angry_video.mp4'  # 샘플 영상 경로

# 결과 저장 경로
RESULT_DIR        = 'model/emotion'
RESULT_JSON_PATH  = os.path.join(RESULT_DIR, 'emotion_summary.json')

# 타임라인 저장 여부(프론트 차트용, 1초 간격 샘플링)
SAVE_TIMELINE     = False  # 필요하면 True
TIMELINE_EVERY_S  = 1      # n초 간격

# ===== 모델 로드 =====
face_detection     = cv2.CascadeClassifier(detection_model_path)
emotion_classifier = load_model(emotion_model_path, compile=False)
EMOTIONS = ["angry", "disgust", "scared", "happy", "sad", "surprised", "neutral"]
NEGATIVE_EMOTIONS = {"angry", "disgust", "scared", "sad", "surprised"}

WARNING_MESSAGES = {
    "angry": "화난 표정을 짓는 순간이 많아 보입니다. 보다 평온하고 중립적인 표정을 지을 수 있도록 연습하는 것이 좋을 것 같습니다.",
    "disgust": "불쾌한 표정을 짓는 순간이 많아 보입니다. 보다 평온하고 중립적인 표정을 지을 수 있도록 연습하는 것이 좋을 것 같습니다.",
    "scared": "두려운 표정을 짓는 순간이 많아 보입니다. 보다 평온하고 중립적인 표정을 지을 수 있도록 연습하는 것이 좋을 것 같습니다.",
    "sad": "슬픈 표정을 짓는 순간이 많아 보입니다. 보다 평온하고 중립적인 표정을 지을 수 있도록 연습하는 것이 좋을 것 같습니다.",
    "surprised": "놀란 표정을 짓는 순간이 많아 보입니다. 보다 평온하고 중립적인 표정을 지을 수 있도록 연습하는 것이 좋을 것 같습니다."
}

# ===== 비디오 열기 =====
cap = cv2.VideoCapture(video_path)
fps = cap.get(cv2.CAP_PROP_FPS) or 0.0
if fps <= 0:
    # 일부 코덱에서 fps를 못 읽는 경우 대비
    fps = 30.0

emotion_list = []
timeline = []
frame_idx = 0
sample_every = max(1, int(fps * TIMELINE_EVERY_S))  # 1초 간격 샘플링

while cap.isOpened():
    ret, frame = cap.read()
    if not ret or frame is None:
        break

    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

    faces = face_detection.detectMultiScale(
        gray,
        scaleFactor=1.05,
        minNeighbors=3,
        minSize=(30, 30),
        flags=cv2.CASCADE_SCALE_IMAGE
    )

    if len(faces) > 0:
        # 가장 큰 얼굴 하나만 처리
        faces = sorted(faces, reverse=True, key=lambda x: x[2] * x[3])
        (fX, fY, fW, fH) = faces[0]

        roi = gray[fY:fY + fH, fX:fX + fW]
        try:
            roi = cv2.resize(roi, (64, 64))
        except:
            frame_idx += 1
            continue

        roi = roi.astype("float32") / 255.0
        roi = img_to_array(roi)
        roi = np.expand_dims(roi, axis=0)

        preds = emotion_classifier.predict(roi, verbose=0)[0]
        label = EMOTIONS[int(np.argmax(preds))]
        emotion_list.append(label)

        # (옵션) 타임라인: 1초 간격으로 저장
        if SAVE_TIMELINE and (frame_idx % sample_every == 0):
            timeline.append({
                "t_sec": round(frame_idx / fps, 2),
                "emotion": label
            })

    frame_idx += 1

cap.release()

# ===== 결과 집계 =====
os.makedirs(RESULT_DIR, exist_ok=True)

result = {
    "video_path": video_path,
    "fps": float(fps),
    "frames_total": int(frame_idx),
    "frames_with_prediction": int(len(emotion_list)),
    "estimated_duration_sec": round(frame_idx / fps, 2) if fps > 0 else None,
}

if emotion_list:
    counts = Counter(emotion_list)
    total = sum(counts.values())

    most_common_emotion = counts.most_common(1)[0][0]
    negative_cnt = sum(int(counts.get(e, 0)) for e in NEGATIVE_EMOTIONS)

    result.update({
        "most_common_emotion": most_common_emotion,
        "warning": WARNING_MESSAGES.get(
            most_common_emotion,
            "발표에 적절하고 안정감있는 표정을 잘 유지하고 있습니다."
        ),
        "counts": {emo: int(counts.get(emo, 0)) for emo in EMOTIONS},
        "distribution": {emo: round((counts.get(emo, 0) / total), 4) for emo in EMOTIONS},
        "negative_emotion_ratio": round(negative_cnt / total, 4)
    })

    if SAVE_TIMELINE:
        result["timeline"] = timeline
else:
    result.update({
        "most_common_emotion": None,
        "warning": "영상에서 얼굴을 감지하지 못했습니다.",
        "counts": {emo: 0 for emo in EMOTIONS},
        "distribution": {emo: 0.0 for emo in EMOTIONS},
        "negative_emotion_ratio": 0.0
    })

# ===== JSON 저장 =====
with open(RESULT_JSON_PATH, "w", encoding="utf-8") as f:
    json.dump(result, f, ensure_ascii=False, indent=2)

print(f"\n✅ 분석 요약 JSON 저장 완료: {RESULT_JSON_PATH}")
