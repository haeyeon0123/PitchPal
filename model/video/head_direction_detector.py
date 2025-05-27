import cv2
import mediapipe as mp
import numpy as np
import pandas as pd

VIDEO_PATH = r"C:\Users\lhy27\Desktop\20250524_172341.mp4"
CSV_OUTPUT_PATH = r"model\video\head_pose_pitch_output.csv"

mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(static_image_mode=False, max_num_faces=1, refine_landmarks=True)

cap = cv2.VideoCapture(VIDEO_PATH)
fps = cap.get(cv2.CAP_PROP_FPS)
total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

model_points = np.array([
    (0.0, 0.0, 0.0),             # 코끝
    (0.0, -330.0, -65.0),        # 턱
    (-225.0, 170.0, -135.0),     # 왼쪽 관자놀이
    (225.0, 170.0, -135.0),      # 오른쪽 관자놀이
    (-150.0, -150.0, -125.0),    # 왼쪽 입가
    (150.0, -150.0, -125.0)      # 오른쪽 입가
], dtype=np.float64)

# MediaPipe에서 사용할 랜드마크 ID들
LANDMARK_IDS = [1, 152, 263, 33, 287, 57]

def get_camera_matrix(frame_width, frame_height):
    focal_length = frame_width
    center = (frame_width / 2, frame_height / 2)
    camera_matrix = np.array(
        [[focal_length, 0, center[0]],
         [0, focal_length, center[1]],
         [0, 0, 1]], dtype="double"
    )
    return camera_matrix

def classify_pitch(pitch_deg):
    if pitch_deg < -8:
        return "looking up"
    elif pitch_deg > 9:
        return "looking down"
    else:
        return "looking front"

results_data = []
frame_count = 0
head_pose_counts = {"looking up":0, "looking front":0, "looking down":0}

while cap.isOpened():
    success, frame = cap.read()
    if not success:
        break

    img_h, img_w = frame.shape[:2]
    camera_matrix = get_camera_matrix(img_w, img_h)
    dist_coeffs = np.zeros((4,1))

    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    results = face_mesh.process(rgb_frame)

    head_pose_text = "No face detected"
    pitch_deg = None

    if results.multi_face_landmarks:
        landmarks = results.multi_face_landmarks[0].landmark
        image_points = []
        for idx in LANDMARK_IDS:
            lm = landmarks[idx]
            x, y = int(lm.x * img_w), int(lm.y * img_h)
            image_points.append((x, y))
        image_points = np.array(image_points, dtype="double")

        success_pnp, rotation_vector, translation_vector = cv2.solvePnP(
            model_points, image_points, camera_matrix, dist_coeffs, flags=cv2.SOLVEPNP_ITERATIVE
        )

        if success_pnp:
            rotation_matrix, _ = cv2.Rodrigues(rotation_vector)
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

            pitch_deg = np.degrees(x)
            head_pose_text = classify_pitch(pitch_deg)

            for p in image_points:
                cv2.circle(frame, (int(p[0]), int(p[1])), 3, (0, 255, 0), -1)

    pitch_text = f"Pitch: {pitch_deg:.2f} deg" if pitch_deg is not None else "Pitch: N/A"

    cv2.putText(frame, head_pose_text, (30, 50), cv2.FONT_HERSHEY_SIMPLEX, 1.5, (0,255,0), 3)
    cv2.putText(frame, pitch_text, (30, 100), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0,255,255), 2)

    timestamp = frame_count / fps
    results_data.append({
        "frame": frame_count,
        "time_sec": timestamp,
        "head_pose": head_pose_text,
        "pitch_deg": pitch_deg if pitch_deg is not None else ""
    })

    if head_pose_text in head_pose_counts:
        head_pose_counts[head_pose_text] += 1

    # 마지막 프레임에 경고 문구 출력 및 3초간 화면 유지
    if frame_count == total_frames - 1:
        total = sum(head_pose_counts.values())
        if total > 0:
            ratio_looking_down = head_pose_counts["looking down"] / total
            ratio_looking_front = head_pose_counts["looking front"] / total
            ratio_looking_up = head_pose_counts["looking up"] / total

            if ratio_looking_down > ratio_looking_front and ratio_looking_down > ratio_looking_up:
                warning_msg = "You're looking down too much."
                print(warning_msg)
                cv2.putText(frame, warning_msg, (30, 150), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0,0,255), 3)

        cv2.imshow("Head Pose Detection (solvePnP)", frame)
        cv2.waitKey(3000)  # 3초 대기
        break

    cv2.imshow("Head Pose Detection (solvePnP)", frame)
    if cv2.waitKey(int(1000/fps)) & 0xFF == ord('q'):
        break

    frame_count += 1

cap.release()
cv2.destroyAllWindows()
face_mesh.close()

df = pd.DataFrame(results_data)
df.to_csv(CSV_OUTPUT_PATH, index=False)
print(f"CSV saved to: {CSV_OUTPUT_PATH}")

# 결과 비율 출력
total = sum(head_pose_counts.values())
if total > 0:
    ratio_looking_down = head_pose_counts["looking down"] / total
    ratio_looking_front = head_pose_counts["looking front"] / total
    ratio_looking_up = head_pose_counts["looking up"] / total

    print(f"Looking down ratio: {ratio_looking_down:.2%}")
    print(f"Looking front ratio: {ratio_looking_front:.2%}")
    print(f"Looking up ratio: {ratio_looking_up:.2%}")