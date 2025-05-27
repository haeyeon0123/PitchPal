import cv2
import mediapipe as mp
import numpy as np
import pandas as pd

# 경로 설정
VIDEO_PATH = r"C:\Users\lhy27\Desktop\20250524_172341.mp4"
CSV_OUTPUT_PATH = r"model\video\head_pose_pitch_output.csv"

# MediaPipe 초기화
mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(static_image_mode=False, max_num_faces=1, refine_landmarks=True)

cap = cv2.VideoCapture(VIDEO_PATH)
fps = cap.get(cv2.CAP_PROP_FPS)

# 3D 얼굴 모델 점 (단위 mm)
model_points = np.array([
    (0.0, 0.0, 0.0),             # 코끝 (nose tip)
    (0.0, -330.0, -65.0),        # 턱 끝 (chin)
    (-225.0, 170.0, -135.0),     # 왼쪽 눈 눈썹 끝 (left eye left corner)
    (225.0, 170.0, -135.0),      # 오른쪽 눈 눈썹 끝 (right eye right corner)
    (-150.0, -150.0, -125.0),    # 왼쪽 입 끝 (left mouth corner)
    (150.0, -150.0, -125.0)      # 오른쪽 입 끝 (right mouth corner)
], dtype=np.float64)

# MediaPipe 얼굴 랜드마크 인덱스 대응
LANDMARK_IDS = [1, 152, 263, 33, 287, 57]

# 카메라 내부 파라미터
def get_camera_matrix(frame_width, frame_height):
    focal_length = frame_width
    center = (frame_width / 2, frame_height / 2)
    camera_matrix = np.array(
        [[focal_length, 0, center[0]],
         [0, focal_length, center[1]],
         [0, 0, 1]], dtype="double"
    )
    return camera_matrix

# 고개 상태 분류 (pitch 각도 기준)
def classify_pitch(pitch_deg):
    if pitch_deg < -8:
        return "looking up"
    elif pitch_deg > 10:
        return "looking down"
    else:
        return "looking front"

results_data = []
frame_count = 0

while cap.isOpened():
    success, frame = cap.read()
    if not success:
        break

    img_h, img_w = frame.shape[:2]
    camera_matrix = get_camera_matrix(img_w, img_h)
    dist_coeffs = np.zeros((4,1))  # 왜곡 계수 없음 가정

    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    results = face_mesh.process(rgb_frame)

    head_pose_text = "No face detected"
    pitch_deg = None

    if results.multi_face_landmarks:
        landmarks = results.multi_face_landmarks[0].landmark

        # 2D 이미지 좌표계에 맞게 점 추출
        image_points = []
        for idx in LANDMARK_IDS:
            lm = landmarks[idx]
            x, y = int(lm.x * img_w), int(lm.y * img_h)
            image_points.append((x, y))
        image_points = np.array(image_points, dtype="double")

        # solvePnP로 회전/이동 벡터 추정
        success_pnp, rotation_vector, translation_vector = cv2.solvePnP(
            model_points, image_points, camera_matrix, dist_coeffs, flags=cv2.SOLVEPNP_ITERATIVE
        )

        if success_pnp:
            # rotation vector → rotation matrix
            rotation_matrix, _ = cv2.Rodrigues(rotation_vector)
            # rotation matrix → Euler 각도 (rvec → pitch/yaw/roll)
            sy = np.sqrt(rotation_matrix[0,0]*rotation_matrix[0,0] + rotation_matrix[1,0]*rotation_matrix[1,0])
            singular = sy < 1e-6

            if not singular:
                x = np.arctan2(rotation_matrix[2,1], rotation_matrix[2,2])
                y = np.arctan2(-rotation_matrix[2,0], sy)
                z = np.arctan2(rotation_matrix[1,0], rotation_matrix[0,0])
            else:
                x = np.arctan2(-rotation_matrix[1,2], rotation_matrix[1,1])
                y = np.arctan2(-rotation_matrix[2,0], sy)
                z = 0

            pitch_deg = np.degrees(x)  # x축 회전 (pitch)
            head_pose_text = classify_pitch(pitch_deg)

            # 얼굴 점 시각화
            for p in image_points:
                cv2.circle(frame, (int(p[0]), int(p[1])), 3, (0, 255, 0), -1)

    # 화면에 텍스트 표시 (고개 상태 + pitch 각도)
    if pitch_deg is not None:
        pitch_text = f"Pitch: {pitch_deg:.2f} deg"
    else:
        pitch_text = "Pitch: N/A"

    cv2.putText(frame, head_pose_text, (30, 50), cv2.FONT_HERSHEY_SIMPLEX, 1.5, (0,255,0), 3)
    cv2.putText(frame, pitch_text, (30, 100), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0,255,255), 2)

    # 결과 저장 (pitch 값도 저장)
    timestamp = frame_count / fps
    results_data.append({
        "frame": frame_count,
        "time_sec": timestamp,
        "head_pose": head_pose_text,
        "pitch_deg": pitch_deg if pitch_deg is not None else ""
    })

    cv2.imshow("Head Pose Detection (solvePnP)", frame)
    if cv2.waitKey(int(1000/fps)) & 0xFF == ord('q'):
        break

    frame_count += 1

cap.release()
cv2.destroyAllWindows()
face_mesh.close()

# CSV 저장
df = pd.DataFrame(results_data)
df.to_csv(CSV_OUTPUT_PATH, index=False)
print(f"CSV saved to: {CSV_OUTPUT_PATH}")
