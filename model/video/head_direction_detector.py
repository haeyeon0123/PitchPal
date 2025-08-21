import cv2, json
import mediapipe as mp
import numpy as np
import pandas as pd

VIDEO_PATH = r"C:\Users\lhy27\Desktop\20250524_172341.mp4"
JSON_OUTPUT_PATH = r"model\video\head_pose_pitch_output.json"

mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(static_image_mode=False, max_num_faces=1, refine_landmarks=True)

cap = cv2.VideoCapture(VIDEO_PATH)
fps = cap.get(cv2.CAP_PROP_FPS)
total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

model_points = np.array([
    (0.0, 0.0, 0.0),
    (0.0, -330.0, -65.0),
    (-225.0, 170.0, -135.0),
    (225.0, 170.0, -135.0),
    (-150.0, -150.0, -125.0),
    (150.0, -150.0, -125.0)
], dtype=np.float64)

LANDMARK_IDS = [1, 152, 263, 33, 287, 57]

def get_camera_matrix(frame_width, frame_height):
    focal_length = frame_width
    center = (frame_width / 2, frame_height / 2)
    return np.array([[focal_length, 0, center[0]],
                     [0, focal_length, center[1]],
                     [0, 0, 1]], dtype="double")

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
        image_points = [(int(landmarks[idx].x * img_w), int(landmarks[idx].y * img_h)) for idx in LANDMARK_IDS]
        image_points = np.array(image_points, dtype="double")

        success_pnp, rotation_vector, translation_vector = cv2.solvePnP(
            model_points, image_points, camera_matrix, dist_coeffs, flags=cv2.SOLVEPNP_ITERATIVE
        )

        if success_pnp:
            rotation_matrix, _ = cv2.Rodrigues(rotation_vector)
            sy = np.sqrt(rotation_matrix[0,0]**2 + rotation_matrix[1,0]**2)
            singular = sy < 1e-6
            if not singular:
                x = np.arctan2(rotation_matrix[2,1], rotation_matrix[2,2])
            else:
                x = np.arctan2(-rotation_matrix[1,2], rotation_matrix[1,1])
            pitch_deg = np.degrees(x)
            head_pose_text = classify_pitch(pitch_deg)

    timestamp = frame_count / fps
    results_data.append({
        "frame": frame_count,
        "time_sec": round(timestamp, 2),
        "head_pose": head_pose_text,
        "pitch_deg": round(pitch_deg, 2) if pitch_deg is not None else None
    })

    if head_pose_text in head_pose_counts:
        head_pose_counts[head_pose_text] += 1

    frame_count += 1

    if cv2.waitKey(int(1000/fps)) & 0xFF == ord('q'):
        break

cap.release()
face_mesh.close()
cv2.destroyAllWindows()

# JSON 저장
df = pd.DataFrame(results_data)
df.to_json(JSON_OUTPUT_PATH, orient="records", force_ascii=False, indent=4)
print(f"✅ JSON 저장 완료: {JSON_OUTPUT_PATH}")

# 비율 계산 결과도 JSON 저장
total = sum(head_pose_counts.values())
if total > 0:
    ratios = {
        "looking down ratio": round(head_pose_counts["looking down"]/total, 3),
        "looking front ratio": round(head_pose_counts["looking front"]/total, 3),
        "looking up ratio": round(head_pose_counts["looking up"]/total, 3)
    }
    summary_path = r"model\video\head_pose_summary.json"
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(ratios, f, ensure_ascii=False, indent=4)
    print(f"✅ Head pose 비율 요약 저장: {summary_path}")
