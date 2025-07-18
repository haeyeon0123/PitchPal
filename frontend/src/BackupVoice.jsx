/* 음성 분석 페이지: 기능 및 디자인(더미데이터 Ver.) */

import React, { useState, useRef } from 'react';
import './Analysis_Voice.css'; 
import {
  Mic2,
  Clock,
  CheckCircle,
  Slash,
  PauseCircle,
  Activity,
  Volume2
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  BarChart,
  Bar,
  ResponsiveContainer
} from 'recharts';

export default function AnalysisVoice() {
  const [file, setFile] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState({
    speed: 0,
    accuracy: 0,
    fillerCount: 0,
    pauseAvg: 0
  });
  const [currentTime, setCurrentTime] = useState(0);
  const [duration,    setDuration]    = useState(0);
  const [speedData, setSpeedData] = useState([]);
  const [pitchAndVolumeData, setPitchAndVolumeData] = useState([]);
  const [fillerData, setFillerData] = useState([]);
  const [pauseData, setPauseData] = useState([]);
  const [tips, setTips] = useState([]);
  const fileInputRef = useRef(null);
  const audioRef = useRef(null);
  const playerRef = useRef(null);

  const handleFileSelect = e => {
    const selected = e.target.files[0];
    if (!selected) return;
    setFile(selected);
    const url = URL.createObjectURL(selected);
    setAudioUrl(url);
    setProgress(0);

    const interval = setInterval(() => {
      setProgress(p => {
        const next = p + 10;
        if (next >= 100) {
          clearInterval(interval);
          // 예시 데이터 세팅
          setStats({ speed: 120, accuracy: 92, fillerCount: 5, pauseAvg: 1.2 });
          setSpeedData([
            { time: '0s', speed: 110 },
            { time: '10s', speed: 125 },
            { time: '20s', speed: 118 },
            { time: '30s', speed: 130 }
          ]);
          setPitchAndVolumeData([
            { x: 0, pitch: 200, volume: 0.8 },
            { x: 1, pitch: 220, volume: 0.7 },
            { x: 2, pitch: 210, volume: 0.85 }
          ]);
          setFillerData([
            { word: '음', count: 3 },
            { word: '어', count: 2 }
          ]);
          setPauseData([
            { length: 0.5, freq: 4 },
            { length: 1.2, freq: 2 },
            { length: 2.0, freq: 1 }
          ]);
          setTips([
            '말하기 속도가 약간 빠릅니다. 100–110 wpm으로 조절해 보세요.',
            '불필요 단어가 5회 발견되었습니다. 의식적으로 제거해 보세요.',
            '어간 공백이 평균 1.2초로 다소 깁니다. 0.5초 이하로 유지하세요.',
            '억양 변화를 적절히 활용해 발표를 생동감 있게 만드세요.'
          ]);
          return 100;
        }
        return next;
      });
    }, 200);
  };

  const handleReplay = () => {
  +  // 페이지 최상단으로 스크롤
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  if (audioRef.current) {
    audioRef.current.play();
  }
};


  const handleReload = () => {
    window.location.reload();
  };

  return (
    <div className="container mx-auto p-8 space-y-12">
      {/* 1. 음성 파일 업로드 */}
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

      {/* 2. 분석 진행 상태 */}
      {file && progress < 100 && (
        <div className="max-w-xl mx-auto">
         <progress
           value={progress}
           max="100"
           className="custom-progress w-full h-2 mb-2"
        />
          <p className="text-sm text-gray-600">음성 분석 중… {progress}%</p>
        </div>
      )}

      {/* 오디오 엘리먼트 */}
      {audioUrl && (
        <audio
            ref={audioRef}
            src={audioUrl}
            className="hidden"
            onLoadedMetadata={() => setDuration(audioRef.current.duration)}
            onTimeUpdate={() => setCurrentTime(audioRef.current.currentTime)}
        />
      )}

      {audioUrl && (
        <div
        ref={playerRef}                              // ← 이 줄 추가
        className="flex items-center space-x-4 mt-4 max-w-xl mx-auto"
        >
    {/* 재생/일시정지 버튼 */}
    <button
      onClick={() => {
        if (audioRef.current.paused) audioRef.current.play();
        else audioRef.current.pause();
      }}
      className="px-3 py-1 border rounded"
    >
      {audioRef.current?.paused ? '▶︎' : '❚❚'}
    </button>

    {/* 구간이동 슬라이더 */}
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

    {/* 시간 표시 */}
    <span className="text-sm">
      {Math.floor(currentTime)} / {Math.floor(duration)} sec
    </span>
  </div>
)}


      {/* 3. 요약 대시보드 */}
      {progress === 100 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-6">
          <div className="p-6 border rounded-lg bg-white text-center">
            <Clock className="mx-auto mb-2 w-8 h-8 text-[#5686C4]" />
            <p className="text-2xl font-bold">{stats.speed} wpm</p>
            <p className="text-gray-500">말하기 속도</p>
          </div>
          <div className="p-6 border rounded-lg bg-white text-center">
            <CheckCircle className="mx-auto mb-2 w-8 h-8 text-[#5686C4]" />
            <p className="text-2xl font-bold">{stats.accuracy}%</p>
            <p className="text-gray-500">발음 정확도</p>
          </div>
          <div className="p-6 border rounded-lg bg-white text-center">
            <Slash className="mx-auto mb-2 w-8 h-8 text-[#5686C4]" />
            <p className="text-2xl font-bold">{stats.fillerCount}회</p>
            <p className="text-gray-500">불필요 단어</p>
          </div>
          <div className="p-6 border rounded-lg bg-white text-center">
            <PauseCircle className="mx-auto mb-2 w-8 h-8 text-[#5686C4]" />
            <p className="text-2xl font-bold">{stats.pauseAvg}s</p>
            <p className="text-gray-500">어간 공백</p>
          </div>
          <div className="p-6 border rounded-lg bg-white text-center">
            <Activity className="mx-auto mb-2 w-8 h-8 text-[#5686C4]" />
            <p className="text-2xl font-bold">Moderate</p>
            <p className="text-gray-500">억양 변화</p>
          </div>
          <div className="p-6 border rounded-lg bg-white text-center">
            <Volume2 className="mx-auto mb-2 w-8 h-8 text-[#5686C4]" />
            <p className="text-2xl font-bold">85%</p>
            <p className="text-gray-500">음량 균일성</p>
          </div>
        </div>
      )}

      {/* 4. 시각화 차트 섹션 (2×2 레이아웃) */}
{progress === 100 && (
  <section className="mt-12 grid grid-cols-1 sm:grid-cols-2 gap-6 justify-items-center">
    {/* 속도 변화 */}
    <div className="p-4 bg-white border border-gray-100 rounded-lg w-full max-w-md">
      <h4 className="text-md font-semibold text-[#5686C4] mb-2 text-center">
        속도 변화
      </h4>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={speedData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="time" />
          <YAxis />
          <RechartsTooltip />
          <Line type="monotone" dataKey="speed" stroke="#5686C4" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
    {/* 억양·음량 */}
    <div className="p-4 bg-white border border-gray-100 rounded-lg w-full max-w-md">
      <h4 className="text-md font-semibold text-[#5686C4] mb-2 text-center">
        억양·음량
      </h4>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={pitchAndVolumeData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="x" />
          <YAxis yAxisId="left" />
          <YAxis yAxisId="right" orientation="right" />
          <RechartsTooltip />
          <Line yAxisId="left" type="monotone" dataKey="pitch" stroke="#826BC6" strokeWidth={2} />
          <Line yAxisId="right" type="monotone" dataKey="volume" stroke="#3EB489" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
    {/* 불필요 단어 */}
    <div className="p-4 bg-white border border-gray-100 rounded-lg w-full max-w-md">
      <h4 className="text-md font-semibold text-[#5686C4] mb-2 text-center">
        불필요 단어
      </h4>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={fillerData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="word" />
          <YAxis />
          <RechartsTooltip />
          <Bar dataKey="count" fill="#5686C4" barSize={20} />
        </BarChart>
      </ResponsiveContainer>
    </div>
    {/* 어간 공백 길이 */}
    <div className="p-4 bg-white border border-gray-100 rounded-lg w-full max-w-md">
      <h4 className="text-md font-semibold text-[#5686C4] mb-2 text-center">
        어간 공백 길이
      </h4>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={pauseData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="length" />
          <YAxis />
          <RechartsTooltip />
          <Bar dataKey="freq" fill="#5686C4" barSize={20} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  </section>
)}


      {/* 5. 개선 제안 & 팁 */}
      {progress === 100 && (
        <section className="mt-12 bg-white p-8 border border-gray-100 rounded-lg">
          <h3 className="text-xl font-bold text-[#826BC4] mb-4">개선 제안</h3>
          <ul className="list-disc pl-6 space-y-2 text-gray-700">
            {tips.map((tip, i) => (
              <li key={i}>{tip}</li>
            ))}
          </ul>
        </section>
      )}

      {/* 6. 음성 재생 & 다시 분석하기 */}
      {progress === 100 && (
        <div className="flex justify-end space-x-4 mt-8">
          <button
            onClick={handleReplay}
            className="px-6 py-3 bg-[#3EB489] text-white font-semibold rounded-lg hover:bg-[#36A778] transition"
          >
            음성 재생
          </button>
          <button
            onClick={handleReload}
            className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-100 transition"
          >
            다시 분석하기
          </button>
        </div>
      )}
    </div>
  );
}