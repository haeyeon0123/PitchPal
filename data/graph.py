import pandas as pd
import matplotlib.pyplot as plt  

df = pd.read_csv('data file name', index_col=0)
df.plot(kind='line')
plt.show() 