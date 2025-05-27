/* 영상 분석 페이지: 기능 및 디자인 */

import React, { useState, useRef } from 'react';
import './Analysis_Video.css';
import { Video, Camera, Eye, Smile, Target } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer
} from 'recharts';

export default function AnalysisVideo() {
  const [fileUrl, setFileUrl] = useState(null);
  const [progress, setProgress] = useState(0);
  const [angleData, setAngleData] = useState([]);
  const [blinkData, setBlinkData] = useState([]);
  const [expressionData, setExpressionData] = useState([]);
  const [tips, setTips] = useState([]);
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);

  const handleFileSelect = e => {
    const file = e.target.files[0];
    if (!file) return;
    setFileUrl(URL.createObjectURL(file));
    setProgress(0);
    const interval = setInterval(() => {
      setProgress(p => {
        const next = p + 10;
        if (next >= 100) { clearInterval(interval); return 100; }
        return next;
      });
    }, 200);
    // placeholder data
    setAngleData([
      { angle: -5, freq: 3 },
      { angle: 0, freq: 10 },
      { angle: 5, freq: 2 }
    ]);
    setBlinkData([
      { time: '0s', blinks: 2 },
      { time: '10s', blinks: 3 },
      { time: '20s', blinks: 1 }
    ]);
    setExpressionData([
      { expr: 'Neutral', value: 40 },
      { expr: 'Smile', value: 35 },
      { expr: 'Frown', value: 25 }
    ]);
    setTips([
      '머리 각도가 평균 ±3°보다 큽니다. 정면을 유지해 보세요.',
      '눈 깜빡임이 15회/분으로 다소 빈번합니다.',
      '표정 변화가 활발하여 주의 집중이 분산될 수 있습니다.'
    ]);
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
      {/* 1. 영상 파일 업로드 */}
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

      {/* 2. 분석 진행 상태 */}
      {fileUrl && progress < 100 && (
        <div className="max-w-xl mx-auto">
         <progress value={progress} max="100" className="custom-progress w-full h-2 mb-2"/>
          <p className="text-sm text-gray-600">영상 분석 중… {progress}%</p>
        </div>
      )}

      {progress === 100 && (
        <>
          {/* 3. 요약 대시보드 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            <div className="p-6 border rounded-lg bg-white text-center">
              <Camera className="mx-auto mb-2 w-8 h-8 text-[#5686C4]" />
              <p className="text-2xl font-bold">±3°</p>
              <p className="text-gray-500">각도 편차</p>
            </div>
            <div className="p-6 border rounded-lg bg-white text-center">
              <Eye className="mx-auto mb-2 w-8 h-8 text-[#5686C4]" />
              <p className="text-2xl font-bold">15회/분</p>
              <p className="text-gray-500">눈 깜빡임 빈도</p>
            </div>
            <div className="p-6 border rounded-lg bg-white text-center">
              <Smile className="mx-auto mb-2 w-8 h-8 text-[#5686C4]" />
              <p className="text-2xl font-bold">Moderate</p>
              <p className="text-gray-500">표정 변화</p>
            </div>
            <div className="p-6 border rounded-lg bg-white text-center">
              <Target className="mx-auto mb-2 w-8 h-8 text-[#5686C4]" />
              <p className="text-2xl font-bold">82%</p>
              <p className="text-gray-500">시선 집중도</p>
            </div>
          </div>

          {/* 4. 영상 플레이어 & 히트맵 */}
          <div className="flex flex-col lg:flex-row gap-8">
            <video ref={videoRef} controls className="w-full lg:w-1/2 rounded-lg shadow" src={fileUrl} />
            <div className="w-full lg:w-1/2 bg-white border rounded-lg p-4">
              <h4 className="text-lg font-semibold text-[#5686C4] mb-2">시선 히트맵</h4>
              <div className="w-full h-64 bg-gray-100 flex items-center justify-center">Heatmap Placeholder</div>
            </div>
          </div>

          {/* 5. 상세 차트 섹션 */}
          <section className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-6 justify-items-center">
            <div className="p-6 bg-white border border-gray-100 rounded-lg w-full max-w-md">
              <h4 className="text-lg font-semibold text-[#5686C4] mb-4 text-center">각도 분포</h4>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={angleData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="angle" />
                  <YAxis />
                  <RechartsTooltip />
                  <Bar dataKey="freq" fill="#5686C4" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="p-6 bg-white border border-gray-100 rounded-lg w-full max-w-md">
              <h4 className="text-lg font-semibold text-[#3EB489] mb-4 text-center">눈 깜빡임</h4>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={blinkData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" />
                  <YAxis />
                  <RechartsTooltip />
                  <Line type="monotone" dataKey="blinks" stroke="#3EB489" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="p-6 bg-white border border-gray-100 rounded-lg w-full max-w-md">
              <h4 className="text-lg font-semibold text-[#826BC6] mb-4 text-center">표정 변화</h4>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={expressionData} dataKey="value" nameKey="expr" innerRadius={40} outerRadius={80} label>
                    {expressionData.map((entry, index) => (
                      <Cell key={index} fill={['#826BC6','#5686C4','#3EB489'][index % 3]} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* 6. 개선 제안 섹션 */}
          <section className="mt-12 bg-white p-8 border border-gray-100 rounded-lg">
            <h3 className="text-xl font-bold text-[#826BC4] mb-4">개선 제안</h3>
            <ul className="list-disc pl-6 space-y-2 text-gray-700">
              {tips.map((tip, i) => (
                <li key={i}>{tip}</li>
              ))}
            </ul>
          </section>

          {/* 7. 영상 재생 & 다시 분석하기 */}
          <div className="flex justify-end space-x-4 mt-8">
            <button
              onClick={handlePlayVideo}
              className="px-6 py-3 bg-[#3EB489] text-white font-semibold rounded-lg hover:bg-[#36A778] transition font-bold"
            >
              영상 재생
            </button>
            <button
              onClick={handleReload}
              className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-100 transition"
            >
              다시 분석하기
            </button>
          </div>
        </>
      )}
    </div>
  );
}
