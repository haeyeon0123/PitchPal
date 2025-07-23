import React, { useState, useRef } from 'react';
import { Video } from 'lucide-react';
import axios from 'axios';
import './Analysis_Video.css';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer
} from 'recharts';

export default function AnalysisVideo() {
  const [fileUrl, setFileUrl] = useState(null);
  const [progress, setProgress] = useState(0);
  const [pitchData, setPitchData] = useState([]);
  const [poseRatio, setPoseRatio] = useState(null);
  const [blinkTimeline, setBlinkTimeline] = useState([]);
  const [blinkSummary, setBlinkSummary] = useState(null);
  const [tips, setTips] = useState([]);
  const [error, setError] = useState(null);

  const fileInputRef = useRef(null);
  const videoRef = useRef(null);

  const fetchVideoAnalysis = async (file) => {
    await new Promise((r) => setTimeout(r, 1000));
    return {
      head_pose_ratios: {
        looking_up: 0.1,
        looking_front: 0.6,
        looking_down: 0.3,
      },
      pitch_by_frame: [
        { time_sec: 0, pitch_deg: 2.1 },
        { time_sec: 1, pitch_deg: 1.8 },
        { time_sec: 2, pitch_deg: 4.2 },
        { time_sec: 3, pitch_deg: -6.2 },
        { time_sec: 4, pitch_deg: -8.7 },
      ],
      blink_summary: {
        duration: "2분 30초",
        blink_count: 47,
        blinks_per_min: 18.8,
        grade: "정상",
        interpretation: "안정된 상태입니다.",
      },
      blink_timeline: [
        { frame: 1, blink: 0 },
        { frame: 2, blink: 1 },
        { frame: 3, blink: 0 },
        { frame: 4, blink: 1 },
        { frame: 5, blink: 0 },
      ],
      tips: ["고개를 너무 자주 숙이지 않도록 해보세요.", "눈 깜빡임 속도는 좋습니다."],
    };
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileUrl(URL.createObjectURL(file));
    setError(null);
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

    try {
      const result = await fetchVideoAnalysis(file);
      setPoseRatio(result.head_pose_ratios || {});
      setPitchData(result.pitch_by_frame || []);
      setBlinkTimeline(result.blink_timeline || []);
      setBlinkSummary(result.blink_summary || null);
      setTips(result.tips || []);
    } catch (err) {
      setError('분석 실패: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handlePlayVideo = () => {
    if (videoRef.current) {
      videoRef.current.play();
      videoRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleReload = () => window.location.reload();

  return (
    <div className="container mx-auto p-8 space-y-12">
      {progress < 100 && (
        <div className="max-w-xl mx-auto p-8 border border-gray-200 bg-[#f7f9fc] rounded-lg text-center">
          <Video className="mx-auto mb-4 w-12 h-12 text-gray-400" />
          <h3 className="text-lg font-medium mb-2">영상 파일 업로드</h3>
          <p className="text-sm text-gray-500 mb-4">.mp4, .mov, .avi 지원</p>
          <input type="file" ref={fileInputRef} accept=".mp4,.mov,.avi" className="hidden" onChange={handleFileSelect} />
          <button onClick={() => fileInputRef.current?.click()} className="px-6 py-3 bg-white rounded-full border border-gray-300 hover:bg-gray-100 transition">파일 선택</button>
        </div>
      )}

      {fileUrl && progress < 100 && (
        <div className="max-w-xl mx-auto">
          <progress value={progress} max="100" className="custom-progress w-full h-2 mb-2" />
          <p className="text-sm text-gray-600">영상 분석 중… {progress}%</p>
        </div>
      )}

      {error && <div className="text-center text-red-500">{error}</div>}

      {progress === 100 && (
        <>
          <div className="flex flex-col lg:flex-row gap-8 items-start">
            <div className="max-w-xl w-full p-8 border border-gray-200 bg-[#f7f9fc] rounded-lg text-center">
              <Video className="mx-auto mb-4 w-12 h-12 text-gray-400" />
              <h3 className="text-lg font-medium mb-2">다른 영상 업로드</h3>
              <p className="text-sm text-gray-500 mb-4">.mp4, .mov, .avi 지원</p>
              <input type="file" ref={fileInputRef} accept=".mp4,.mov,.avi" className="hidden" onChange={handleFileSelect} />
              <button onClick={() => fileInputRef.current?.click()} className="px-6 py-3 bg-white rounded-full border border-gray-300 hover:bg-gray-100 transition">파일 선택</button>
            </div>
            <div className="w-full lg:flex-1">
              <div className="rounded-lg overflow-hidden shadow max-w-2xl mx-auto">
                <video ref={videoRef} controls className="w-full h-auto object-contain" src={fileUrl} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <ChartCard title="고개 방향 비율" chart={
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie dataKey="value" nameKey="name" data={poseRatio ? [
                    { name: "위", value: poseRatio.looking_up },
                    { name: "정면", value: poseRatio.looking_front },
                    { name: "아래", value: poseRatio.looking_down }
                  ] : []} innerRadius={40} outerRadius={80} label>
                    <Cell fill="#3b82f6" />
                    <Cell fill="#10b981" />
                    <Cell fill="#ef4444" />
                  </Pie>
                  <RechartsTooltip />
                </PieChart>
              </ResponsiveContainer>
            } />
            <ChartCard title="Pitch 변화 (도)" chart={
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={pitchData}>
                  <XAxis dataKey="time_sec" />
                  <YAxis />
                  <CartesianGrid strokeDasharray="3 3" />
                  <RechartsTooltip />
                  <Line type="monotone" dataKey="pitch_deg" stroke="#6366f1" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            } />
            <ChartCard title="눈 깜빡임 여부" chart={
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={blinkTimeline}>
                  <XAxis dataKey="frame" />
                  <YAxis ticks={[0, 1]} />
                  <CartesianGrid strokeDasharray="3 3" />
                  <RechartsTooltip />
                  <Bar dataKey="blink" fill="#3EB489" />
                </BarChart>
              </ResponsiveContainer>
            } />
          </div>

          {blinkSummary && (
            <div className="bg-white rounded-xl p-6 border border-gray-200 mt-16">
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">💬 눈 깜빡임 요약</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="text-center">
                  <p className="text-sm text-gray-500">영상 길이</p>
                  <p className="text-xl font-semibold text-indigo-600 mt-1">{blinkSummary.duration}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-500">깜빡임 수</p>
                  <p className="text-xl font-semibold text-indigo-600 mt-1">{blinkSummary.blink_count}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-500">분당 깜빡임</p>
                  <p className="text-xl font-semibold text-indigo-600 mt-1">{blinkSummary.blinks_per_min}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-500">평가 등급</p>
                  <p className="text-xl font-semibold text-indigo-600 mt-1">{blinkSummary.grade}</p>
                </div>
              </div>
              <p className="text-sm text-gray-600 mt-4 text-center italic">{blinkSummary.interpretation}</p>
            </div>
          )}

          {tips.length > 0 && (
            <section className="mt-12 bg-white p-6 rounded-xl border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">💡 개선 제안</h3>
              <ul className="space-y-2 text-gray-700 list-disc list-inside text-sm">
                {tips.map((tip, i) => (
                  <li key={i} className="leading-relaxed">
                    <span className="mr-2 text-green-500">✔️</span>{tip}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="flex justify-end space-x-4 mt-8">
            <button onClick={handlePlayVideo} className="px-6 py-3 bg-[#3EB489] text-white font-semibold rounded-lg hover:bg-[#36A778] transition">영상 재생</button>
            <button onClick={handleReload} className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-100 transition">다시 분석하기</button>
          </div>
        </>
      )}
    </div>
  );
}

function ChartCard({ title, chart }) {
  return (
    <div className="p-4 bg-white border rounded-lg w-full">
      <h4 className="text-md font-semibold text-[#5686C4] mb-2 text-center">{title}</h4>
      {chart}
    </div>
  );
}
