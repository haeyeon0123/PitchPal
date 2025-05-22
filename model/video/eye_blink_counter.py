import cv2, csv
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

# 눈 깜빡임 계산 함수 (EAR)
def calculate_ear(landmarks, eye_indices):
    # 눈의 6개 주요 점 좌표 (x, y)
    p1 = landmarks[eye_indices[0]]  # 왼쪽 코너
    p2 = landmarks[eye_indices[1]]  # 위쪽 왼쪽
    p3 = landmarks[eye_indices[2]]  # 위쪽 오른쪽
    p4 = landmarks[eye_indices[3]]  # 오른쪽 코너
    p5 = landmarks[eye_indices[4]]  # 아래쪽 오른쪽
    p6 = landmarks[eye_indices[5]]  # 아래쪽 왼쪽

    # 수직 거리 두 개 (위-아래 거리)
    vertical_1 = euclidean_distance(p2, p6)
    vertical_2 = euclidean_distance(p3, p5)

    # 수평 거리 (왼쪽-오른쪽 거리)
    horizontal = euclidean_distance(p1, p4)

    if horizontal == 0:
        return None

    ear = (vertical_1 + vertical_2) / (2.0 * horizontal)
    return ear

# 눈 깜빡임 임계값/상수 설정
LEFT_EYE_IDX = [33, 160, 158, 133, 153, 144]
RIGHT_EYE_IDX = [362, 385, 387, 263, 373, 380]
EAR_THRESHOLD = 0.21
CLOSED_FRAMES = 1

# MediaPipe 초기화
mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(max_num_faces=1)
blink_count = 0
blink_timestamps = []
frame_idx = 0
frame_counter = 0  # 초기화 누락 방지
start_time = time.time()

# 분석 결과 저장용 리스트
results = []

# 영상 경로 설정
video_path = r"C:\Users\lhy27\Desktop\KakaoTalk_20250522_165528571.mp4"

# 영상 열기
cap = cv2.VideoCapture(video_path)
if not cap.isOpened():
    print("❌ 영상 파일을 열 수 없습니다. 경로 또는 파일명을 확인하세요.")
    exit()

fps = cap.get(cv2.CAP_PROP_FPS)
if fps == 0:
    print("❌ FPS 값이 0입니다. 영상이 손상되었거나 코덱 문제일 수 있습니다.")
    exit()

# 깜빡임 데이터 CSV 준비
blink_csv_path = "C:/Users/lhy27/Desktop/blink_data.csv"
blink_csv = open(blink_csv_path, mode='w', newline='', encoding='utf-8-sig')
csv_writer = csv.writer(blink_csv)
csv_writer.writerow(['Blink Number', 'Timestamp (s)', 'Formatted Time'])

# fps 계산 부분은 이미 있으니 그대로 쓰고
wait_time = int(1000 / fps)  # 1000ms를 fps로 나누면 프레임당 대기 시간(ms)

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

        # 왼쪽 눈 시각화 (초록색)
        for idx in LEFT_EYE_IDX:
            cv2.circle(frame, points[idx], 2, (0, 255, 0), -1)
        for i in range(len(LEFT_EYE_IDX)):
            cv2.line(frame, points[LEFT_EYE_IDX[i]], points[LEFT_EYE_IDX[(i + 1) % len(LEFT_EYE_IDX)]], (0, 255, 0), 1)

        # 오른쪽 눈 시각화 (빨간색)
        for idx in RIGHT_EYE_IDX:
            cv2.circle(frame, points[idx], 2, (0, 0, 255), -1)
        for i in range(len(RIGHT_EYE_IDX)):
            cv2.line(frame, points[RIGHT_EYE_IDX[i]], points[RIGHT_EYE_IDX[(i + 1) % len(RIGHT_EYE_IDX)]], (0, 0, 255), 1)

        left_ear = calculate_ear(points, LEFT_EYE_IDX)
        right_ear = calculate_ear(points, RIGHT_EYE_IDX)

        blink = False

        if right_ear is not None and left_ear is not None:
            avg_ear = (right_ear + left_ear) / 2
        
        if avg_ear is not None and avg_ear < EAR_THRESHOLD:
            frame_counter += 1
        else:
            if frame_counter >= CLOSED_FRAMES:
                blink = True
                blink_count += 1
                timestamp = time.time() - start_time
                blink_timestamps.append(timestamp)
                csv_writer.writerow([
                    blink_count,
                    f"{timestamp:.2f}",
                    datetime.now().strftime("%H:%M:%S")
                ])
            frame_counter = 0
        
        # 화면 출력
        elapsed = time.time() - start_time
        bps = blink_count / elapsed if elapsed > 0 else 0
        bpm = bps * 60

        if avg_ear is not None:
            cv2.putText(frame, f"EAR: {avg_ear:.3f}", (30, 130),
                        cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 255, 0), 2)
            
        cv2.putText(frame, f"Blinks: {blink_count}", (30, 50),
                    cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 255, 0), 2)
        cv2.putText(frame, f"BPM: {bpm:.2f}", (30, 90),
                    cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 200, 200), 2)

        cv2.imshow("Blink Detection", frame)

        if cv2.waitKey(wait_time) & 0xFF == ord('q'):
            break

        results.append({
            "프레임": frame_idx,
            "EAR": round(avg_ear, 4) if avg_ear is not None else None,
            "눈 깜빡임": "O" if blink else "X"
        })

# 정리
cap.release()
blink_csv.close()
cv2.destroyAllWindows()

# --- 🔻 지속시간 및 깜빡임 빈도 계산 ---
total_time_sec = frame_idx / fps
total_time_min = total_time_sec / 60
blinks_per_min = blink_count / total_time_min

# 분:초 형식의 지속시간 추가
duration_str = f"{int(total_time_sec // 60)}분 {int(total_time_sec % 60)}초"

# DataFrame 생성 및 깜빡임 빈도 추가
df = pd.DataFrame(results)
df.loc[0, "눈 깜빡임 빈도(Hz)"] = round(blink_count / total_time_sec, 2)

csv_path = "C:/Users/lhy27/Desktop/analysis_results.csv"
df.to_csv(csv_path, index=False, encoding='utf-8-sig')

# --- 🔻 평가 및 요약 ---
blink_grade, blink_interpretation = blink_frequency_grade(blinks_per_min)

summary = {
    "분석 영상 길이": duration_str,  # ✅ 지속시간 반영
    "눈 깜빡임 횟수": blink_count,
    "눈 깜빡임 빈도 (회/분)": round(blinks_per_min, 2),
    "눈 깜빡임 평가 등급": blink_grade,
    "눈 깜빡임 해석": blink_interpretation
}

# 콘솔 출력
print("\n===== 발표 평가 요약 =====")
for k, v in summary.items():
    print(f"{k}: {v}")

print(f"EAR: {avg_ear:.4f}")

# CSV 저장
summary_df = pd.DataFrame([summary])
summary_path = "C:/Users/lhy27/Desktop/analysis_summary.csv"
summary_df.to_csv(summary_path, index=False, encoding="utf-8-sig")
print(f"\n✅ 평가 요약 결과가 '{summary_path}' 에 저장되었습니다.")
