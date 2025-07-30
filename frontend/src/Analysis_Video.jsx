import React, { useState, useRef } from 'react';
import axios from 'axios';
import './Analysis_Video.css';
import { Video, Eye, Smile, Target } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer
} from 'recharts';

export default function AnalysisVideo() {
  const [fileUrl, setFileUrl] = useState(null);
  const [fileName, setFileName] = useState('');
  const [progress, setProgress] = useState(0);
  const [emotionData, setEmotionData] = useState(null);
  const [blinkData, setBlinkData] = useState(null);
  const [poseData, setPoseData] = useState(null);
  const [tips, setTips] = useState([]);
  const [error, setError] = useState(null);

  const fileInputRef = useRef(null);
  const videoRef = useRef(null);

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileUrl(URL.createObjectURL(file));
    setFileName(file.name);
    setError(null);
    setEmotionData(null);
    setBlinkData(null);
    setPoseData(null);
    setTips([]);
    setProgress(0);

    const interval = setInterval(() => {
      setProgress((p) => {
        const next = p + 10;
        if (next >= 100) {
          clearInterval(interval);
          return 100;
        }
        return next;
      });
    }, 200);

    setTimeout(() => {
      setEmotionData({
        dominant: 'sad',
        distribution: [
          { emotion: 'happy', percentage: 15 },
          { emotion: 'sad', percentage: 55 },
          { emotion: 'neutral', percentage: 30 }
        ],
        feedback: '슬픈 표정이 자주 감지되었습니다. 보다 안정감 있는 표정을 연습해보세요.'
      });

      setBlinkData({
        count: 65,
        bpm: 28.5,
        grade: '주의',
        interpretation: '약간의 긴장 상태입니다. 천천히 호흡하며 발표해보세요.',
        timeline: [
          { time: 0, blinks: 0 },
          { time: 1, blinks: 2 },
          { time: 2, blinks: 5 },
          { time: 3, blinks: 8 },
          { time: 4, blinks: 10 }
        ]
      });

      setPoseData({
        down: 58,
        front: 32,
        up: 10,
        dominant: '하향',
        warning: true
      });

      setTips([
        '카메라를 정면으로 응시하는 연습을 해보세요.',
        '호흡을 안정시키며 말하면 긴장을 완화할 수 있어요.',
        '감정 표현을 일정하게 유지해보세요.'
      ]);
    }, 2500);
  };

  const handlePlayVideo = () => {
    videoRef.current?.play();
    videoRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleReload = () => window.location.reload();

  return (
    <div className="container mx-auto p-6 space-y-8">
      {/* 업로드 및 영상 */}
      {progress === 100 ? (
        <div className="grid md:grid-cols-2 gap-6 items-start">
          <UploadBox fileInputRef={fileInputRef} handleFileSelect={handleFileSelect} fileName={fileName} />
          <video ref={videoRef} controls className="w-[600px] rounded-lg shadow mx-auto" src={fileUrl} />
        </div>
      ) : (
        <div className="max-w-xl mx-auto">
          <UploadBox fileInputRef={fileInputRef} handleFileSelect={handleFileSelect} fileName={fileName} />
        </div>
      )}

      {/* 진행중 */}
      {fileUrl && progress < 100 && (
        <div className="max-w-xl mx-auto text-center">
          <progress value={progress} max="100" className="custom-progress w-full h-2 mb-2" />
          <p className="text-sm text-gray-600">분석 중...</p>
        </div>
      )}

      {error && <div className="text-center text-red-500">{error}</div>}

      {/* 분석 결과 */}
      {progress === 100 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SummaryCard icon={<Smile />} label="감정" value={emotionData?.dominant || '-'} />
            <SummaryCard icon={<Eye />} label="깜빡임" value={`${blinkData?.count || 0}회`} />
            <SummaryCard icon={<Target />} label="시선 방향" value={poseData?.dominant || '-'} />
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* 감정 */}
            <FeedbackCard title="감정 분석" color="#826BC6">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={emotionData?.distribution || []}>
                  <XAxis dataKey="emotion" />
                  <YAxis />
                  <RechartsTooltip />
                  <Bar dataKey="percentage" fill="#A68ED5" />
                </BarChart>
              </ResponsiveContainer>
              <p className="text-sm text-gray-600 mt-2">{emotionData?.feedback}</p>
            </FeedbackCard>

            {/* 시선 */}
            <FeedbackCard title="시선 분석" color="#5686C4">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={[
                    { name: 'Down', value: poseData?.down },
                    { name: 'Front', value: poseData?.front },
                    { name: 'Up', value: poseData?.up }
                  ]} dataKey="value" nameKey="name" outerRadius={80} label>
                    <Cell fill="#EF4444" />
                    <Cell fill="#60A5FA" />
                    <Cell fill="#22C55E" />
                  </Pie>
                  <RechartsTooltip />
                </PieChart>
              </ResponsiveContainer>
              {poseData?.warning && (
                <p className="text-red-600 font-semibold bg-red-50 px-3 py-2 mt-3 rounded-md">
                  ⚠ 고개를 너무 숙이고 있어요. 발표할 때 시선을 들어주세요!
                </p>
              )}
            </FeedbackCard>

            {/* 불안도 */}
            <FeedbackCard title="불안도 분석" color="#3EB489">
              <p>총 깜빡임 수: <strong>{blinkData?.count}</strong>회</p>
              <p>깜빡임 빈도: <strong>{blinkData?.bpm}</strong> 회/분</p>
              <p>등급: <strong className={
                blinkData?.grade === '정상' ? 'text-green-600' :
                blinkData?.grade === '주의' ? 'text-yellow-500' : 'text-red-600'}>{blinkData?.grade}</strong></p>
              <p className="text-sm text-gray-600 mt-2">{blinkData?.interpretation}</p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={blinkData?.timeline || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" />
                  <YAxis />
                  <RechartsTooltip />
                  <Line type="monotone" dataKey="blinks" stroke="#3EB489" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </FeedbackCard>

            {/* 개선 제안 */}
            <FeedbackCard title="개선 제안" color="#826BC4">
              <ul className="list-disc pl-6 space-y-2 text-gray-700">
                {tips.map((tip, i) => <li key={i}>{tip}</li>)}
              </ul>
            </FeedbackCard>
          </div>

          <div className="flex justify-end gap-4 mt-6">
            <button onClick={handlePlayVideo} className="px-6 py-3 bg-[#4FB8A9] text-white font-semibold rounded-lg hover:bg-[#3fa295] transition">영상 재생</button>
            <button onClick={handleReload} className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-100 transition">다시 분석하기</button>
          </div>
        </>
      )}
    </div>
  );
}

