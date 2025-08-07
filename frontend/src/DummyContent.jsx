// 내용 분석 페이지(더미데이터 Ver.)

import React, { useState, useRef } from 'react';
import axios from 'axios';
import {
  CloudUpload, ChevronDown, ChevronUp,
  Brain, Repeat, Layout, AlertTriangle, Trash,
  ExternalLink, FileText, Hash, ListChecks
} from 'lucide-react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, ResponsiveContainer
} from 'recharts';
import './Analysis_Content.css';

// ✅ 더미 데이터: 백엔드 연결 전까지는 mock 데이터를 활용한 테스트용
const mockResult = {
  stats: { wordCount: 265, errorCount: 7, avgErrors: 0.6 },
  errors: [
    { original: '잇엇다', suggestion: '있었다', type: '맞춤법' },
    { original: '되였다', suggestion: '되었다', type: '표기법' },
    { original: '불필요하다 생각한다', suggestion: '불필요하다고 생각한다', type: '문법' },
  ],
  originalText: '이 발표는 매우 중요하다고 생각한다. 그러나 잇엇다 되였다 불필요하다 생각한다.',
  correctedText: '이 발표는 매우 중요하다고 생각한다. 그러나 있었다 되었다 불필요하다고 생각한다.',
  highlightedText:
    '이 발표는 매우 중요하다고 생각한다. 그러나 <span style="color:red;">있었다</span> <span style="color:red;">되었다</span> <span style="color:red;">불필요하다고</span> 생각한다.',
  feedback: {
    '일관성': '전체적으로 주제에 대한 집중도가 높고 일관된 내용 흐름을 유지하고 있습니다.',
    '논리성': '초반 주장과 후반 설명 사이에 근거 연결이 약간 부족합니다.',
    '구성': '도입-전개-결론이 대체로 잘 나뉘어 있으나 결론 부분이 약합니다.',
    '주제 일탈': '전체 주제를 벗어나는 문장은 발견되지 않았습니다.',
    '불필요한 내용': '"되었다" 부분은 반복된 표현으로 제거해도 무방합니다.'
  },
  htmlLink: '/model/content/results/corrected_result.html'
};

