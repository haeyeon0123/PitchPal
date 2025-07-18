/* 음성 분석 페이지: 기능 및 디자인 */

import React, { useState, useRef } from 'react';
import axios from 'axios';  // ✅ axios 추가
import './Analysis_Voice.css';
import {
  Mic2, Clock, CheckCircle, Slash, PauseCircle, Activity, Volume2
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  BarChart, Bar, ResponsiveContainer
} from 'recharts';

export default function AnalysisVoice() {
  const [file, setFile] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [stats, setStats] = useState(null);
  const [speedData, setSpeedData] = useState([]);
  const [pitchAndVolumeData, setPitchAndVolumeData] = useState([]);
  const [fillerData, setFillerData] = useState([]);
  const [pauseData, setPauseData] = useState([]);
  const [tips, setTips] = useState([]);

  const audioRef = useRef(null);
  const fileInputRef = useRef(null);
  const playerRef = useRef(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // ✅ 실제 API 연동
  const fetchAnalysisResult = async (file) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await axios.post('http://localhost:8000/analyze-audio', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });

    return response.data;
  };

  const handleFileSelect = async (e) => {
    const selected = e.target.files[0];
    if (!selected) return;

    setFile(selected);
    setAudioUrl(URL.createObjectURL(selected));
    setProgress(0);
    setStats(null);
    setError(null);
    setLoading(true);

    let current = 0;
    const interval = setInterval(() => {
      current += 10;
      setProgress(current);
      if (current >= 100) clearInterval(interval);
    }, 120);

    try {
      const result = await fetchAnalysisResult(selected);

      setStats(result.stats);
      setSpeedData(result.speedData);
      setPitchAndVolumeData(result.pitchAndVolumeData);
      setFillerData(result.fillerData);
      setPauseData(result.pauseData);
      setTips(result.tips);
    } catch (err) {
      setError('분석 실패: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleReplay = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    audioRef.current?.play();
  };

  const handleReload = () => window.location.reload();

  return (
    <div className="container mx-auto p-8 space-y-12">
      {/* 파일 업로드 */}
      <div className="max-w-xl mx-auto p-8 border border-gray-200 bg-[#f7f9fc] rounded-lg text-center">
        <Mic2 className="mx-auto mb-4 w-12 h-12 text-gray-400" />
        <h3 className="text-lg font-medium mb-2">음성 파일 업로드</h3>
        <p className="text-sm text-gray-500 mb-4">.mp3, .wav, .ogg 지원</p>
        <input
          type="file"
          ref={fileInputRef}
          accept=".mp3,.wav,.ogg"
          className="hidden"
          onChange={handleFileSelect}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-6 py-3 bg-white rounded-full border border-gray-300 hover:bg-gray-100 transition"
        >
          파일 선택
        </button>
      </div>

      {/* 분석 상태 */}
      {file && progress < 100 && (
        <div className="max-w-xl mx-auto">
          <progress value={progress} max="100" className="custom-progress w-full h-2 mb-2" />
          <p className="text-sm text-gray-600">음성 분석 중… {progress}%</p>
        </div>
      )}

      {/* 에러 메시지 */}
      {error && (
        <div className="text-center text-red-500">
          <p>{error}</p>
        </div>
      )}

      {/* 오디오 플레이어 */}
      {audioUrl && (
        <>
          <audio
            ref={audioRef}
            src={audioUrl}
            className="hidden"
            onLoadedMetadata={() => setDuration(audioRef.current.duration)}
            onTimeUpdate={() => setCurrentTime(audioRef.current.currentTime)}
          />
          <div ref={playerRef} className="flex items-center space-x-4 mt-4 max-w-xl mx-auto">
            <button
              onClick={() => {
                if (audioRef.current.paused) audioRef.current.play();
                else audioRef.current.pause();
              }}
              className="px-3 py-1 border rounded"
            >
              {audioRef.current?.paused ? '▶︎' : '❚❚'}
            </button>
            <input
              type="range"
              min="0"
              max={duration}
              value={currentTime}
              onChange={e => {
                const t = Number(e.target.value);
                audioRef.current.currentTime = t;
                setCurrentTime(t);
              }}
              className="flex-1"
            />
            <span className="text-sm">
              {Math.floor(currentTime)} / {Math.floor(duration)} sec
            </span>
          </div>
        </>
      )}

      {/* 결과 요약 */}
      {progress === 100 && stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-6">
          <ResultCard icon={<Clock />} value={`${stats.speed} wpm`} label="말하기 속도" />
          <ResultCard icon={<CheckCircle />} value={`${stats.accuracy}%`} label="발음 정확도" />
          <ResultCard icon={<Slash />} value={`${stats.fillerCount}회`} label="불필요 단어" />
          <ResultCard icon={<PauseCircle />} value={`${stats.pauseAvg}s`} label="어간 공백" />
          <ResultCard icon={<Activity />} value="Moderate" label="억양 변화" />
          <ResultCard icon={<Volume2 />} value="85%" label="음량 균일성" />
        </div>
      )}

      {/* 차트들 */}
      {progress === 100 && (
        <section className="mt-12 grid grid-cols-1 sm:grid-cols-2 gap-6 justify-items-center">
          <ChartCard title="속도 변화" chart={
            <LineChart data={speedData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="time" /><YAxis /><RechartsTooltip /><Line type="monotone" dataKey="speed" stroke="#5686C4" strokeWidth={2} /></LineChart>
          } />
          <ChartCard title="억양·음량" chart={
            <LineChart data={pitchAndVolumeData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="x" />
              <YAxis yAxisId="left" />
              <YAxis yAxisId="right" orientation="right" />
              <RechartsTooltip />
              <Line yAxisId="left" type="monotone" dataKey="pitch" stroke="#826BC6" strokeWidth={2} />
              <Line yAxisId="right" type="monotone" dataKey="volume" stroke="#3EB489" strokeWidth={2} />
            </LineChart>
          } />
          <ChartCard title="불필요 단어" chart={
            <BarChart data={fillerData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="word" /><YAxis /><RechartsTooltip /><Bar dataKey="count" fill="#5686C4" barSize={20} /></BarChart>
          } />
          <ChartCard title="어간 공백 길이" chart={
            <BarChart data={pauseData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="length" /><YAxis /><RechartsTooltip /><Bar dataKey="freq" fill="#5686C4" barSize={20} /></BarChart>
          } />
        </section>
      )}

      {/* 팁 */}
      {progress === 100 && tips.length > 0 && (
        <section className="mt-12 bg-white p-8 border border-gray-100 rounded-lg">
          <h3 className="text-xl font-bold text-[#826BC4] mb-4">개선 제안</h3>
          <ul className="list-disc pl-6 space-y-2 text-gray-700">
            {tips.map((tip, i) => <li key={i}>{tip}</li>)}
          </ul>
        </section>
      )}

      {/* 버튼 */}
      {progress === 100 && (
        <div className="flex justify-end space-x-4 mt-8">
          <button onClick={handleReplay} className="px-6 py-3 bg-[#3EB489] text-white font-semibold rounded-lg hover:bg-[#36A778] transition">
            음성 재생
          </button>
          <button onClick={handleReload} className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-100 transition">
            다시 분석하기
          </button>
        </div>
      )}
    </div>
  );
}

// 컴포넌트들
function ResultCard({ icon, value, label }) {
  return (
    <div className="p-6 border rounded-lg bg-white text-center">
      <div className="mx-auto mb-2 w-8 h-8 text-[#5686C4]">{icon}</div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-gray-500">{label}</p>
    </div>
  );
}

function ChartCard({ title, chart }) {
  return (
    <div className="p-4 bg-white border border-gray-100 rounded-lg w-full max-w-md">
      <h4 className="text-md font-semibold text-[#5686C4] mb-2 text-center">{title}</h4>
      <ResponsiveContainer width="100%" height={200}>
        {chart}
      </ResponsiveContainer>
    </div>
  );
}
