import React, { useState, useRef, useEffect } from 'react';
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer
} from 'recharts';
import {
  CheckCircle, PauseCircle, Slash, Volume2, Activity, Mic, AudioLines, ExternalLink
} from 'lucide-react';
import './Analysis_Voice.css';

export default function AnalysisVoice() {
  const [fileInfo, setFileInfo] = useState({ audio: null, script: null, audioUrl: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [radarData, setRadarData] = useState([]);
  const [progress, setProgress] = useState(0);

  const audioInputRef = useRef(null);
  const scriptInputRef = useRef(null);
  const audioRef = useRef(null);

  useEffect(() => {
    if (fileInfo.audio && fileInfo.script) {
      handleUpload();
    }
  }, [fileInfo.audio, fileInfo.script]);

  const handleUpload = async () => {
    setError(null);
    setLoading(true);
    setResult(null);
    setProgress(0);

    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        return prev + 10;
      });
    }, 100);

    setTimeout(() => {
      const dummy = {
        scores: {
          pronunciation: 4.2,
          intonation: 3.8,
          speed: 4.0,
          filler: 4.5,
          pause: 3.5,
          mfcc: 4.1
        },
        features: {
          pronunciation_accuracy: 0.91,
          wpm: 140.2,
          filler_count: 3,
          pause_ratio: 0.08
        },
        feedback: "발음이 전반적으로 정확하며 억양과 속도도 안정적입니다. 일부 구간에서 간투사 사용을 줄이면 더 좋습니다.",
        stt_html_url: "/model/speech/results/stt_results.html"
      };
      setResult(dummy);
      setLoading(false);
    }, 1000);
  };

  const handleReplay = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play();
    }
  };

  const handleReload = () => window.location.reload();

  useEffect(() => {
    if (result) {
      setRadarData([
        { category: "발음", value: result.scores.pronunciation ?? 0 },
        { category: "억양", value: result.scores.intonation ?? 0 },
        { category: "속도", value: result.scores.speed ?? 0 },
        { category: "간투사", value: result.scores.filler ?? 0 },
        { category: "무음", value: result.scores.pause ?? 0 },
        { category: "안정성", value: result.scores.mfcc ?? 0 }
      ]);
    }
  }, [result]);

  const improvementTips = [
    { title: "발음 정확도", tip: "모음과 자음을 또렷하게 구분해서 발음해보세요." },
    { title: "발화 속도", tip: "너무 빠르지 않게, 청자가 따라올 수 있는 속도를 유지하세요." },
    { title: "억양 다양성", tip: "중요한 단어나 문장 끝에 억양을 넣어 감정을 표현해보세요." },
    { title: "간투사 사용", tip: "불필요한 '음', '어' 사용을 줄이기 위해 말 전 생각을 정리해보세요." },
    { title: "무음 비율", tip: "긴 침묵보다는 자연스러운 숨 고르기로 연결해보세요." },
    { title: "음색 안정성", tip: "일관된 발성 톤과 안정적인 발음을 유지해보세요." }
  ];

  return (
    <div className="container mx-auto p-8 space-y-12">
      <div className="max-w-xl mx-auto p-8 border border-gray-200 bg-[#f7f9fc] rounded-lg text-center">
        <Mic className="mx-auto mb-4 w-12 h-12 text-gray-400" />
        <h3 className="text-lg font-medium mb-2">음성 파일 업로드</h3>
        <p className="text-sm text-gray-500 mb-4">.mp3, .wav 파일 업로드 가능</p>

        <input
          type="file"
          accept="audio/*"
          ref={audioInputRef}
          className="hidden"
          onChange={e => {
            const file = e.target.files[0];
            if (file) {
              setFileInfo(prev => ({ ...prev, audio: file, audioUrl: URL.createObjectURL(file) }));
            }
          }}
        />
        <input
          type="file"
          accept=".txt"
          ref={scriptInputRef}
          className="hidden"
          onChange={e => {
            const file = e.target.files[0];
            if (file) {
              setFileInfo(prev => ({ ...prev, script: file }));
            }
          }}
        />

        <div className="flex justify-center gap-4">
          <button
            onClick={() => audioInputRef.current?.click()}
            className="px-6 py-3 bg-white rounded-full border border-gray-300 hover:bg-gray-100 transition"
          >
            음성 파일 선택
          </button>
          <button
            onClick={() => scriptInputRef.current?.click()}
            className="px-6 py-3 bg-white rounded-full border border-gray-300 hover:bg-gray-100 transition"
          >
            대본 파일 선택
          </button>
        </div>

        {fileInfo.audio && fileInfo.script && (
          <p className="text-sm text-gray-600 mt-4">
            🎧 {fileInfo.audio.name} + 📝 {fileInfo.script.name}
          </p>
        )}
      </div>

      {loading && (
        <div className="max-w-xl mx-auto text-center">
          <progress value={progress} max="100" className="custom-progress w-full h-2 mb-2" />
          <p className="text-sm text-gray-600">분석 중...</p>
        </div>
      )}

      {error && <div className="text-center text-red-500">{error}</div>}

      {result && (
        <ResultSection
          result={result}
          audioUrl={fileInfo.audioUrl}
          audioRef={audioRef}
          onReplay={handleReplay}
          onReload={handleReload}
          radarData={radarData}
          improvementTips={improvementTips}
        />
      )}
    </div>
  );
}

