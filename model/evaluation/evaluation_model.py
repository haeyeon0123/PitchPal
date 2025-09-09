import os, sys
from pathlib import Path
from typing import Optional, Tuple, Dict, List

sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))  # PitchPal 루트 추가

import numpy as np
import pandas as pd
import time
import joblib
import json
from pathlib import Path
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans
from sklearn.ensemble import RandomForestRegressor
from sklearn.multioutput import MultiOutputRegressor

from model.speech.core.speech_analysis import analyze_speech
from model.speech.core.stt_pronunciation import load_whisper_model

DEFAULT_MODEL_PATH = "model/evaluation"
DEFAULT_DATA_PATH = "data/PitchPal_survey2.csv"


class SpeechEvaluator:
    """
    클러스터링 기반 회귀 모델을 통한 발표 음성 평가 시스템
    - 입력 피처를 기반으로 KMeans로 군집화
    - 각 군집마다 별도의 회귀 모델(RandomForest) 학습
    - 새 입력은 군집 예측 후 해당 모델로 평가 점수 예측
    - 예측 점수는 항목별 상한(cap)을 기준으로 10점 만점 환산
    """

    def __init__(self, n_clusters: int = 3):
        self.n_clusters = n_clusters
        self.scaler = StandardScaler()
        self.kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
        self.cluster_models: Dict[int, MultiOutputRegressor] = {}
        self.target_columns: List[str] = []

        # 항목별 상한(cap) 및 감점 강도(slope)
        self.cap_by_col: Dict[str, float] = {}
        self.slope_by_col: Dict[str, float] = {}

    def _init_caps_and_slopes(self):
        caps = {col: 5.0 for col in self.target_columns}
        for special in ("발화 속도", "휴지"):
            if special in caps:
                caps[special] = 3.0
        self.cap_by_col = caps

        slopes = {col: 2.0 for col in self.target_columns}  # 기본
        for sensitive in ("발화 속도", "휴지"):
            if sensitive in slopes:
                slopes[sensitive] = 3.0
        self.slope_by_col = slopes

    def fit(
        self,
        X: Optional[pd.DataFrame] = None,
        y: Optional[pd.DataFrame] = None,
        csv_path: Optional[str] = DEFAULT_DATA_PATH
    ):
        """
        학습 데이터로 모델 학습 (직접 입력 또는 CSV 경로 제공)
        """
        if X is None or y is None:
            if csv_path:
                df = pd.read_csv(csv_path).dropna()
                try:
                    X = df[[
                        '발음 유사도 점수', 'MFCC 평균', 'MFCC 표준편차',
                        'Pitch 평균 (Hz)', 'Pitch 표준편차 (Hz)',
                        'WPM (Words Per Minute)', '무음 구간 비율', '간투사 수'
                    ]]
                    y = df[['발음 정확도', '발화 속도', '억양', '휴지', '간투사', '매끄러움']]
                except KeyError as e:
                    raise ValueError(f"❗ 학습 CSV에서 필요한 열이 누락되었습니다: {e}")
            else:
                raise ValueError("❗ fit() 호출 시 학습 데이터가 없습니다 (X/y 또는 csv_path 필요)")

        self.target_columns = y.columns.tolist()
        self._init_caps_and_slopes()

        X_scaled = self.scaler.fit_transform(X)
        self.kmeans.fit(X_scaled)
        cluster_labels = self.kmeans.predict(X_scaled)

        for cluster_id in np.unique(cluster_labels):
            X_cluster = X_scaled[cluster_labels == cluster_id]
            y_cluster = y.iloc[cluster_labels == cluster_id]
            model = MultiOutputRegressor(RandomForestRegressor(n_estimators=100, random_state=42))
            model.fit(X_cluster, y_cluster)
            self.cluster_models[cluster_id] = model

    def _score_with_penalty(self, col: str, values: np.ndarray) -> np.ndarray:
        """
        항목별 상한(cap)과 감점 강도(slope)를 이용해 10점 만점 점수로 변환
        """
        cap = self.cap_by_col[col]
        slope = self.slope_by_col[col]

        values = np.asarray(values, dtype=float)
        base = (values / cap) * 10.0
        penalty = 10.0 - slope * (values - cap)

        scores = np.where(values <= cap, base, penalty)
        scores = np.clip(scores, 0.0, 10.0)
        return scores

    def predict_from_features(self, input_features: pd.DataFrame, save_path: str = "model/evaluation/results/predicted_scores.json") -> Tuple[pd.DataFrame, np.ndarray]:
        """
        입력 피처로부터 평가 점수 예측 + JSON 저장
        """
        X_input = self.scaler.transform(input_features)
        cluster_ids = self.kmeans.predict(X_input)

        predictions = []
        for i, row in enumerate(X_input):
            cluster_id = cluster_ids[i]
            if cluster_id not in self.cluster_models:
                raise RuntimeError(f"❗ 예측에 필요한 클러스터 모델이 없습니다 (cluster_id={cluster_id})")
            model = self.cluster_models[cluster_id]
            pred = model.predict(row[np.newaxis, :])[0]
            predictions.append(pred)

        # 원래 예측값
        raw_df = pd.DataFrame(predictions, columns=self.target_columns)

        # 점수화된 결과
        scored_df = pd.DataFrame(index=raw_df.index)
        for col in self.target_columns:
            scored_df[col] = self._score_with_penalty(col, raw_df[col].values)

        scored_df['사용된 클러스터'] = cluster_ids

        # JSON 저장
        result_json = {
            "scores": scored_df.to_dict(orient="records"),
            "cluster_ids": cluster_ids.tolist()
        }

        save_path = Path(save_path)
        save_path.parent.mkdir(parents=True, exist_ok=True)
        with open(save_path, "w", encoding="utf-8") as f:
            json.dump(result_json, f, ensure_ascii=False, indent=2)

        return scored_df, (cluster_ids[0] if len(cluster_ids) == 1 else cluster_ids)

    def save_model(self, path: str = DEFAULT_MODEL_PATH):
        """모델 구성 저장"""
        os.makedirs(path, exist_ok=True)
        joblib.dump(self.scaler, os.path.join(path, 'scaler.pkl'))
        joblib.dump(self.kmeans, os.path.join(path, 'kmeans.pkl'))
        joblib.dump(self.cluster_models, os.path.join(path, 'cluster_models.pkl'))
        joblib.dump(self.target_columns, os.path.join(path, 'target_columns.pkl'))
        joblib.dump(self.cap_by_col, os.path.join(path, 'cap_by_col.pkl'))
        joblib.dump(self.slope_by_col, os.path.join(path, 'slope_by_col.pkl'))

    def load_model(self, path: str = DEFAULT_MODEL_PATH):
        """모델 구성 불러오기"""
        self.scaler = joblib.load(os.path.join(path, 'scaler.pkl'))
        self.kmeans = joblib.load(os.path.join(path, 'kmeans.pkl'))
        self.cluster_models = joblib.load(os.path.join(path, 'cluster_models.pkl'))
        self.target_columns = joblib.load(os.path.join(path, 'target_columns.pkl'))

        cap_path = os.path.join(path, 'cap_by_col.pkl')
        slope_path = os.path.join(path, 'slope_by_col.pkl')
        if os.path.exists(cap_path) and os.path.exists(slope_path):
            self.cap_by_col = joblib.load(cap_path)
            self.slope_by_col = joblib.load(slope_path)
        else:
            self._init_caps_and_slopes()


# === 학습 및 저장 예시 ===
# evaluator = SpeechEvaluator()
# evaluator.fit()  # 기본 CSV 사용
# evaluator.save_model()
# print("✅ 모델 저장 완료")
