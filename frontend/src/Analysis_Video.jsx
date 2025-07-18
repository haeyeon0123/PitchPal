import React, { useState, useRef } from 'react';
import axios from 'axios';
import './Analysis_Video.css';
import { Video, Camera, Eye, Smile, Target } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer
} from 'recharts';

export default function AnalysisVideo() {
  const [fileUrl, setFileUrl] = useState(null);
  const [progress, setProgress] = useState(0);
  const [angleData, setAngleData] = useState([]);
  const [blinkData, setBlinkData] = useState([]);
  const [expressionData, setExpressionData] = useState([]);
  const [tips, setTips] = useState([]);
  const [error, setError] = useState(null);

  const fileInputRef = useRef(null);
  const videoRef = useRef(null);

  const fetchVideoAnalysis = async (file) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await axios.post('http://localhost:8000/analyze-video', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });

    return response.data;
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileUrl(URL.createObjectURL(file));
    setError(null);
    setAngleData([]);
    setBlinkData([]);
    setExpressionData([]);
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

    try {
      const result = await fetchVideoAnalysis(file);
      setAngleData(result.angleData || []);
      setBlinkData(result.blinkData || []);
      setExpressionData(result.expressionData || []);
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
      <div className="max-w-xl mx-auto p-8 border border-gray-200 bg-[#f7f9fc] rounded-lg text-center">
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
      </div>

      {fileUrl && progress < 100 && (
        <div className="max-w-xl mx-auto">
          <progress value={progress} max="100" className="custom-progress w-full h-2 mb-2" />
          <p className="text-sm text-gray-600">영상 분석 중… {progress}%</p>
        </div>
      )}

      {error && (
        <div className="text-center text-red-500">{error}</div>
      )}

      {progress === 100 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            <SummaryCard icon={<Camera />} label="각도 편차" value="-" />
            <SummaryCard icon={<Eye />} label="눈 깜빡임 빈도" value="-" />
            <SummaryCard icon={<Smile />} label="표정 변화" value="-" />
            <SummaryCard icon={<Target />} label="시선 집중도" value="-" />
          </div>

          <div className="flex flex-col lg:flex-row gap-8">
            <video ref={videoRef} controls className="w-full lg:w-1/2 rounded-lg shadow" src={fileUrl} />
            <div className="w-full lg:w-1/2 bg-white border rounded-lg p-4">
              <h4 className="text-lg font-semibold text-[#5686C4] mb-2">시선 히트맵</h4>
              <div className="w-full h-64 bg-gray-100 flex items-center justify-center">Heatmap Placeholder</div>
            </div>
          </div>

          <section className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-6 justify-items-center">
            <ChartCard title="각도 분포" chart={
              <BarChart data={angleData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="angle" />
                <YAxis />
                <RechartsTooltip />
                <Bar dataKey="freq" fill="#5686C4" />
              </BarChart>
            } />
            <ChartCard title="눈 깜빡임" chart={
              <LineChart data={blinkData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" />
                <YAxis />
                <RechartsTooltip />
                <Line type="monotone" dataKey="blinks" stroke="#3EB489" strokeWidth={2} />
              </LineChart>
            } />
            <ChartCard title="표정 변화" chart={
              <PieChart>
                <Pie data={expressionData} dataKey="value" nameKey="expr" innerRadius={40} outerRadius={80} label>
                  {expressionData.map((entry, i) => (
                    <Cell key={i} fill={['#826BC6','#5686C4','#3EB489'][i % 3]} />
                  ))}
                </Pie>
                <RechartsTooltip />
              </PieChart>
            } />
          </section>

          {tips.length > 0 && (
            <section className="mt-12 bg-white p-8 border border-gray-100 rounded-lg">
              <h3 className="text-xl font-bold text-[#826BC4] mb-4">개선 제안</h3>
              <ul className="list-disc pl-6 space-y-2 text-gray-700">
                {tips.map((tip, i) => <li key={i}>{tip}</li>)}
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

function SummaryCard({ icon, value, label }) {
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
      <ResponsiveContainer width="100%" height={300}>
        {chart}
      </ResponsiveContainer>
    </div>
  );
}
