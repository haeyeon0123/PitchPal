import React, { useState, useRef, useEffect } from 'react';
import { Video } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip,
  PieChart, Pie, Cell, ResponsiveContainer
} from 'recharts';

const COLORS = ['#EF4444', '#60A5FA', '#22C55E'];

export default function AnalysisVideo() {
  const [fileUrl, setFileUrl] = useState(null);
  const [emotion, setEmotion] = useState(null);
  const [blink, setBlink] = useState(null);
  const [pose, setPose] = useState(null);

  const fileInputRef = useRef(null);
  const videoRef = useRef(null);

  // ✅ 더미 데이터
  useEffect(() => {
    setEmotion({
      dominant: 'sad',
      distribution: [
        { emotion: 'happy', percentage: 15 },
        { emotion: 'sad', percentage: 55 },
        { emotion: 'neutral', percentage: 30 }
      ],
      feedback: '슬픈 표정이 자주 감지되었습니다. 보다 안정감 있는 표정을 연습해보세요.'
    });
    setBlink({
      count: 65,
      bpm: 28.5,
      grade: '주의',
      interpretation: '약간의 긴장 상태입니다. 천천히 호흡하며 발표해보세요.'
    });
    setPose({
      down: 58,
      front: 32,
      up: 10,
      dominant: 'looking down',
      warning: true
    });
  }, []);

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileUrl(URL.createObjectURL(file));
  };

  const handlePlayVideo = () => {
    videoRef.current?.play();
    videoRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleReload = () => window.location.reload();

  return (
    <div className="container mx-auto p-8 space-y-12">
      {/* 업로드 박스 */}
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

      {/* 분석 결과 */}
      {fileUrl && (
        <div className="space-y-12">

          {/* 📊 상단 요약 KPI 카드 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {emotion && (
              <div className="bg-white shadow rounded-lg p-4 text-center space-y-1">
                <div className="text-2xl">😐</div>
                <p className="text-sm text-gray-500">가장 많이 나타난 감정</p>
                <p className="text-indigo-600 font-bold">{emotion.dominant}</p>
              </div>
            )}

            {blink && (
              <div className="bg-white shadow rounded-lg p-4 text-center space-y-1">
                <div className="text-2xl">👁️</div>
                <p className="text-sm text-gray-500">깜빡임 수</p>
                <p className="text-gray-800 font-bold">{blink.count}회</p>
                <p className="text-sm text-gray-400">{blink.bpm}회/분</p>
              </div>
            )}

            {pose && (
              <div className="bg-white shadow rounded-lg p-4 text-center space-y-1">
                <div className="text-2xl">🙆‍♂️</div>
                <p className="text-sm text-gray-500">가장 많은 시선 방향</p>
                <p className="text-gray-800 font-bold">{pose.dominant}</p>
              </div>
            )}
          </div>

          {/* 감정 분석 */}
          {emotion && (
            <section className="bg-white border rounded-xl shadow p-6 space-y-4">
              <h2 className="text-xl font-semibold">😐 감정 분석</h2>
              <p>
                가장 자주 나타난 감정:{' '}
                <span className="text-indigo-600 font-bold">{emotion.dominant}</span>
              </p>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={emotion.distribution}>
                    <XAxis dataKey="emotion" />
                    <YAxis />
                    <RechartsTooltip />
                    <Bar dataKey="percentage" fill="#A68ED5" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-sm text-gray-600">{emotion.feedback}</p>
            </section>
          )}

          {/* 불안도 분석 */}
          {blink && (
            <section className="bg-white border rounded-xl shadow p-6 space-y-2">
              <h2 className="text-xl font-semibold">👁️ 불안도 분석</h2>
              <p>총 깜빡임 수: <span className="font-bold">{blink.count}</span></p>
              <p>깜빡임 빈도: <span className="font-bold">{blink.bpm} 회/분</span></p>
              <p>
                평가 등급:{' '}
                <span className={`font-bold ${blink.grade === '정상'
                  ? 'text-green-600'
                  : blink.grade === '주의'
                    ? 'text-orange-500'
                    : 'text-red-600'}`}>
                  {blink.grade}
                </span>
              </p>
              <p className="text-sm text-gray-600">{blink.interpretation}</p>
            </section>
          )}

          {/* 시선 분석 */}
          {pose && (
            <section className="bg-white border rounded-xl shadow p-6 space-y-4">
              <h2 className="text-xl font-semibold">🙆‍♂️ 시선 분석</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Down', value: pose.down },
                          { name: 'Front', value: pose.front },
                          { name: 'Up', value: pose.up }
                        ]}
                        dataKey="value"
                        nameKey="name"
                        outerRadius={80}
                        label
                      >
                        {COLORS.map((color, idx) => (
                          <Cell key={idx} fill={color} />
                        ))}
                      </Pie>
                      <RechartsTooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2 text-sm text-gray-700">
                  <p>시선 비율: Down {pose.down}% / Front {pose.front}% / Up {pose.up}%</p>
                  <p>가장 많은 시선 방향: <span className="font-bold">{pose.dominant}</span></p>
                  {pose.warning && (
                    <p className="text-red-600 font-semibold bg-red-50 px-3 py-2 rounded-md">
                      ⚠ 고개를 너무 숙이고 있어요. 발표 시 시선을 들어주세요!
                    </p>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* 영상 재생 및 버튼 */}
          <div className="mt-6">
            <video ref={videoRef} controls className="w-full rounded-lg shadow" src={fileUrl} />
            <div className="flex justify-end space-x-4 mt-4">
              <button onClick={handlePlayVideo} className="px-6 py-3 bg-[#3EB489] text-white font-semibold rounded-lg hover:bg-[#36A778] transition">영상 재생</button>
              <button onClick={handleReload} className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-100 transition">다시 분석하기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}