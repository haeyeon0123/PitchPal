import cv2, json, math, time
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple, Union

# from mediapipe.python.solutions.face_mesh 만 쓰기 (tasks 불러오지 않음)
from mediapipe.python.solutions.face_mesh import FaceMesh

import pandas as pd

# ===== Utils =====
def euclidean_distance(p1, p2) -> float:
    return math.sqrt((p1[0]-p2[0])**2 + (p1[1]-p2[1])**2)

# 눈 깜빡임 평가 함수
def blink_frequency_grade(blinks_per_min: float) -> Tuple[str, str]:
    if 10 <= blinks_per_min <= 20:
        return "정상", "안정된 상태"
    elif 21 <= blinks_per_min <= 30:
        return "주의", "약간의 긴장 상태"
    elif blinks_per_min >= 31:
        return "경고", "높은 긴장/불안 상태"
    else:
        return "정보 부족", ""

# EAR 계산
def calculate_ear(landmarks, eye_indices) -> Optional[float]:
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

DEFAULT_EAR_THRESHOLD = 0.21
DEFAULT_CLOSED_FRAMES = 1

def analyze_eye_blink(
    video_path: Union[str, Path],
    *,
    ear_threshold: float = DEFAULT_EAR_THRESHOLD,
    closed_frames: int = DEFAULT_CLOSED_FRAMES,
    frame_stride: int = 1,
    max_frames: Optional[int] = None,
    save_raw: bool = True,
    save_summary: bool = True,
    output_dir: Union[str, Path] = "model/video",
    raw_filename: str = "blink_data.json",
    summary_filename: str = "eye_blink_analysis_summary.json",
    return_records: bool = True
) -> Dict[str, Any]:
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise FileNotFoundError(f"❌ 영상 파일을 열 수 없습니다: {video_path}")

    try:
        fps = cap.get(cv2.CAP_PROP_FPS) or 0.0
        if fps <= 0:
            fps = 30.0  # 일부 영상에서 0이 나오는 문제 폴백

        wait_time_ms = int(1000 / fps) if fps > 0 else 1

        with FaceMesh(max_num_faces=1) as face_mesh:

            blink_count = 0
            frame_idx = -1
            frame_counter = 0
            start_time = time.time()

            records: List[Dict[str, Any]] = [] if return_records else None
            processed = 0

            while True:
                ret, frame = cap.read()
                if not ret:
                    break
                frame_idx += 1

                # 프레임 스키핑
                if frame_stride > 1 and (frame_idx % frame_stride != 0):
                    continue
                if max_frames is not None and processed >= max_frames:
                    break
                processed += 1

                h, w = frame.shape[:2]
                rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                result = face_mesh.process(rgb_frame)

                blink = False
                avg_ear = None

                if result.multi_face_landmarks:
                    lms = result.multi_face_landmarks[0].landmark
                    points = [(int(lm.x * w), int(lm.y * h)) for lm in lms]

                    left_ear = calculate_ear(points, LEFT_EYE_IDX)
                    right_ear = calculate_ear(points, RIGHT_EYE_IDX)
                    if left_ear is not None and right_ear is not None:
                        avg_ear = (left_ear + right_ear) / 2.0

                    if (avg_ear is not None) and (avg_ear < ear_threshold):
                        frame_counter += 1
                    else:
                        if frame_counter >= closed_frames:
                            blink = True
                            blink_count += 1
                        frame_counter = 0

                if return_records:
                    records.append({
                        "frame": int(frame_idx),
                        "EAR": round(float(avg_ear), 4) if avg_ear is not None else None,
                        "blink": bool(blink),
                    })

                if cv2.waitKey(wait_time_ms) & 0xFF == ord('q'):
                    break

        total_time_sec = processed / fps if fps > 0 else 0.0
        total_time_min = total_time_sec / 60.0 if total_time_sec > 0 else 0.0
        blinks_per_min = (blink_count / total_time_min) if total_time_min > 0 else 0.0

        duration_str = f"{int(total_time_sec // 60)}분 {int(total_time_sec % 60)}초"
        blink_grade, blink_interpretation = blink_frequency_grade(blinks_per_min)

        summary = {
            "분석 영상 길이": duration_str,
            "처리 프레임 수": int(processed),
            "프레임 스키핑": int(frame_stride),
            "눈 깜빡임 횟수": int(blink_count),
            "눈 깜빡임 빈도 (회/분)": round(float(blinks_per_min), 2),
            "눈 깜빡임 평가 등급": blink_grade,
            "눈 깜빡임 해석": blink_interpretation
        }

        raw_path = None
        summary_path = None
        if save_raw and return_records:
            df = pd.DataFrame(records)
            raw_path = output_dir / raw_filename
            df.to_json(raw_path, orient="records", force_ascii=False, indent=4)
        if save_summary:
            summary_path = output_dir / summary_filename
            with open(summary_path, "w", encoding="utf-8") as f:
                json.dump(summary, f, ensure_ascii=False, indent=4)

        return {
            "summary": summary,
            "raw_path": str(raw_path) if raw_path else None,
            "summary_path": str(summary_path) if summary_path else None,
            "records": records if return_records else None
        }

    finally:
        try:
            cap.release()
        except Exception:
            pass
        try:
            cv2.destroyAllWindows()
        except Exception:
            pass
