import pandas as pd
import matplotlib.pyplot as plt

# 데이터 불러오기
df = pd.read_csv('data/PitchPal_survey.csv')  # \ 대신 / 사용 (cross-platform 호환성 위해)
df.index.name = 'Index'  # x축 이름 설정 (선택 사항)

# 필요한 컬럼만 선택
columns_to_plot = ['발화 속도', 'wps', 'char_speed']

# 선 그래프 (Line Plot)
plt.figure(figsize=(12, 6))
for col in columns_to_plot:
    plt.plot(df.index, df[col], label=col)
plt.title('speech speed evaluation')
plt.xlabel('Index')
plt.ylabel('Value')
plt.legend()
plt.grid(True)
plt.show()