function UploadBox({ fileInputRef, handleFileSelect, fileName }) {
  return (
    <div className="max-w-xl w-full p-8 border border-gray-200 bg-[#f7f9fc] rounded-lg text-center mx-auto">
      <Video className="mx-auto mb-4 w-12 h-12 text-gray-400" />
      <h3 className="text-lg font-medium mb-2">영상 파일 업로드</h3>
      <p className="text-sm text-gray-500 mb-4">.mp4, .mov, .avi 지원</p>
      <input
        type="file"
        ref={fileInputRef}
        accept=".mp4,.mov,.avi"
        className="hidden"
        onChange={handleFileSelect}
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        className="px-6 py-3 bg-white rounded-full border border-gray-300 hover:bg-gray-100 transition"
      >
        파일 선택
      </button>
      {fileName && <p className="text-sm text-gray-600 mt-2">📎 {fileName}</p>}
    </div>
  );
}

function SummaryCard({ icon, value, label }) {
  return (
    <div className="p-6 h-40 border rounded-lg bg-white text-center flex flex-col justify-center">
      <div className="mx-auto mb-2 w-8 h-8 text-[#5686C4]">{icon}</div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-gray-500">{label}</p>
    </div>
  );
}

function FeedbackCard({ title, color, children }) {
  return (
    <div className="bg-white p-4 border border-gray-200 rounded-lg">
      <h3 className="text-md font-semibold mb-3" style={{ color }}>{title}</h3>
      {children}
    </div>
  );
}