export default function AnalysisContent() {
  // 📌 상태 정의: 파일, 분석 결과, 진행률, 에러 등
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState(null);
  const [errors, setErrors] = useState([]);
  const [originalText, setOriginalText] = useState('');
  const [correctedText, setCorrectedText] = useState('');
  const [highlightedText, setHighlightedText] = useState('');
  const [feedback, setFeedback] = useState({});
  const [chartData, setChartData] = useState([]);
  const [htmlLink, setHtmlLink] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('highlighted');
  const [openFeedback, setOpenFeedback] = useState({});
  const fileInputRef = useRef(null);

  // 🔄 파일 분석 시작 전 상태 초기화
  const resetStates = () => {
    setStats(null);
    setErrors([]);
    setOriginalText('');
    setCorrectedText('');
    setHighlightedText('');
    setFeedback({});
    setChartData([]);
    setHtmlLink('');
    setError(null);
    setProgress(0);
  };

  // ✅ 분석 결과 파싱 및 상태 업데이트
  const parseResult = (res) => {
    setStats(res.stats);
    setErrors(res.errors);
    setOriginalText(res.originalText);
    setCorrectedText(res.correctedText);
    setHighlightedText(res.highlightedText);
    setFeedback(res.feedback);
    setHtmlLink(res.htmlLink);
    setOpenFeedback(Object.fromEntries(Object.keys(res.feedback).map(k => [k, true])));
    setChartData(Object.entries(res.feedback).map(([k]) => ({ category: k, score: 4 + Math.random() })));
  };

  // 📁 파일 선택 시 상태 저장 + 업로드 시뮬레이션
  const handleFileSelect = (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;
    setFile(selectedFile);
    setFileName(selectedFile.name);
    resetStates();
    simulateUpload();
  };

  // 🕐 분석 진행률 애니메이션 + 더미 데이터 파싱
  const simulateUpload = () => {
    setLoading(true);
    let current = 0;
    const interval = setInterval(() => {
      current += 10;
      setProgress(current);
      if (current >= 100) clearInterval(interval);
    }, 120);

    setTimeout(() => {
      parseResult(mockResult);
      setLoading(false);
    }, 1500);
  };

  // 📋 교정된 텍스트 전체 복사
  const handleApplyAll = () => {
    navigator.clipboard.writeText(correctedText);
    alert('교정된 텍스트가 클립보드에 복사되었습니다.');
  };

  // 🧠 아이콘 매핑: 피드백 유형별 시각적 요소 설정
  const iconMap = {
    '일관성': <Repeat className="w-5 h-5 text-blue-500" />,
    '논리성': <Brain className="w-5 h-5 text-indigo-500" />,
    '구성': <Layout className="w-5 h-5 text-green-500" />,
    '주제 일탈': <AlertTriangle className="w-5 h-5 text-yellow-500" />,
    '불필요한 내용': <Trash className="w-5 h-5 text-red-500" />,
  };

  // ✅ 실제 렌더링
  return (
    <div className="container mx-auto p-8 space-y-20">
      {/* 🔽 파일 업로드 박스 */}
      <div className="max-w-xl mx-auto p-8 border border-gray-200 bg-[#f7f9fc] rounded-lg text-center">
        <CloudUpload className="mx-auto mb-4 w-12 h-12 text-gray-400" />
        <h3 className="text-lg font-medium mb-2">파일 업로드</h3>
        <p className="text-sm text-gray-500 mb-4">.docx, .txt, .pdf 지원</p>
        <input
          type="file"
          ref={fileInputRef}
          accept=".docx,.txt,.pdf"
          className="hidden"
          onChange={handleFileSelect}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-6 py-3 bg-white rounded-full border border-gray-300 hover:bg-gray-100 transition"
        >
          대본 파일 선택
        </button>
        {fileName && <p className="text-sm text-gray-600 mt-2">📄 {fileName}</p>}
      </div>

      {/* 🟡 분석 진행 바 */}
      {file && progress < 100 && (
        <div className="max-w-xl mx-auto text-center">
          <progress value={progress} max="100" className="custom-progress w-full h-2 mb-2" />
          <p className="text-sm text-gray-600">분석 중…</p>
        </div>
      )}

      {/* 🔴 오류 메시지 */}
      {error && <div className="text-center text-red-500">{error}</div>}

      {/* ✅ 맞춤법 분석 결과 표시 */}
      {progress === 100 && stats && (
        <section className="space-y-10">
          <h2 className="text-2xl font-bold text-[#3A5E88] border-b pb-2">📝 맞춤법 교정 피드백</h2>

          {/* 요약 카드 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            <SummaryCard icon={<FileText />} value={stats.wordCount} label="총 단어 수" />
            <SummaryCard icon={<Hash />} value={stats.errorCount} label="오류 건수" />
            <SummaryCard icon={<ListChecks />} value={`${stats.avgErrors} /문장`} label="평균 오류" />
          </div>

          {/* 텍스트 탭 (강조/원본/교정본) */}
          <div className="mt-6">
            <div className="flex flex-wrap gap-2 sm:space-x-4 mb-2">
              <TabButton label="교정 강조" tab="highlighted" activeTab={activeTab} setActiveTab={setActiveTab} />
              <TabButton label="원본 텍스트" tab="original" activeTab={activeTab} setActiveTab={setActiveTab} />
              <TabButton label="교정된 텍스트" tab="corrected" activeTab={activeTab} setActiveTab={setActiveTab} />
            </div>
            <div className="p-4 bg-white border rounded-lg text-gray-800 whitespace-pre-wrap leading-relaxed">
              {activeTab === 'highlighted' && <div dangerouslySetInnerHTML={{ __html: highlightedText }} />}
              {activeTab === 'original' && originalText}
              {activeTab === 'corrected' && correctedText}
            </div>
          </div>

          {/* 오류 리스트 테이블 */}
          {errors.length > 0 && (
            <div className="p-4 bg-white border border-gray-100 rounded-lg overflow-auto min-w-[600px]">
              <table className="w-full text-left">
                <thead>
                  <tr>
                    <th className="py-2">오류 문장</th>
                    <th className="py-2">수정안</th>
                    <th className="py-2">유형</th>
                  </tr>
                </thead>
                <tbody>
                  {errors.map((err, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="py-2 pr-4">{err.original}</td>
                      <td className="py-2 pr-4">{err.suggestion}</td>
                      <td className="py-2">{err.type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ✅ 내용 분석 결과 (레이더차트 + 세부 피드백) */}
      {progress === 100 && chartData.length > 0 && (
        <section className="space-y-10">
          <h2 className="text-2xl font-bold text-[#3A5E88] border-b pb-2">🧠 내용 분석 피드백</h2>

          {/* 레이더 차트 */}
          <div className="p-6 bg-white border rounded-lg">
            <h3 className="text-lg font-semibold mb-4 text-center">내용 분석 점수</h3>
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={chartData} outerRadius={100}>
                <PolarGrid />
                <PolarAngleAxis dataKey="category" />
                <PolarRadiusAxis angle={30} domain={[0, 5]} />
                <Radar name="점수" dataKey="score" stroke="#6EAED5" fill="#6EAED5" fillOpacity={0.6} />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          {/* 세부 피드백 카드 */}
          <div className="grid sm:grid-cols-2 gap-4 pt-2">
            {Object.entries(feedback).map(([key, value], idx) => (
              <div key={idx} className="border border-gray-200 rounded-lg shadow-sm transition-all duration-300">
                <button
                  onClick={() => setOpenFeedback(prev => ({ ...prev, [key]: !prev[key] }))}
                  className="flex items-center justify-between w-full px-5 py-4 text-left bg-white rounded-t-lg hover:bg-gray-50"
                >
                  <div className="flex items-center gap-2 text-lg font-semibold text-gray-800">
                    {iconMap[key] || '📝'} <span>{key}</span>
                  </div>
                  <div className={`transition-transform duration-200 ${openFeedback[key] ? 'rotate-180' : ''}`}>
                    {openFeedback[key] ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </div>
                </button>
                {openFeedback[key] && (
                  <div className="px-6 pb-5 pt-1 text-gray-700 text-[15px] leading-relaxed border-t bg-white rounded-b-lg">
                    {value}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* 하단 버튼들 */}
          <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3 mt-6">
            {htmlLink && (
              <a
                href={htmlLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center space-x-2 px-6 py-3 bg-[#A68ED5] text-white font-semibold rounded-lg hover:bg-[#9373c4] transition"
              >
                <ExternalLink className="w-4 h-4 text-white" />
                <span>맞춤법 교정 결과 보기</span>
              </a>
            )}
            <button
              onClick={handleApplyAll}
              className="px-6 py-3 bg-[#6EAED5] text-white font-semibold rounded-lg hover:bg-[#5C9EC0] transition"
            >
              교정된 텍스트 복사하기
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 border border-gray-300 font-normal rounded-lg hover:bg-gray-100 transition"
            >
              다시 분석하기
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

// ✅ 단어 수 / 오류 수 요약 카드
function SummaryCard({ icon, value, label }) {
  return (
    <div className="p-6 border rounded-lg bg-white text-center">
      <div className="mx-auto mb-2 w-8 h-8 text-[#5686C4]">{icon}</div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-gray-500">{label}</p>
    </div>
  );
}

// ✅ 탭 전환 버튼
function TabButton({ label, tab, activeTab, setActiveTab }) {
  return (
    <button
      onClick={() => setActiveTab(tab)}
      className={`px-4 py-2 rounded font-medium transition ${
        activeTab === tab ? 'bg-[#6EAED5] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      {label}
    </button>
  );
}