function ResultSection({ result, audioUrl, audioRef, onReplay, onReload, radarData, improvementTips }) {
  const totalScore = (Object.values(result.scores).reduce((a, b) => a + b, 0) / 6).toFixed(1);

  return (
    <div className="space-y-10">
      {audioUrl && (
        <div className="flex items-center space-x-4 max-w-xl mx-auto">
          <audio ref={audioRef} src={audioUrl} controls className="w-full" />
        </div>
      )}

      <div className="text-center text-xl font-semibold text-gray-700">
        🎯 전체 점수: {totalScore} / 5
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4 sm:gap-6">
        <ResultCard icon={<CheckCircle />} label="발음 정확도" value={`${(result.features.pronunciation_accuracy * 100).toFixed(1)}%`} />
        <ResultCard icon={<Volume2 />} label="발화 속도" value={`${result.features.wpm?.toFixed(1) ?? 'N/A'} WPM`} />
        <ResultCard icon={<Activity />} label="억양 다양성" value={`${result.scores.intonation?.toFixed(1) ?? 'N/A'} / 5`} />
        <ResultCard icon={<Slash />} label="간투사 사용" value={`${result.features.filler_count ?? 0}회`} />
        <ResultCard icon={<PauseCircle />} label="무음 비율" value={`${(result.features.pause_ratio * 100).toFixed(1)}%`} />
        <ResultCard icon={<AudioLines />} label="음색 안정성" value={`${result.scores.mfcc?.toFixed(1) ?? 'N/A'} / 5`} />
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <div className="p-4 bg-white border rounded-xl">
          <h4 className="text-md font-bold text-[#826BC4] mb-4 text-center">항목별 종합 점수 (0~5)</h4>
          <div className="w-full h-[300px]">
            <ResponsiveContainer>
              <RadarChart data={radarData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="category" />
                <PolarRadiusAxis angle={30} domain={[0, 5]} />
                <Radar name="Score" dataKey="value" stroke="#8884d8" fill="#8884d8" fillOpacity={0.6} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="p-4 bg-white border rounded-xl">
          <h4 className="text-md font-bold text-[#826BC4] mb-4 text-center">💡 항목별 개선 팁</h4>
          <ul className="space-y-2 text-sm text-gray-700">
            {improvementTips.map((item, idx) => (
              <li key={idx}><strong>{item.title}:</strong> {item.tip}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="bg-[#fdfdfd] border border-gray-200 rounded-lg p-6">
        <h4 className="text-md font-bold text-[#826BC4] mb-2">📝 종합 피드백</h4>
        <p className="text-gray-800">{result?.feedback ?? '피드백 없음'}</p>
      </div>

      <div className="flex flex-col sm:flex-row justify-center sm:justify-end items-center space-y-3 sm:space-y-0 sm:space-x-4 mt-6">
        <button onClick={onReplay} className="w-full sm:w-auto px-6 py-3 bg-[#4FB8A9] text-white font-semibold rounded-lg hover:bg-[#3fa295] transition">음성 재생</button>
        {result?.stt_html_url && (
          <a href={result.stt_html_url} target="_blank" rel="noopener noreferrer" className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-[#6B8DD6] text-white font-semibold rounded-lg hover:bg-[#5574bb] transition">
            <ExternalLink className="w-4 h-4 text-white" />
            <span>발음 분석 결과</span>
          </a>
        )}
        <button onClick={onReload} className="w-full sm:w-auto px-6 py-3 border border-gray-300 font-normal rounded-lg hover:bg-gray-100 transition">다시 분석하기</button>
      </div>
    </div>
  );
}

function ResultCard({ icon, label, value }) {
  return (
    <div className="p-4 bg-white rounded-lg shadow text-center">
      <div className="mb-1 text-[#5686C4] mx-auto w-6 h-6">{icon}</div>
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-sm text-gray-500">{label}</p>
    </div>
  );
}
