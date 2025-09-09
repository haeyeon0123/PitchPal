# model/video/pipeline.py  (실데이터 강제)
from __future__ import annotations
from pathlib import Path
from typing import Dict, Any, List, Optional
import uuid, json, math
import cv2

from model.video.eye_blink_counter import analyze_eye_blink
from model.video.head_direction_detector import analyze_head_pitch
from model.emotion.real_time_video_adapter import run_emotion_analysis

def _sec_binned_ear_and_blinks(records: List[Dict[str, Any]], fps: float) -> Dict[str, Any]:
    if not records or fps <= 0:
        raise RuntimeError("Blink records empty or invalid FPS.")
    max_frame = max((r.get("frame") or 0) for r in records)
    total_sec = int(math.floor(max_frame / fps)) + 1
    sums = [0.0]*total_sec; cnts = [0]*total_sec; blink_sec=[0]*total_sec
    for r in records:
        f = int(r.get("frame") or 0); s = int(f // fps)
        if 0 <= s < total_sec:
            ear = r.get("EAR")
            if isinstance(ear,(int,float)):
                sums[s]+=float(ear); cnts[s]+=1
            if r.get("blink"): blink_sec[s]=1
    ear_sec=[]
    last=None
    for s in range(total_sec):
        if cnts[s]==0:
            if last is None: raise RuntimeError("EAR binning failed: no samples.")
            ear_sec.append(round(last,4))
        else:
            v=sums[s]/cnts[s]; last=v; ear_sec.append(round(v,4))
    return {"ear":ear_sec,"events":[{"t":s,"blink":1} for s,v in enumerate(blink_sec) if v]}

def _sec_binned_pitch(records: List[Dict[str, Any]]) -> List[float]:
    if not records: raise RuntimeError("Headpose records empty.")
    times=[float(r.get("time_sec")) for r in records if isinstance(r.get("time_sec"),(int,float))]
    if not times: raise RuntimeError("Headpose records missing time_sec.")
    total_sec=int(math.floor(max(times)))+1
    sums=[0.0]*total_sec; cnts=[0]*total_sec
    for r in records:
        t=r.get("time_sec")
        if not isinstance(t,(int,float)): continue
        s=int(math.floor(t))
        if 0<=s<total_sec:
            pd=r.get("pitch_deg")
            if isinstance(pd,(int,float)):
                sums[s]+=(-float(pd))   # 프론트 기준(+상/-하)
                cnts[s]+=1
    out=[]
    for s in range(total_sec):
        if cnts[s]==0: raise RuntimeError("Pitch binning failed: empty second bin.")
        out.append(round(sums[s]/cnts[s],2))
    return out

def run_blink_analysis(video_path: str, out_dir: str | Path) -> Dict[str, Any]:
    out_dir=Path(out_dir); out_dir.mkdir(parents=True, exist_ok=True)
    res=analyze_eye_blink(video_path, output_dir=out_dir,
                          raw_filename="blink_records.json",
                          summary_filename="blink_summary.json",
                          save_raw=True, save_summary=True, return_records=True)
    cap=cv2.VideoCapture(str(video_path)); fps=cap.get(cv2.CAP_PROP_FPS) or 0.0; cap.release()
    if fps<=0: raise RuntimeError("Invalid FPS for blink.")
    binned=_sec_binned_ear_and_blinks(res.get("records") or [], float(fps))
    summary=res.get("summary") or {}
    return {"ear":binned["ear"], "blink":{"summary":summary,"timeline":binned["events"]}, "blink_summary":summary}

def run_headpose_analysis(video_path: str, out_dir: str | Path) -> Dict[str, Any]:
    out_dir=Path(out_dir); out_dir.mkdir(parents=True, exist_ok=True)
    res=analyze_head_pitch(video_path, output_dir=out_dir,
                           raw_filename="head_pose_records.json",
                           summary_filename="head_pose_summary.json",
                           save_raw=True, save_summary=True, return_records=True)
    ratios=res.get("ratios") or None
    records=res.get("records") or []
    pitch_sec=_sec_binned_pitch(records)
    return {"head_pose":{"ratios":ratios,"records":records},
            "head_pose_summary":ratios, "head_pose_records":records, "pitch":pitch_sec}

def run_emotion(video_path: str, out_dir: str | Path) -> Dict[str, Any]:
    out_dir=Path(out_dir)/"emotion"
    res=run_emotion_analysis(video_path, out_dir=out_dir, save_timeline=False, timeline_every_s=1)
    if not res.get("distribution"): raise RuntimeError("Emotion distribution empty.")
    return {
        "distribution":res.get("distribution"),
        "counts":res.get("counts"),
        "most_common_emotion":res.get("most_common_emotion"),
        "warning":res.get("warning"),
        "negative_emotion_ratio":res.get("negative_emotion_ratio")
    }

def analyze_video(video_path: str, results_root: str="model/video/results", session_id: Optional[str]=None) -> Dict[str, Any]:
    p=Path(video_path); 
    if not p.exists(): raise FileNotFoundError(f"Video not found: {video_path}")
    sid=session_id or uuid.uuid4().hex
    out_dir=Path(results_root)/sid; out_dir.mkdir(parents=True, exist_ok=True)

    cap=cv2.VideoCapture(str(p))
    fps=cap.get(cv2.CAP_PROP_FPS) or 0.0
    frames=cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0.0
    cap.release()
    if fps<=0: raise RuntimeError("Invalid FPS on meta.")
    duration_sec=round(frames/fps,2)
    meta={"filename":p.name,"duration_sec":duration_sec,"fps":float(fps)}

    blink=run_blink_analysis(str(p), out_dir)
    headpose=run_headpose_analysis(str(p), out_dir)
    emotion=run_emotion(str(p), out_dir)

    result={
        "session_id":sid,
        "video":meta,
        "ear":blink["ear"],
        "blink_summary":blink["blink_summary"],
        "blink":blink["blink"],
        "head_pose":headpose["head_pose"],
        "head_pose_summary":headpose["head_pose_summary"],
        "head_pose_records":headpose["head_pose_records"],
        "pitch":headpose["pitch"],
        "distribution":emotion["distribution"],
        "counts":emotion["counts"],
        "most_common_emotion":emotion["most_common_emotion"],
        "warning":emotion["warning"],
        "negative_emotion_ratio":emotion["negative_emotion_ratio"],
        "saved":{"dir":str(out_dir).replace("\\","/"),
                 "json":str((out_dir/"analysis.json")).replace("\\","/")}
    }
    with open(out_dir/"analysis.json","w",encoding="utf-8") as f:
        json.dump(result,f,ensure_ascii=False,indent=2)
    return result
