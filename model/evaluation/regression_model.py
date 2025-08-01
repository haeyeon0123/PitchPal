import os
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_squared_error, r2_score
import joblib

# 🔧 디렉토리 생성
os.makedirs("evaluation", exist_ok=True)  # 디렉토리가 없으면 생성

# 데이터 로드
df = pd.read_csv("data/PitchPal_survey2.csv")

### [1] 발화 속도 예측 모델
df_speed = df[["WPM (Words Per Minute)", "무음 구간 비율", "발화 속도"]].dropna()
X_speed = df_speed[["WPM (Words Per Minute)", "무음 구간 비율"]]
y_speed = df_speed["발화 속도"]

model_speed = LinearRegression()
model_speed.fit(X_speed, y_speed)

# ✅ 모델 저장
joblib.dump(model_speed, "model/evaluation/model_speed.pkl")

# 평가 출력
y_speed_pred = model_speed.predict(X_speed)
print("📌 [발화 속도 예측]")
print("회귀계수:", model_speed.coef_)
print("절편:", model_speed.intercept_)
print("R2 점수:", r2_score(y_speed, y_speed_pred))
print("MSE:", mean_squared_error(y_speed, y_speed_pred))
print()

### [2] 발음 정확도 예측 모델
df_pron = df[["발음 유사도 점수", "발음 정확도"]].dropna()
X_pron = df_pron[["발음 유사도 점수"]]
y_pron = df_pron["발음 정확도"]

model_pron = LinearRegression()
model_pron.fit(X_pron, y_pron)

# ✅ 모델 저장
joblib.dump(model_pron, "model/evaluation/model_pron.pkl")

# 평가 출력
y_pron_pred = model_pron.predict(X_pron)
print("📌 [발음 정확도 예측]")
print("회귀계수:", model_pron.coef_[0])
print("절편:", model_pron.intercept_)
print("R2 점수:", r2_score(y_pron, y_pron_pred))
print("MSE:", mean_squared_error(y_pron, y_pron_pred))