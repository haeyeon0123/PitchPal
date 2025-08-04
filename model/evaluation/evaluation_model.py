import pandas as pd
import numpy as np
import joblib
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans
from sklearn.ensemble import RandomForestRegressor
from sklearn.multioutput import MultiOutputRegressor
from typing import Tuple
import os

DEFAULT_MODEL_PATH = "model/evaluation"
DEFAULT_DATA_PATH = "data/PitchPal_survey2.csv"

class SpeechEvaluator:
    """
    클러스터링 기반 회귀 모델을 통한 발표 음성 평가 시스템
    - 입력 피처를 기반으로 KMeans로 군집화
    - 각 군집마다 별도의 회귀 모델(RandomForest)을 학습
    - 새 입력은 군집 예측 후 해당 모델로 평가 점수 예측
    - 학습된 모델은 저장/불러오기 가능
    클러스터	  특징 요약	발표                             스타일	개선 방향
    Cluster 0	발음 정확도 높고, 간투사 적고, 속도 적절	    안정적이고 자연스러운 발표	유지 또는 세부 피드백만 제공
    Cluster 1	속도가 느리거나 간투사 많음, 억양 평탄	        다소 단조롭고 불안정한 발표	억양·간투사 개선 필요
    Cluster 2	빠른 속도, pitch 변화 크지만 발음 정확도 낮음	급하게 말하거나 불안정한 스타일	발음 훈련, 속도 조절 필요
    """

    def __init__(self, n_clusters=3):
        self.n_clusters = n_clusters
        self.scaler = StandardScaler()
        self.kmeans = KMeans(n_clusters=n_clusters, random_state=42)
        self.cluster_models = {}
        self.target_columns = []

    def fit(self, X: pd.DataFrame = None, y: pd.DataFrame = None, csv_path: str = DEFAULT_DATA_PATH):
        """
        학습 데이터로 모델 학습 (직접 입력 또는 CSV 경로 제공)
        Parameters:
        - X, y: 직접 전달된 입력 피처 및 평가 항목
        - csv_path: CSV 경로로부터 로딩하는 경우 (기본: data/PitchPal_survey2.csv)
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
        X_scaled = self.scaler.fit_transform(X)
        self.kmeans.fit(X_scaled)
        cluster_labels = self.kmeans.predict(X_scaled)

        for cluster_id in np.unique(cluster_labels):
            X_cluster = X_scaled[cluster_labels == cluster_id]
            y_cluster = y.iloc[cluster_labels == cluster_id]
            model = MultiOutputRegressor(RandomForestRegressor(n_estimators=100, random_state=42))
            model.fit(X_cluster, y_cluster)
            self.cluster_models[cluster_id] = model

    def predict(self, input_features: pd.DataFrame) -> Tuple[pd.DataFrame, int]:
        """
        입력 피처로부터 평가 점수를 예측
        Parameters:
        - input_features: 입력 피처 (1개 또는 여러 샘플)
        Returns:
        - 예측 결과 DataFrame
        - 사용된 군집 번호
        """
        X_input = self.scaler.transform(input_features)
        cluster_ids = self.kmeans.predict(X_input)

        predictions = []
        for i, row in enumerate(X_input):
            cluster_id = cluster_ids[i]
            model = self.cluster_models[cluster_id]
            pred = model.predict(row.reshape(1, -1))[0]
            predictions.append(pred)

        result_df = pd.DataFrame(predictions, columns=self.target_columns)
        result_df['사용된 클러스터'] = cluster_ids
        return result_df, cluster_ids[0] if len(cluster_ids) == 1 else cluster_ids

    def save_model(self, path: str = DEFAULT_MODEL_PATH):
        """모델 전체 구성 저장 (기본: model/evaluation)"""
        if not self.cluster_models:
            raise ValueError("❗ 클러스터 회귀 모델이 비어 있습니다. 먼저 fit()을 호출해야 합니다.")
        os.makedirs(path, exist_ok=True)
        joblib.dump(self.scaler, os.path.join(path, 'scaler.pkl'))
        joblib.dump(self.kmeans, os.path.join(path, 'kmeans.pkl'))
        joblib.dump(self.cluster_models, os.path.join(path, 'cluster_models.pkl'))
        joblib.dump(self.target_columns, os.path.join(path, 'target_columns.pkl'))

    def load_model(self, path: str = DEFAULT_MODEL_PATH):
        """모델 구성 불러오기 (기본: model/evaluation)"""
        self.scaler = joblib.load(os.path.join(path, 'scaler.pkl'))
        self.kmeans = joblib.load(os.path.join(path, 'kmeans.pkl'))
        self.cluster_models = joblib.load(os.path.join(path, 'cluster_models.pkl'))
        self.target_columns = joblib.load(os.path.join(path, 'target_columns.pkl'))

# 학습 및 저장 (현재는 저장 완료)
# print("🚀 SpeechEvaluator 학습 및 저장 실행")
# evaluator = SpeechEvaluator()
# evaluator.fit()  # 기본 CSV 로드하여 학습
# evaluator.save_model()  # model/evaluation에 저장
# print("✅ 모델 저장 완료")