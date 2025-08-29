# video/head_direction_detector.py
import cv2, json
from pathlib import Path
from typing import Dict, Any, List, Optional, Union

import mediapipe as mp
import numpy as np
import pandas as pd

LANDMARK_IDS = [1, 152, 263, 33, 287, 57]
MODEL_POINTS = np.array([
    (0.0, 0.0, 0.0),
    (0.0, -330.0, -65.0),
    (-225.0, 170.0, -135.0),
    (225.0, 170.0, -135.0),
    (-150.0, -150.0, -125.0),
    (150.0, -150.0, -125.0)
], dtype=np.float64)

def _camera_matrix(frame_width: int, frame_height: int) -> np.ndarray:
    focal_length = frame_width
    center = (frame_width / 2.0, frame_height / 2.0)
    return np.array([[focal_length, 0, center[0]],
                     [0, focal_length, center[1]],
                     [0, 0, 1]], dtype="double")

def _classify_pitch(pitch_deg: Optional[float]) -> str:
    if pitch_deg is None:
        return "No face detected"
    if pitch_deg < -8:
        return "looking up"
    elif pitch_deg > 9:
        return "looking down"
    else:
        return "looking front"

def analyze_head_pitch(
    video_path: Union[str, Path],
    *,
    frame_stride: int = 1,
    max_frames: Optional[int] = None,
    save_raw: bool = True,
    save_summary: bool = True,
    output_dir: Union[str, Path] = "model/video",
    raw_filename: str = "head_pose_pitch_output.json",
    summary_filename: str = "head_pose_summary.json",
    return_records: bool = True
) -> Dict[str, Any]:
    """
    영상에서 얼굴 포즈의 pitch(상/정면/하) 추정. MediaPipe를 with 컨텍스트로 관리해
    리소스를 안전하게 해제. 메모리 절약하려면 return_records=False 권장.
    """
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise FileNotFoundError(f"❌ 영상 파일을 열 수 없습니다: {video_path}")

    try:
        fps = cap.get(cv2.CAP_PROP_FPS) or 0.0
        if fps <= 0:
            raise RuntimeError("❌ FPS 값이 0 또는 비정상입니다.")
        wait_ms = int(1000 / fps) if fps > 0 else 1

        dist_coeffs = np.zeros((4, 1))
        head_pose_counts = {"looking up": 0, "looking front": 0, "looking down": 0}

        with mp.solutions.face_mesh.FaceMesh(static_image_mode=False, max_num_faces=1, refine_landmarks=True) as face_mesh:
            records: List[Dict[str, Any]] = [] if return_records else None
            frame_idx = -1
            processed = 0

            while True:
                ok, frame = cap.read()
                if not ok:
                    break
                frame_idx += 1

                # 프레임 스키핑
                if frame_stride > 1 and (frame_idx % frame_stride != 0):
                    continue
                if max_frames is not None and processed >= max_frames:
                    break
                processed += 1

                img_h, img_w = frame.shape[:2]
                cam_mtx = _camera_matrix(img_w, img_h)

                results = face_mesh.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))

                pitch_deg = None
                label = "No face detected"

                if results.multi_face_landmarks:
                    lms = results.multi_face_landmarks[0].landmark
                    image_points = np.array(
                        [(int(lms[i].x * img_w), int(lms[i].y * img_h)) for i in LANDMARK_IDS],
                        dtype="double"
                    )

                    success_pnp, rvec, tvec = cv2.solvePnP(
                        MODEL_POINTS, image_points, cam_mtx, dist_coeffs, flags=cv2.SOLVEPNP_ITERATIVE
                    )
                    if success_pnp:
                        rmat, _ = cv2.Rodrigues(rvec)
                        sy = np.sqrt(rmat[0, 0] ** 2 + rmat[1, 0] ** 2)
                        singular = sy < 1e-6
                        if not singular:
                            x = np.arctan2(rmat[2, 1], rmat[2, 2])
                        else:
                            x = np.arctan2(-rmat[1, 2], rmat[1, 1])
                        pitch_deg = float(np.degrees(x))
                        label = _classify_pitch(pitch_deg)

                if label in head_pose_counts:
                    head_pose_counts[label] += 1

                if return_records:
                    records.append({
                        "frame": int(frame_idx),
                        "time_sec": round(float(processed / fps), 2) if fps > 0 else None,
                        "head_pose": label,
                        "pitch_deg": round(pitch_deg, 2) if pitch_deg is not None else None
                    })

                if cv2.waitKey(wait_ms) & 0xFF == ord('q'):
                    break

        # 요약 비율
        total = sum(head_pose_counts.values())
        ratios = None
        if total > 0:
            ratios = {
                "looking down ratio": round(head_pose_counts["looking down"] / total, 3),
                "looking front ratio": round(head_pose_counts["looking front"] / total, 3),
                "looking up ratio": round(head_pose_counts["looking up"] / total, 3),
            }

        # 저장(옵션)
        raw_path = None
        summary_path = None
        if save_raw and return_records:
            df = pd.DataFrame(records)
            raw_path = output_dir / raw_filename
            df.to_json(raw_path, orient="records", force_ascii=False, indent=4)

        if save_summary and ratios is not None:
            summary_path = output_dir / summary_filename
            with open(summary_path, "w", encoding="utf-8") as f:
                json.dump(ratios, f, ensure_ascii=False, indent=4)

        return {
            "ratios": ratios,
            "counts": head_pose_counts,
            "raw_path": str(raw_path) if raw_path else None,
            "summary_path": str(summary_path) if summary_path else None,
            "records": records if return_records else None
        }

    finally:
        # ===== 메모리/리소스 정리 =====
        try:
            cap.release()
        except Exception:
            pass
        try:
            cv2.destroyAllWindows()
        except Exception:
            pass
