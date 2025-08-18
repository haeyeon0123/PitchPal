# model/speech/service.py
from __future__ import annotations
from typing import Dict, Any, List, Optional
import math, traceback
from pathlib import Path

# 코어 분석: 세그먼트/피치/MFCC/WPM/간투사/침묵/발음유사도(+ STT diff HTML)
from model.speech.core.speech_analysis import (
    analyze_speech,
    save_segment_features_to_json,
)

# (옵션) 외부 발음평가 API를 쓰고 싶다면 주석 해제
# from model.speech.service_etri import call_etri_pronunciation

# (옵션) 평가모델: 없으면 자동으로 건너뜀
try:
    from model.evaluation.evaluation_model import SpeechEvaluator  # 사용자 프로젝트에 맞춤
    _HAS_EVALUATOR = True
except Exception:
    _HAS_EVALUATOR = False


# ---------------------------
# 유틸
# ---------------------------
def _to_f(x, dflt=0.0):
    try:
        v = float(x)
        if math.isnan(v) or math.isinf(v):
            return dflt
        return v
    except Exception:
        return dflt

def _pct01(x) -> float:
    v = _to_f(x, 0.0)
    return max(0.0, min(1.0, v))

def _parse_time_range(tr: str) -> tuple[float, float]:
    try:
        a, b = str(tr).split("-")
        return float(a), float(b)
    except Exception:
        return 0.0, 0.0


# ---------------------------
# 정규화: core.speech_analysis → 프론트 타깃 스키마(영문, 일관)
# ---------------------------
def _normalize_from_core(raw: Dict[str, Any]) -> Dict[str, Any]:
    segs = raw.get("segments") or []

    wpm_segments: List[Dict[str, Any]] = []
    pitch_timeline: List[Dict[str, float]] = []
    silence_abs: List[Dict[str, float]] = []
    fillers_all: List[Dict[str, Any]] = []

    for seg in segs:
        st, et = _parse_time_range(seg.get("time_range", "0-0"))

        # WPM 막대차트
        wpm_segments.append({
            "start": st,
            "end": et,
            "wpm": _to_f(seg.get("wpm", 0.0))
        })

        # 피치 타임라인(세그 평균을 세그 중앙시간에 매핑)
        pm = seg.get("pitch_mean", 0.0)
        mid = (st + et) / 2.0
        pitch_timeline.append({"t": mid, "value": _to_f(pm)})

        # 세그 내부 'silence'는 상대초 → 절대초로 변환
        for s, e in (seg.get("silence") or []):
            silence_abs.append({"start": st + _to_f(s), "end": st + _to_f(e)})

        # 세그 내부 'fillers': ["음", 12.3, 12.6] 또는 ["음", None, None]
        for item in (seg.get("fillers") or []):
            if isinstance(item, (list, tuple)) and len(item) >= 1:
                token = item[0]
                start = item[1] if len(item) > 1 else None
                end   = item[2] if len(item) > 2 else None
                rec = {"token": token}
                if start is not None: rec["time"] = _to_f(start)
                if end   is not None: rec["end"]  = _to_f(end)
                fillers_all.append(rec)

    # 전역 KPI (한글 키 → 영문 키)
    pronunciation_accuracy_pct = _to_f(raw.get("발음 유사도 점수", 0.0))  # 0~100
    pause_ratio = _pct01(raw.get("무음 구간 비율", 0.0))                # 0~1
    wpm = _to_f(raw.get("wpm", 0.0))
    filler_count = int(raw.get("간투사 수", len(fillers_all)))

    mfcc_mean = raw.get("MFCC 평균") or []
    mfcc_std  = raw.get("MFCC 표준편차") or []

    pitch_mean = _to_f(raw.get("Pitch 평균", 0.0))
    pitch_std  = _to_f(raw.get("Pitch 표준편차", 0.0))

    # 길이 추정
    duration = 0.0
    if wpm_segments:
        duration = max(x["end"] for x in wpm_segments)
    elif pitch_timeline:
        duration = max(x["t"] for x in pitch_timeline)

    return {
        # KPI (정확도는 0~1로 통일)
        "pronunciation_accuracy": _pct01(pronunciation_accuracy_pct / 100.0),
        "wpm": wpm,
        "pause_ratio": pause_ratio,
        "filler_count": filler_count,
        "fillers": fillers_all,

        # 차트
        "segments": wpm_segments,          # [{start,end,wpm}]
        "pitch_timeline": pitch_timeline,  # [{t,value}]
        "silence": silence_abs,            # [{start,end}]

        # MFCC/보조지표
        "mfcc_mean": mfcc_mean,
        "mfcc_std":  mfcc_std,

        # 선택 점수(초기값 0)
        "overall_score": 0.0,
        "intonation_score": 0.0,
        "stability_score": 0.0,

        "duration": duration,
        "stt_result_url": raw.get("stt_result_url"),
        "pitch_mean": pitch_mean,
        "pitch_std": pitch_std,
    }


