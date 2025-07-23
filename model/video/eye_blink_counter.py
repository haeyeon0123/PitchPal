# 🔧 리팩토링된 눈 깜빡임 분석 함수
# 파일명: model/video/eye_blink_counter.py

import cv2
import mediapipe as mp
import math
import pandas as pd
import time

def euclidean_distance(p1, p2):
    return math.sqrt((p1[0]-p2[0])**2 + (p1[1]-p2[1])**2)

def blink_frequency_grade(blinks_per_min):
    if 10 <= blinks_per_min <= 20:
        return "정상", "안정된 상태"
    elif 21 <= blinks_per_min <= 30:
        return "주의", "약간의 긴장 상태"
    elif blinks_per_min >= 31:
        return "경고", "높은 긴장/불안 상태"
    else:
        return "정보 부족", ""

def calculate_ear(landmarks, eye_indices):
    p1 = landmarks[eye_indices[0]]
    p2 = landmarks[eye_indices[1]]
    p3 = landmarks[eye_indices[2]]
    p4 = landmarks[eye_indices[3]]
    p5 = landmarks[eye_indices[4]]
    p6 = landmarks[eye_indices[5]]
    vertical_1 = euclidean_distance(p2, p6)
    vertical_2 = euclidean_distance(p3, p5)
    horizontal = euclidean_distance(p1, p4)
    if horizontal == 0:
        return None
    return (vertical_1 + vertical_2) / (2.0 * horizontal)

LEFT_EYE_IDX = [33, 160, 158, 133, 153, 144]
RIGHT_EYE_IDX = [362, 385, 387, 263, 373, 380]
EAR_THRESHOLD = 0.21
CLOSED_FRAMES = 1

# ✅ 호출용 함수

def run_blink_analysis(video_path: str) -> dict:
    mp_face_mesh = mp.solutions.face_mesh
    face_mesh = mp_face_mesh.FaceMesh(max_num_faces=1)

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"❌ 영상 파일을 열 수 없습니다: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS)
    frame_idx = 0
    frame_counter = 0
    blink_count = 0
    start_time = time.time()
    results = []
    timeline = []

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        frame_idx += 1
        h, w = frame.shape[:2]
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        result = face_mesh.process(rgb)

        blink = False
        avg_ear = None

        if result.multi_face_landmarks:
            landmarks = result.multi_face_landmarks[0].landmark
            points = [(int(lm.x * w), int(lm.y * h)) for lm in landmarks]
            left_ear = calculate_ear(points, LEFT_EYE_IDX)
            right_ear = calculate_ear(points, RIGHT_EYE_IDX)
            if left_ear and right_ear:
                avg_ear = (left_ear + right_ear) / 2

            if avg_ear is not None and avg_ear < EAR_THRESHOLD:
                frame_counter += 1
            else:
                if frame_counter >= CLOSED_FRAMES:
                    blink = True
                    blink_count += 1
                frame_counter = 0

        timeline.append({"frame": frame_idx, "blink": int(blink)})

        results.append({
            "프레임": frame_idx,
            "EAR": round(avg_ear, 4) if avg_ear else None,
            "눈 깜빡임": "O" if blink else "X"
        })

    cap.release()
    face_mesh.close()

    total_time_sec = frame_idx / fps
    total_time_min = total_time_sec / 60
    blinks_per_min = blink_count / total_time_min if total_time_min > 0 else 0
    duration_str = f"{int(total_time_sec // 60)}분 {int(total_time_sec % 60)}초"

    grade, interpretation = blink_frequency_grade(blinks_per_min)

    summary = {
        "duration": duration_str,
        "blink_count": blink_count,
        "blinks_per_min": round(blinks_per_min, 2),
        "grade": grade,
        "interpretation": interpretation
    }

    return {"summary": summary, "timeline": timeline}
