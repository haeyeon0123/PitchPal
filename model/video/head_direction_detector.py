# 🔧 리팩토링된 고개 방향 분석 함수
# 파일명: model/video/head_direction_detector.py

import cv2
import mediapipe as mp
import numpy as np


def run_headpose_analysis(video_path: str) -> dict:
    mp_face_mesh = mp.solutions.face_mesh
    face_mesh = mp_face_mesh.FaceMesh(static_image_mode=False, max_num_faces=1, refine_landmarks=True)

    model_points = np.array([
        (0.0, 0.0, 0.0),
        (0.0, -330.0, -65.0),
        (-225.0, 170.0, -135.0),
        (225.0, 170.0, -135.0),
        (-150.0, -150.0, -125.0),
        (150.0, -150.0, -125.0)
    ], dtype=np.float64)

    LANDMARK_IDS = [1, 152, 263, 33, 287, 57]

    def get_camera_matrix(w, h):
        center = (w / 2, h / 2)
        return np.array([[w, 0, center[0]], [0, w, center[1]], [0, 0, 1]], dtype="double")

    def classify_pitch(pitch):
        if pitch < -8: return "looking up"
        elif pitch > 9: return "looking down"
        else: return "looking front"

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"❌ 영상 파일을 열 수 없습니다: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    results = []
    counts = {"looking up": 0, "looking front": 0, "looking down": 0}

    while cap.isOpened():
        success, frame = cap.read()
        if not success:
            break

        h, w = frame.shape[:2]
        camera_matrix = get_camera_matrix(w, h)
        dist_coeffs = np.zeros((4, 1))
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        result = face_mesh.process(rgb)

        pitch = None
        pose_label = "No face detected"

        if result.multi_face_landmarks:
            lm = result.multi_face_landmarks[0].landmark
            img_pts = np.array([(int(lm[i].x * w), int(lm[i].y * h)) for i in LANDMARK_IDS], dtype="double")

            success_pnp, rvec, tvec = cv2.solvePnP(model_points, img_pts, camera_matrix, dist_coeffs)
            if success_pnp:
                rot_matrix, _ = cv2.Rodrigues(rvec)
                sy = np.sqrt(rot_matrix[0, 0] ** 2 + rot_matrix[1, 0] ** 2)
                singular = sy < 1e-6
                if not singular:
                    x = np.arctan2(rot_matrix[2, 1], rot_matrix[2, 2])
                else:
                    x = np.arctan2(-rot_matrix[1, 2], rot_matrix[1, 1])
                pitch = np.degrees(x)
                pose_label = classify_pitch(pitch)

        results.append({
            "frame": len(results),
            "time_sec": len(results)/fps,
            "head_pose": pose_label,
            "pitch_deg": pitch if pitch is not None else ""
        })

        if pose_label in counts:
            counts[pose_label] += 1

        if len(results) >= total_frames:
            break

    cap.release()
    face_mesh.close()

    total = sum(counts.values())
    ratios = {k: round(v / total, 2) if total > 0 else 0 for k, v in counts.items()}

    return {"pitch_by_frame": results, "head_pose_ratios": ratios}