# ---------------------------
# 퍼사드: 파일 경로 받아 단일 JSON 반환
# ---------------------------
def analyze_speech_all(
    audio_path: str,
    script_path: Optional[str],
    *,
    save_segments_json: bool = False,   # 세그먼트 원본 JSON 저장/URL 제공 옵션
) -> Dict[str, Any]:
    """
    1) core.analyze_speech 호출
    2) 프론트 타깃 스키마로 정규화
    3) (옵션) 세그먼트 JSON 파일 저장 + URL 포함
    4) (옵션) 외부평가/예측모델 병합
    """
    # 1) 코어 호출
    try:
        raw = analyze_speech(audio_path, script_path, model=None)
    except Exception as e:
        traceback.print_exc()
        raw = None

    # 실패/빈 값일 때도 키 보장
    if not raw:
        return {
            "pronunciation_accuracy": 0.0, "wpm": 0.0, "pause_ratio": 0.0,
            "filler_count": 0, "fillers": [],
            "segments": [], "pitch_timeline": [], "silence": [],
            "mfcc_mean": [], "mfcc_std": [],
            "overall_score": 0.0, "intonation_score": 0.0, "stability_score": 0.0,
            "duration": 0.0, "stt_result_url": None
        }

    # 2) 프론트 스키마로 정규화
    out = _normalize_from_core(raw)

    # 3) (옵션) 세그먼트 JSON 저장
    if save_segments_json and isinstance(raw.get("segments"), list):
        out_dir = Path("model/speech/results")
        out_dir.mkdir(parents=True, exist_ok=True)
        seg_path = out_dir / "segments_results.json"
        try:
            save_segment_features_to_json(raw["segments"], str(seg_path))
            out["segments_json_url"] = "/model/speech/results/segments_results.json"
        except Exception:
            traceback.print_exc()

    # 4) (옵션) 외부 발음평가(ETRI 등) 보정
    # if script_path:
    #     try:
    #         with open(script_path, "r", encoding="utf-8") as f:
    #             script_text = f.read()
    #         etri = call_etri_pronunciation(audio_path, script_text)
    #         if etri.get("success"):
    #             out["pronunciation_accuracy"] = float(etri["pronunciation_accuracy"])
    #             out.setdefault("providers", []).append({"name": "ETRI", "ok": True})
    #     except Exception:
    #         traceback.print_exc()

    # 5) (옵션) 평가모델 점수 예측
    if _HAS_EVALUATOR:
        try:
            import pandas as pd
            df = pd.DataFrame([{
                "발음 유사도 점수": out["pronunciation_accuracy"] * 100.0,  # 0~100 (주의: *100 한 번만)
                "MFCC 평균": (out["mfcc_mean"][0] if out["mfcc_mean"] else 0.0),
                "MFCC 표준편차": (out["mfcc_std"][0] if out["mfcc_std"] else 0.0),
                "Pitch 평균 (Hz)": out.get("pitch_mean", 0.0),
                "Pitch 표준편차 (Hz)": out.get("pitch_std", 0.0),
                "WPM (Words Per Minute)": out["wpm"],
                "무음 구간 비율": out["pause_ratio"],  # 0~1
                "간투사 수": out["filler_count"],
            }])
            evaluator = SpeechEvaluator()
            evaluator.load_model()
            pred_df, cluster_id = evaluator.predict(df)
            out["overall_score"] = float(pred_df.iloc[0, 0]) if not pred_df.empty else 0.0
            out["cluster_id"] = cluster_id
        except Exception:
            # 모델이 없거나 실패해도 API는 정상동작
            traceback.print_exc()

    return out
