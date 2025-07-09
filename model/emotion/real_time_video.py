from keras.preprocessing.image import img_to_array
from keras.models import load_model
import cv2
import numpy as np
from collections import Counter

# 경로 설정
detection_model_path = 'model/Emotion-recognition-master/haarcascade_files/haarcascade_frontalface_default.xml'
emotion_model_path = 'model/Emotion-recognition-master/models/_mini_XCEPTION.102-0.66.hdf5'
video_path = 'model/Emotion-recognition-master/test.mp4'  # 샘플 영상 경로

# 모델 로드 및 초기화
face_detection = cv2.CascadeClassifier(detection_model_path)
emotion_classifier = load_model(emotion_model_path, compile=False)
EMOTIONS = ["angry", "disgust", "scared", "happy", "sad", "surprised", "neutral"]
NEGATIVE_EMOTIONS = {"angry", "disgust", "scared", "sad", "surprised"}

# 감정별 주의 문구 딕셔너리
WARNING_MESSAGES = {
    "angry": "화난 표정을 짓는 순간이 많아 보입니다. 보다 평온하고 중립적인 표정을 지을 수 있도록 연습하는 것이 좋을 것 같습니다.",
    "disgust": "불쾌한 표정을 짓는 순간이 많아 보입니다. 보다 평온하고 중립적인 표정을 지을 수 있도록 연습하는 것이 좋을 것 같습니다.",
    "scared": "두려운 표정을 짓는 순간이 많아 보입니다. 보다 평온하고 중립적인 표정을 지을 수 있도록 연습하는 것이 좋을 것 같습니다.",
    "sad": "슬픈 표정을 짓는 순간이 많아 보입니다. 보다 평온하고 중립적인 표정을 지을 수 있도록 연습하는 것이 좋을 것 같습니다.",
    "surprised": "놀란 표정을 짓는 순간이 많아 보입니다. 보다 평온하고 중립적인 표정을 지을 수 있도록 연습하는 것이 좋을 것 같습니다."
}

# 비디오 캡처 객체 생성
cap = cv2.VideoCapture(video_path)

emotion_list = []

while cap.isOpened():
    ret, frame = cap.read()
    if not ret or frame is None:
        break

    # 원본 해상도 유지
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
            continue

        roi = roi.astype("float") / 255.0
        roi = img_to_array(roi)
        roi = np.expand_dims(roi, axis=0)

        preds = emotion_classifier.predict(roi, verbose=0)[0]
        label = EMOTIONS[np.argmax(preds)]
        emotion_list.append(label)

cap.release()

# 최종 결과 출력
if emotion_list:
    most_common_emotion = Counter(emotion_list).most_common(1)[0][0]
    print(f"영상에서 가장 빈도 높은 감정: {most_common_emotion}")
    if most_common_emotion in WARNING_MESSAGES:
        print(WARNING_MESSAGES[most_common_emotion])
    else: print("발표에 적절하고 안정감있는 표정을 잘 유지하고 있습니다.")
else:
    print("영상에서 얼굴을 감지하지 못했습니다.")
