import cv2, json
import mediapipe as mp
import math
import pandas as pd
import time
from datetime import datetime

def euclidean_distance(p1, p2):
    return math.sqrt((p1[0]-p2[0])**2 + (p1[1]-p2[1])**2)

# 눈 깜빡임 평가 함수
def blink_frequency_grade(blinks_per_min):
    if 10 <= blinks_per_min <= 20:
        return "정상", "안정된 상태"
    elif 21 <= blinks_per_min <= 30:
        return "주의", "약간의 긴장 상태"
    elif blinks_per_min >= 31:
        return "경고", "높은 긴장/불안 상태"
    else:
        return "정보 부족", ""

# EAR 계산
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

# 상수
LEFT_EYE_IDX = [33, 160, 158, 133, 153, 144]
RIGHT_EYE_IDX = [362, 385, 387, 263, 373, 380]
EAR_THRESHOLD = 0.21
CLOSED_FRAMES = 1

# MediaPipe 초기화
mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(max_num_faces=1)
blink_count = 0
frame_idx = 0
frame_counter = 0
start_time = time.time()

results = []

video_path = r"C:\Users\lhy27\Desktop\졸프\20250522_154521.mp4"
cap = cv2.VideoCapture(video_path)

if not cap.isOpened():
    print("❌ 영상 파일을 열 수 없습니다.")
    exit()

fps = cap.get(cv2.CAP_PROP_FPS)
if fps == 0:
    print("❌ FPS 값이 0입니다.")
    exit()

wait_time = int(1000 / fps)

while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        break

    frame_idx += 1
    h, w = frame.shape[:2]
    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    result = face_mesh.process(rgb_frame)

    if result.multi_face_landmarks:
        landmarks = result.multi_face_landmarks[0].landmark
        points = [(int(lm.x * w), int(lm.y * h)) for lm in landmarks]

        left_ear = calculate_ear(points, LEFT_EYE_IDX)
        right_ear = calculate_ear(points, RIGHT_EYE_IDX)

        blink = False
        if left_ear is not None and right_ear is not None:
            avg_ear = (left_ear + right_ear) / 2
        else:
            avg_ear = None

        if avg_ear is not None and avg_ear < EAR_THRESHOLD:
            frame_counter += 1
        else:
            if frame_counter >= CLOSED_FRAMES:
                blink = True
                blink_count += 1
            frame_counter = 0

        elapsed = time.time() - start_time
        bps = blink_count / elapsed if elapsed > 0 else 0
        bpm = bps * 60

        results.append({
            "프레임": frame_idx,
            "EAR": round(avg_ear, 4) if avg_ear is not None else None,
            "눈 깜빡임": "O" if blink else "X"
        })

    if cv2.waitKey(wait_time) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()

# 분석 요약
total_time_sec = frame_idx / fps
total_time_min = total_time_sec / 60
blinks_per_min = blink_count / total_time_min
duration_str = f"{int(total_time_sec // 60)}분 {int(total_time_sec % 60)}초"
blink_grade, blink_interpretation = blink_frequency_grade(blinks_per_min)

summary = {
    "분석 영상 길이": duration_str,
    "눈 깜빡임 횟수": blink_count,
    "눈 깜빡임 빈도 (회/분)": round(blinks_per_min, 2),
    "눈 깜빡임 평가 등급": blink_grade,
    "눈 깜빡임 해석": blink_interpretation
}

# JSON 저장
df = pd.DataFrame(results)
json_path = r"model\video\blink_data.json"
df.to_json(json_path, orient="records", force_ascii=False, indent=4)

summary_path = r"model\video\eye_blink_analysis_summary.json"
with open(summary_path, "w", encoding="utf-8") as f:
    json.dump(summary, f, ensure_ascii=False, indent=4)

print(f"\n✅ 결과 JSON 저장 완료: {json_path}, {summary_path}")
